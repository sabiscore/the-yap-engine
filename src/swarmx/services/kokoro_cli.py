"""Direct Kokoro synthesis CLI used when the local HTTP service is unreachable.

The Fastify provider prefers http://127.0.0.1:8888/tts and invokes this
module as an in-process CLI fallback. The CLI writes a WAV atomically so a
failed synthesis cannot leave a false-positive zero-length artifact behind.
"""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from swarmx.services.kokoro_tts_server import (
    TONE_VOICE_MAP,
    synthesize_audio,
)


def synthesize(text: str, voice: str, speed: float, output: str) -> None:
    destination = Path(output).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)

    voice_id = TONE_VOICE_MAP.get(voice, voice)
    wav_bytes, duration_ms, word_boundaries = synthesize_audio(text, voice_id, speed)

    if not wav_bytes:
        raise RuntimeError("Kokoro produced no audio")

    # Atomic write for WAV
    with tempfile.NamedTemporaryFile(dir=destination.parent, suffix=".wav", delete=False) as tmp:
        temp_path = Path(tmp.name)
    try:
        temp_path.write_bytes(wav_bytes)
        temp_path.replace(destination)
    finally:
        temp_path.unlink(missing_ok=True)

    # Write alignment sidecar JSON
    alignment_path = destination.with_suffix(".alignment.json")
    with tempfile.NamedTemporaryFile(dir=destination.parent, suffix=".json", delete=False) as tmp_align:
        temp_align_path = Path(tmp_align.name)
    try:
        temp_align_path.write_text(
            json.dumps(
                {
                    "duration_ms": duration_ms,
                    "engine": "kokoro",
                    "voice": voice_id,
                    "word_boundaries": word_boundaries,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        temp_align_path.replace(alignment_path)
    finally:
        temp_align_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Direct SwarmXQ Kokoro WAV synthesis")
    parser.add_argument("--text", required=True)
    parser.add_argument("--voice", default="am_michael")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    if not args.text.strip():
        raise SystemExit("--text must not be empty")
    if not 0.5 <= args.speed <= 2.0:
        raise SystemExit("--speed must be between 0.5 and 2.0")

    synthesize(args.text, args.voice, args.speed, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
