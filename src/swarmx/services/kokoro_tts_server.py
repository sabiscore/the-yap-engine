"""
SwarmXQ Kokoro TTS Microservice
================================
Version: V1.0.0 · 2026.07 · APEX-17 r8
Hardware target: HP EliteBook 850 G3 · 16 GB RAM · CPU-only · WSL2

Free, locally-runnable TTS using Kokoro-82M (Apache 2.0).
Replaces espeak-ng as the primary voice engine with MOS ~4.1 quality.

Prerequisites:
  sudo apt-get install espeak-ng   # required by Kokoro phonemizer
  pip install kokoro soundfile fastapi uvicorn

Start:
  python -m swarmx.services.kokoro_tts_server --port 8888

API:
  POST /tts
  Body: {"text": "...", "voice": "am_michael", "speed": 1.0}
  Returns: {"wav_b64": "...", "duration_ms": 4200, "engine": "kokoro"}

  GET /voices
  Returns: list of available voice IDs

  GET /health
  Returns: {"status": "ok", "engine": "kokoro", "version": "82m"}

Integration with ffmpeg-video-renderer.ts:
  Set SWARMX_TTS_URL=http://localhost:8888 in env.
  The renderer will POST to /tts and use the returned wav_b64.
"""

from __future__ import annotations

import argparse
import base64
import io
import re
import time
from typing import TYPE_CHECKING

import numpy as np
import structlog
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from kokoro import KPipeline

# ── Logging ───────────────────────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger("swarmx.kokoro_tts")

try:
    import soundfile as sf
    SOUNDFILE_AVAILABLE = True
except ImportError:
    sf = None  # type: ignore[assignment]
    SOUNDFILE_AVAILABLE = False
    log.warning("soundfile_unavailable", hint="pip install soundfile")

# ── Kokoro availability check ─────────────────────────────────────────────────
try:
    from kokoro import KPipeline  # type: ignore
    KOKORO_AVAILABLE = True
    log.info("kokoro_available", version="82m")
except ImportError:
    KOKORO_AVAILABLE = False
    log.warning(
        "kokoro_unavailable",
        hint="pip install kokoro soundfile",
        fallback="espeak-ng",
    )

# ── Voice registry ────────────────────────────────────────────────────────────
# Maps tone variant → Kokoro voice ID
# These are the voices confirmed to be available in kokoro-82m.
TONE_VOICE_MAP: dict[str, str] = {
    "warm":          "af_sarah",    # American female, warm, approachable
    "narrator":      "am_michael",  # American male, authoritative, clear
    "educational":   "bm_george",   # British male, crisp, measured
    "cinematic":     "bm_lewis",    # British male, deep, dramatic
    "urgent":        "am_adam",     # American male, punchy, direct
    "contrarian":    "af_nicole",   # American female, confident, assertive
    "faceless_broll":"am_michael",  # Calm background narration
    "default":       "am_michael",
}

# Speed multipliers per tone (relative to 1.0 baseline)
TONE_SPEED_MAP: dict[str, float] = {
    "warm":          0.95,
    "narrator":      1.00,
    "educational":   0.92,
    "cinematic":     0.90,
    "urgent":        1.10,
    "contrarian":    1.02,
    "faceless_broll":1.00,
    "default":       1.00,
}

AVAILABLE_VOICES = list(set(TONE_VOICE_MAP.values()))

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="SwarmXQ Kokoro TTS",
    description="High-quality local TTS microservice for the SwarmXQ video pipeline.",
    version="1.0.0",
)

# Lazy-loaded pipelines keyed by lang_code ('a' = American, 'b' = British)
_pipelines: dict[str, KPipeline] = {}


def get_pipeline(lang_code: str = "a") -> KPipeline:
    global _pipelines
    if lang_code not in _pipelines:
        if not KOKORO_AVAILABLE:
            raise RuntimeError("Kokoro not installed. Run: pip install kokoro soundfile")
        log.info("kokoro_pipeline_init", lang_code=lang_code)
        _pipelines[lang_code] = KPipeline(lang_code=lang_code)
        log.info("kokoro_pipeline_ready", lang_code=lang_code)
    return _pipelines[lang_code]


# ── Request/response models ───────────────────────────────────────────────────
class WordBoundary(BaseModel):
    word: str = Field(..., description="Spoken word")
    start_ms: int = Field(..., description="Start timestamp in milliseconds")
    end_ms: int = Field(..., description="End timestamp in milliseconds")


