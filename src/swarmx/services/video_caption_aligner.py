from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass, asdict
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


def _ass_box_alpha(box_opacity: float) -> str:
    """Convert an ffmpeg-style opacity (1.0 = fully opaque) into an ASS alpha
    byte, where ASS alpha is inverted (00 = opaque, FF = fully transparent).
    Mirrors the `boxcolor=black@<opacity>` convention already used by the
    estimated-timing drawtext cards path so both caption paths read as the
    same visual weight."""
    clamped = max(0.0, min(1.0, box_opacity))
    alpha_byte = round((1.0 - clamped) * 255)
    return f"{alpha_byte:02X}"


def build_ass(
    words: list[WordTiming],
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
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # BorderStyle 3 = opaque box (the ASS equivalent of drawtext's
        # box=1/boxcolor/boxborderw pill treatment). Outline doubles as the
        # box's internal padding; Shadow renders the drop-shadow offset
        # beneath the box, matching the cards path's visual weight.
        f"Style: Kinetic,Arial,64,&H00FFFFFF,&H00000000,&H00101010,&H{box_alpha}101010,1,0,0,0,100,100,0,0,3,18,6,2,70,70,160,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    accent_color = _ass_color(accent_hex)
    # Pop-in entrance: each chunk springs from 55% to 100% scale over its
    # first 140ms, mirroring the "animated pop-in" cadence used elsewhere in
    # the kinetic visual language.
    pop_in = "{\\fscx55\\fscy55\\t(0,140,\\fscx100\\fscy100)}"

    def render_chunk(group: list[WordTiming]) -> str:
        karaoke = "".join(
            f"{{\\k{max(1, round((item.end - item.start) * 100))}\\c&H{accent_color}&\\t(0,120,\\c&HFFFFFF&)}}{_escape_ass(item.word)} "
            for item in group
        ).rstrip()
        return pop_in + karaoke

    # Group adjacent words into short readable kinetic chunks. The timestamps
    # remain word-derived; grouping only controls visual density.
    chunk: list[WordTiming] = []
    for word in words:
        chunk.append(word)
        text = " ".join(item.word for item in chunk)
        pause = (word.start - chunk[-2].end) if len(chunk) > 1 else 0.0
        if len(chunk) >= 5 or len(text) >= 34 or pause >= 0.45 or re.search(r"[.!?]$", word.word):
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
) -> None:
    words = align_audio(audio_path, language=language)
    Path(ass_path).write_text(build_ass(words, accent_hex=accent_hex, box_opacity=box_opacity), encoding="utf-8")
    payload = [asdict(word) for word in words]
    Path(json_path).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    chunks: list[tuple[float, float, str]] = []
    for i in range(0, len(words), 6):
        group = words[i:i + 6]
        if group:
            chunks.append((group[0].start, group[-1].end, " ".join(item.word for item in group)))

    def stamp(value: float) -> str:
        h = int(value // 3600)
        m = int((value % 3600) // 60)
        s = value % 60
        return f"{h:02d}:{m:02d}:{s:06.3f}" if s < 10 else f"{h:02d}:{m:02d}:{s:06.3f}"

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
    parser.add_argument("--accent-hex", default="00CCFF", help="6-digit hex accent color (no # or 0x prefix), matched to the renderer's tone/niche accent")
    parser.add_argument("--box-opacity", type=float, default=0.55, help="Caption pill-box opacity, 0-1, matched to the renderer's caption style config")
    args = parser.parse_args()
    write_alignment(
        args.audio,
        args.ass,
        args.srt,
        args.vtt,
        args.json,
        language=args.language,
        accent_hex=args.accent_hex,
        box_opacity=args.box_opacity,
    )


if __name__ == "__main__":
    main()
