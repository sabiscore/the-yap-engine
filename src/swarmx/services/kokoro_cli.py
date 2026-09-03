"""Direct Kokoro synthesis CLI used when the local HTTP service is unreachable.

The Fastify provider should prefer http://127.0.0.1:8888/tts and invoke this
module only after a bounded HTTP failure. The CLI writes a WAV atomically so a
failed synthesis cannot leave a false-positive zero-length artifact behind.
"""

from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

from swarmx.services.kokoro_tts_server import get_pipeline


def synthesize(text: str, voice: str, speed: float, output: str) -> None:
    import numpy as np
    import soundfile as sf

    destination = Path(output).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)

    pipeline = get_pipeline()
    arrays: list[np.ndarray] = []
    sample_rate = 24000
    for _gs, _ps, audio in pipeline(text, voice=voice, speed=speed, split_pattern=r"\n+"):
        arrays.append(np.asarray(audio, dtype=np.float32))

    if not arrays:
        raise RuntimeError("Kokoro produced no audio")

    combined = np.concatenate(arrays)
    with tempfile.NamedTemporaryFile(dir=destination.parent, suffix=".wav", delete=False) as tmp:
        temp_path = Path(tmp.name)
    try:
        sf.write(temp_path, combined, sample_rate, format="WAV")
        temp_path.replace(destination)
    finally:
        temp_path.unlink(missing_ok=True)


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