class TTSRequest(BaseModel):
    text: str = Field(..., description="Narration text to synthesize")
    voice: str = Field("am_michael", description="Kokoro voice ID or tone name")
    speed: float | None = Field(None, ge=0.5, le=2.0, description="Speed multiplier (0.5–2.0)")
    split_pattern: str = Field(r"\n+", description="Pattern to split text into segments")


class TTSResponse(BaseModel):
    wav_b64: str = Field(..., description="Base64-encoded WAV audio")
    duration_ms: int = Field(..., description="Audio duration in milliseconds")
    engine: str = Field("kokoro", description="TTS engine used")
    voice: str = Field(..., description="Voice ID actually used")
    sample_rate: int = Field(24000, description="Sample rate of the output WAV")
    word_boundaries: list[WordBoundary] = Field(
        default_factory=list, description="Word-level alignment timestamps"
    )


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "engine": "kokoro" if KOKORO_AVAILABLE and SOUNDFILE_AVAILABLE else "unavailable",
        "version": "82m",
        "voices": AVAILABLE_VOICES,
        "hardware": "cpu-only",
        "dependencies": {
            "kokoro": KOKORO_AVAILABLE,
            "soundfile": SOUNDFILE_AVAILABLE,
        },
    }


@app.get("/voices")
async def voices():
    return {"voices": AVAILABLE_VOICES, "tone_map": TONE_VOICE_MAP}


def strip_bracket_tags(raw_text: str) -> str:
    """Tolerantly strip bracket tags like [pause:...], [speed:...], [emphasis]."""
    tag_re = re.compile(
        r"\[(pause:[0-9.]+(?:s|ms)?|speed:[0-9.]+|emphasis|/emphasis)\]",
        re.IGNORECASE,
    )
    cleaned = tag_re.sub(" ", raw_text)
    return re.sub(r"[ \t]+", " ", cleaned).strip()


def apply_audio_fade(audio: np.ndarray, sample_rate: int = 24000, fade_ms: float = 8.0) -> np.ndarray:
    """Apply 8ms fade-in/out to audio chunk to prevent boundary clicks."""
    fade_len = int(sample_rate * (fade_ms / 1000.0))
    if len(audio) < fade_len * 2:
        return audio
    out = audio.copy()
    fade_in = np.linspace(0.0, 1.0, fade_len, dtype=np.float32)
    fade_out = np.linspace(1.0, 0.0, fade_len, dtype=np.float32)
    out[:fade_len] *= fade_in
    out[-fade_len:] *= fade_out
    return out


