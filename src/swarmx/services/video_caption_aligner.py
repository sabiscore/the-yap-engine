from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class WordTiming:
    word: str
    start: float
    end: float
    probability: float


def _format_ass_time(seconds: float) -> str:
    total_cs = max(0, round(seconds * 100))
    hours, remainder = divmod(total_cs, 360000)
    minutes, remainder = divmod(remainder, 6000)
    secs, centis = divmod(remainder, 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{centis:02d}"


def _escape_ass(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", " ")


def _ass_color(accent_hex: str) -> str:
    normalized = accent_hex.strip().lstrip("#")
    if not re.fullmatch(r"[0-9a-fA-F]{6}", normalized):
        normalized = "00CCFF"
    red, green, blue = normalized[0:2], normalized[2:4], normalized[4:6]
    return f"{blue}{green}{red}".upper()


def align_audio(audio_path: str, language: str = "en", model_size: str = "small") -> list[WordTiming]:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError(
            "faster-whisper is required for production subtitle alignment; install the video optional dependency"
        ) from exc

    device = os.getenv("SWARMX_WHISPER_DEVICE", "cpu")
    compute_type = os.getenv("SWARMX_WHISPER_COMPUTE_TYPE", "int8" if device == "cpu" else "float16")
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    try:
        segments, _info = model.transcribe(audio_path, language=language, word_timestamps=True, vad_filter=True)
        words: list[WordTiming] = []
        for segment in segments:
            for word in segment.words or []:
                token = word.word.strip()
                if not token:
                    continue
                start = float(word.start)
                end = max(start + 0.01, float(word.end))
                words.append(WordTiming(token, start, end, float(word.probability)))
        return words
    finally:
        del model
        import gc
        gc.collect()


def anchor_asr_to_script(script_text: str, asr_words: list[WordTiming]) -> tuple[list[dict], dict]:
    """
    Aligns Whisper ASR words to canonical script text tokens.
    Uses dynamic programming sequence matching between normalized script tokens and ASR words.
    - Script token spelling and punctuation are preserved.
    - Matched words receive ASR timestamps and probability.
    - Missing/unmatched script words are interpolated with flags: ["interpolated"].
    - Words with probability < 0.5 are flagged as ["low_confidence"].
    - Computes coverage, nativeDriftMedianMs, and maxDriftMs.
    """
    import statistics

    script_tokens = [w for w in re.findall(r"\S+", script_text) if w]
    if not script_tokens:
        return [], {"coverage": 1.0, "nativeDriftMedianMs": 0.0, "maxDriftMs": 0.0}

    if not asr_words:
        avg_word_ms = 300
        words_out = []
        for i, token in enumerate(script_tokens):
            words_out.append({
                "text": token,
                "startMs": i * avg_word_ms,
                "endMs": (i + 1) * avg_word_ms,
                "probability": 0.0,
                "flags": ["interpolated"],
            })
        return words_out, {"coverage": 0.0, "nativeDriftMedianMs": 0.0, "maxDriftMs": 0.0}

    import difflib

    def clean_token(s: str) -> str:
        return re.sub(r"[^\w]", "", s).lower()

    def token_sim(s: str, a: str) -> float:
        if not s or not a:
            return -1.0
        if s == a:
            return 2.0
        # For short tokens (<= 2 characters), require exact match to prevent false positive substring matches
        if len(s) <= 2 or len(a) <= 2:
            return -1.0
        ratio = difflib.SequenceMatcher(None, s, a).quick_ratio()
        if ratio >= 0.80:
            return 1.5
        if ratio >= 0.65:
            return 0.5
        return -1.0

    n = len(script_tokens)
    m = len(asr_words)

    # Needleman-Wunsch alignment
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dp[i][0] = -0.5 * i
    for j in range(m + 1):
        dp[0][j] = -0.5 * j

    for i in range(1, n + 1):
        s_tok = clean_token(script_tokens[i - 1])
        for j in range(1, m + 1):
            a_tok = clean_token(asr_words[j - 1].word)
            sim = token_sim(s_tok, a_tok)
            dp[i][j] = max(
                dp[i - 1][j - 1] + sim,
                dp[i - 1][j] - 0.5,
                dp[i][j - 1] - 0.5,
            )

    i, j = n, m
    matched_script_to_asr: dict[int, int] = {}
    while i > 0 and j > 0:
        s_tok = clean_token(script_tokens[i - 1])
        a_tok = clean_token(asr_words[j - 1].word)
        sim = token_sim(s_tok, a_tok)

        score_diag = dp[i - 1][j - 1] + sim
        score_up = dp[i - 1][j] - 0.5

        if dp[i][j] == score_diag:
            if sim > 0:
                matched_script_to_asr[i - 1] = j - 1
            i -= 1
            j -= 1
        elif dp[i][j] == score_up:
            i -= 1
        else:
            j -= 1

    words_out: list[dict] = []
    matched_count = len(matched_script_to_asr)
    total_audio_ms = max(1000, round(asr_words[-1].end * 1000))

    for idx, token in enumerate(script_tokens):
        if idx in matched_script_to_asr:
            asr = asr_words[matched_script_to_asr[idx]]
            prob = float(asr.probability)
            flags = ["low_confidence"] if prob < 0.5 else []
            s_time = round(asr.start * 1000)
            e_time = max(s_time + 50, round(asr.end * 1000))
            words_out.append({
                "text": token,
                "startMs": s_time,
                "endMs": e_time,
                "probability": round(prob, 4),
                "flags": flags,
            })
        else:
            prev_end = 0
            for p in range(idx - 1, -1, -1):
                if p in matched_script_to_asr:
                    prev_end = round(asr_words[matched_script_to_asr[p]].end * 1000)
                    break
            next_start = total_audio_ms
            for q in range(idx + 1, n):
                if q in matched_script_to_asr:
                    next_start = round(asr_words[matched_script_to_asr[q]].start * 1000)
                    break

            gap_start_idx = 0
            for p in range(idx - 1, -1, -1):
                if p in matched_script_to_asr:
                    gap_start_idx = p + 1
                    break
            gap_end_idx = n
            for q in range(idx + 1, n):
                if q in matched_script_to_asr:
                    gap_end_idx = q
                    break

            gap_len = max(1, gap_end_idx - gap_start_idx)
            safe_next = max(next_start, prev_end + gap_len * 60)
            step = max(50, (safe_next - prev_end) // gap_len)
            offset = idx - gap_start_idx
            s_ms = prev_end + offset * step
            e_ms = s_ms + step

            words_out.append({
                "text": token,
                "startMs": s_ms,
                "endMs": e_ms,
                "probability": 0.0,
                "flags": ["interpolated"],
            })

    # Monotonicity & non-overlap pass
    cursor = 0
    for w in words_out:
        if w["startMs"] < cursor:
            w["startMs"] = cursor
        if w["endMs"] <= w["startMs"]:
            w["endMs"] = w["startMs"] + 60
        cursor = w["startMs"] + 20

    coverage = matched_count / n if n > 0 else 1.0
    drifts: list[float] = []
    for idx, w in enumerate(words_out):
        if "interpolated" not in w["flags"]:
            expected_ms = total_audio_ms * (idx / n)
            drifts.append(abs(w["startMs"] - expected_ms))

    median_drift = float(statistics.median(drifts)) if drifts else 0.0
    max_drift = float(max(drifts)) if drifts else 0.0

    stats = {
        "coverage": round(coverage, 4),
        "nativeDriftMedianMs": round(median_drift, 2),
        "maxDriftMs": round(max_drift, 2),
    }

    return words_out, stats


def _ass_box_alpha(box_opacity: float) -> str:
    clamped = max(0.0, min(1.0, box_opacity))
    alpha_byte = round((1.0 - clamped) * 255)
    return f"{alpha_byte:02X}"


def build_ass(
    words: list[WordTiming] | list[dict],
    style: str = "Kinetic",
    accent_hex: str = "00CCFF",
    box_opacity: float = 0.55,
) -> str:
    box_alpha = _ass_box_alpha(box_opacity)
    events = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Kinetic,Space Grotesk,64,&H00FFFFFF,&H00000000,&H00101010,&H{box_alpha}101010,1,0,0,0,100,100,0,0,3,18,6,2,100,100,480,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    accent_color = _ass_color(accent_hex)
    pop_in = "{\\fscx55\\fscy55\\t(0,140,\\fscx100\\fscy100)}"

    # Normalize to WordTiming objects
    wt_words: list[WordTiming] = []
    for item in words:
        if isinstance(item, WordTiming):
            wt_words.append(item)
        elif isinstance(item, dict):
            wt_words.append(
                WordTiming(
                    word=str(item.get("text", item.get("word", ""))),
                    start=float(item.get("startMs", 0)) / 1000.0 if "startMs" in item else float(item.get("start", 0)),
                    end=float(item.get("endMs", 0)) / 1000.0 if "endMs" in item else float(item.get("end", 0)),
                    probability=float(item.get("probability", 1.0)),
                )
            )

    def render_chunk(group: list[WordTiming]) -> str:
        karaoke = "".join(
            f"{{\\k{max(1, round((item.end - item.start) * 100))}\\c&H{accent_color}&\\t(0,120,\\c&HFFFFFF&)}}{_escape_ass(item.word)} "
            for item in group
        ).rstrip()
        return pop_in + karaoke

    chunk: list[WordTiming] = []
    for word in wt_words:
        chunk.append(word)
        text = " ".join(item.word for item in chunk)
        pause = (word.start - chunk[-2].end) if len(chunk) > 1 else 0.0
        # Line width <= 880px constraint on 1080 canvas: max ~24-26 characters or max 4 words
        if len(chunk) >= 4 or len(text) >= 26 or pause >= 0.35 or re.search(r"[.!?]$", word.word):
            events.append(
                f"Dialogue: 0,{_format_ass_time(chunk[0].start)},{_format_ass_time(chunk[-1].end)},{style},,0,0,0,,{render_chunk(chunk)}"
            )
            chunk = []
    if chunk:
        events.append(
            f"Dialogue: 0,{_format_ass_time(chunk[0].start)},{_format_ass_time(chunk[-1].end)},{style},,0,0,0,,{render_chunk(chunk)}"
        )
    return "\n".join(events) + "\n"


def write_alignment(
    audio_path: str,
    ass_path: str,
    srt_path: str,
    vtt_path: str,
    json_path: str,
    language: str = "en",
    accent_hex: str = "00CCFF",
    box_opacity: float = 0.55,
    script_text: str | None = None,
    job_id: str = "job",
) -> None:
    asr_words = align_audio(audio_path, language=language)

    if script_text:
        anchored_words, stats = anchor_asr_to_script(script_text, asr_words)
        contract = {
            "schemaVersion": "1.0",
            "jobId": job_id,
            "source": "whisper_anchored",
            "words": anchored_words,
            "stats": stats,
        }
        Path(json_path).write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        display_words = [
            WordTiming(w["text"], float(w["startMs"]) / 1000.0, float(w["endMs"]) / 1000.0, float(w.get("probability", 1.0)))
            for w in anchored_words
        ]
    else:
        display_words = asr_words
        payload = [asdict(word) for word in asr_words]
        Path(json_path).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    Path(ass_path).write_text(build_ass(display_words, accent_hex=accent_hex, box_opacity=box_opacity), encoding="utf-8")

    chunks: list[tuple[float, float, str]] = []
    for i in range(0, len(display_words), 5):
        group = display_words[i:i + 5]
        if group:
            chunks.append((group[0].start, group[-1].end, " ".join(item.word for item in group)))

    def stamp(value: float) -> str:
        h = int(value // 3600)
        m = int((value % 3600) // 60)
        s = value % 60
        return f"{h:02d}:{m:02d}:{s:06.3f}"

    srt_lines: list[str] = []
    vtt_lines = ["WEBVTT", ""]
    for idx, (start, end, text) in enumerate(chunks, 1):
        srt_lines += [str(idx), f"{stamp(start).replace('.', ',')} --> {stamp(end).replace('.', ',')}", text, ""]
        vtt_lines += [f"{stamp(start)} --> {stamp(end)}", text, ""]
    Path(srt_path).write_text("\n".join(srt_lines), encoding="utf-8")
    Path(vtt_path).write_text("\n".join(vtt_lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Align synthesized narration with faster-whisper")
    parser.add_argument("audio")
    parser.add_argument("ass")
    parser.add_argument("srt")
    parser.add_argument("vtt")
    parser.add_argument("json")
    parser.add_argument("--language", default="en")
    parser.add_argument("--accent-hex", default="00CCFF", help="6-digit hex accent color (no # or 0x prefix), matched to renderer's tone/niche accent")
    parser.add_argument("--box-opacity", type=float, default=0.55, help="Caption pill-box opacity, 0-1, matched to renderer's caption style config")
    parser.add_argument("--script", default=None, help="Path to canonical script file to anchor ASR words to")
    parser.add_argument("--job-id", default="job", help="Job ID for AlignmentContract")
    args = parser.parse_args()

    script_text = None
    if args.script and Path(args.script).exists():
        script_text = Path(args.script).read_text(encoding="utf-8")

    write_alignment(
        args.audio,
        args.ass,
        args.srt,
        args.vtt,
        args.json,
        language=args.language,
        accent_hex=args.accent_hex,
        box_opacity=args.box_opacity,
        script_text=script_text,
        job_id=args.job_id,
    )


if __name__ == "__main__":
    main()
