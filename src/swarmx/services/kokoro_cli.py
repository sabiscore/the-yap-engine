"""Direct Kokoro synthesis CLI used when the local HTTP service is unreachable.

The Fastify provider should prefer http://127.0.0.1:8888/tts and invoke this
module only after a bounded HTTP failure. The CLI writes a WAV atomically so a
failed synthesis cannot leave a false-positive zero-length artifact behind.
"""

from __future__ import annotations

import argparse
import json
import re
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from swarmx.services.kokoro_tts_server import get_pipeline, parse_ssml_chunks


def synthesize(text: str, voice: str, speed: float, output: str) -> None:
    destination = Path(output).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)

    pipeline = get_pipeline()
    sample_rate = 24000
    arrays: list[np.ndarray] = []
    word_boundaries: list[dict[str, Any]] = []
    current_time_ms = 0

    chunks = parse_ssml_chunks(text, speed)
    if not chunks:
        chunks = [{"type": "speech", "text": text, "speed": speed}]

    for chunk in chunks:
        if chunk["type"] == "pause":
            pause_samples = int(sample_rate * chunk["duration_s"])
            if pause_samples > 0:
                silence = np.zeros(pause_samples, dtype=np.float32)
                arrays.append(silence)
                current_time_ms += int(chunk["duration_s"] * 1000)
        elif chunk["type"] == "speech":
            speech_text = chunk["text"]
            chunk_speed = chunk["speed"]
            chunk_arrays: list[np.ndarray] = []

            for _gs, _ps, audio in pipeline(
                speech_text, voice=voice, speed=chunk_speed, split_pattern=r"\n+"
            ):
                chunk_arrays.append(np.asarray(audio, dtype=np.float32))

            if chunk_arrays:
                combined_chunk = np.concatenate(chunk_arrays)
                arrays.append(combined_chunk)
                chunk_duration_ms = int(len(combined_chunk) / sample_rate * 1000)

                words = re.findall(r"\S+", speech_text)
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
                            {
                                "word": clean_word,
                                "start_ms": cursor_ms,
                                "end_ms": max(end_ms, cursor_ms + 10),
                            }
                        )
                        cursor_ms = end_ms

                current_time_ms += chunk_duration_ms

    if not arrays:
        raise RuntimeError("Kokoro produced no audio")

    combined = np.concatenate(arrays)
    total_duration_ms = int(len(combined) / sample_rate * 1000)

    with tempfile.NamedTemporaryFile(dir=destination.parent, suffix=".wav", delete=False) as tmp:
        temp_path = Path(tmp.name)
    try:
        sf.write(temp_path, combined, sample_rate, format="WAV")
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
                    "duration_ms": total_duration_ms,
                    "engine": "kokoro",
                    "voice": voice,
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