@app.post("/tts", response_model=TTSResponse)
async def synthesize(req: TTSRequest):
    t0 = time.perf_counter()

    if not KOKORO_AVAILABLE or not SOUNDFILE_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Kokoro TTS dependencies are not installed. Install with: pip install kokoro soundfile",
        )

    # Resolve voice ID — accept either a voice ID directly or a tone name
    voice_id = TONE_VOICE_MAP.get(req.voice, req.voice)
    # Apply tone-aware speed if caller didn't explicitly set a speed (Fix F5: allow explicit 1.0)
    effective_speed = (
        req.speed if req.speed is not None
        else TONE_SPEED_MAP.get(req.voice, 1.0)
    )

    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="text field must not be empty")

    try:
        lang_code = "b" if voice_id.startswith(("bm_", "bf_")) else "a"
        pipeline = get_pipeline(lang_code)
        sample_rate = 24000
        arrays: list[np.ndarray] = []
        word_boundaries: list[WordBoundary] = []
        current_time_ms = 0

        cleaned_text = strip_bracket_tags(req.text)
        log.info(
            "tts_start",
            voice=voice_id,
            speed=effective_speed,
            text_len=len(cleaned_text),
            lang_code=lang_code,
        )

        raw_paragraphs = re.split(r"\n\n+", cleaned_text)
        for p_idx, paragraph in enumerate(raw_paragraphs):
            p_text = paragraph.strip()
            if not p_text:
                continue

            sub_segments = [s.strip() for s in re.split(r"(?<=\.\.\.)", p_text) if s.strip()]
            for s_idx, segment_text in enumerate(sub_segments):
                chunk_arrays: list[np.ndarray] = []
                for _gs, _ps, audio in pipeline(
                    segment_text,
                    voice=voice_id,
                    speed=effective_speed,
                    split_pattern=req.split_pattern,
                ):
                    chunk_arrays.append(np.asarray(audio, dtype=np.float32))

                if chunk_arrays:
                    combined_chunk = np.concatenate(chunk_arrays)
                    faded_chunk = apply_audio_fade(combined_chunk, sample_rate, 8.0)
                    arrays.append(faded_chunk)
                    chunk_duration_ms = int(len(faded_chunk) / sample_rate * 1000)

                    # Estimate word boundaries based on character lengths
                    words = re.findall(r"\S+", segment_text)
                    if words:
                        total_weight = sum(max(len(w), 1) for w in words)
                        cursor_ms = current_time_ms
                        for idx, w in enumerate(words):
                            clean_word = re.sub(r"^[^\w]+|[^\w]+$", "", w) or w
                            w_weight = max(len(clean_word), 1)
                            w_duration = int(chunk_duration_ms * (w_weight / total_weight))
                            end_ms = (
                                current_time_ms + chunk_duration_ms
                                if idx == len(words) - 1
                                else cursor_ms + w_duration
                            )
                            word_boundaries.append(
                                WordBoundary(
                                    word=clean_word,
                                    start_ms=cursor_ms,
                                    end_ms=max(end_ms, cursor_ms + 10),
                                )
                            )
                            cursor_ms = end_ms

                    current_time_ms += chunk_duration_ms

                    # Silence insertion:
                    # - At ... trailing pause: 1.0s (cap 1.2s)
                    # - At \n\n paragraph end: 0.40s
                    # - Within-beat join: 0.12s
                    pause_s = 0.0
                    if segment_text.endswith("..."):
                        pause_s = 1.0
                    elif s_idx == len(sub_segments) - 1 and p_idx < len(raw_paragraphs) - 1:
                        pause_s = 0.40
                    elif s_idx < len(sub_segments) - 1:
                        pause_s = 0.12

                    if pause_s > 0:
                        pause_samples = int(sample_rate * pause_s)
                        arrays.append(np.zeros(pause_samples, dtype=np.float32))
                        current_time_ms += int(pause_s * 1000)

        if not arrays:
            raise ValueError("Kokoro produced no audio segments")

        combined = np.concatenate(arrays)
        out_buf = io.BytesIO()
        sf.write(out_buf, combined, sample_rate, format="WAV")  # type: ignore[union-attr]
        wav_bytes = out_buf.getvalue()

        duration_ms = int(len(combined) / sample_rate * 1000)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)

        log.info(
            "tts_complete",
            voice=voice_id,
            duration_ms=duration_ms,
            elapsed_ms=elapsed_ms,
            word_count=len(word_boundaries),
            rtf=f"{duration_ms / max(elapsed_ms, 1):.2f}x",
        )

        return TTSResponse(
            wav_b64=base64.b64encode(wav_bytes).decode(),
            duration_ms=duration_ms,
            engine="kokoro",
            voice=voice_id,
            sample_rate=sample_rate,
            word_boundaries=word_boundaries,
        )

    except Exception as exc:
        import gc

        gc.collect()
        log.error("tts_error", error=str(exc), voice=voice_id)
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {exc}") from exc



# ── CLI entrypoint ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="SwarmXQ Kokoro TTS microservice")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8888, help="Bind port (default: 8888)")
    parser.add_argument("--workers", type=int, default=1, help="Worker count (CPU-only: 1)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload (dev mode)")
    args = parser.parse_args()

    if not KOKORO_AVAILABLE or not SOUNDFILE_AVAILABLE:
        log.error(
            "kokoro_start_blocked",
            reason="Kokoro TTS dependencies are not installed",
            install="pip install kokoro soundfile",
            retry="python -m swarmx.services.kokoro_tts_server",
        )
        raise SystemExit(1)

    log.info(
        "kokoro_server_start",
        url=f"http://{args.host}:{args.port}",
        engine="kokoro-82m",
        workers=args.workers,
        hardware="cpu-only",
        voices=AVAILABLE_VOICES,
    )

    uvicorn.run(
        "swarmx.services.kokoro_tts_server:app",
        host=args.host,
        port=args.port,
        workers=args.workers,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
