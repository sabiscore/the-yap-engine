"""Fail-closed Fargate Phase-D renderer.

The manifest is trusted only as a contract. S3 inputs are declared explicitly,
and FFmpeg receives an argv vector rather than a shell command.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

import boto3

s3 = boto3.client("s3")


def load_manifest(bucket: str, key: str) -> dict:
    body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
    manifest = json.loads(body)
    if manifest.get("version") != 1:
        raise ValueError("unsupported render manifest version")
    if not manifest.get("jobId") or not manifest.get("outputKey"):
        raise ValueError("render manifest requires jobId/outputKey")
    inputs = manifest.get("inputs")
    args = manifest.get("ffmpegArgs")
    if not isinstance(inputs, list) or not inputs or not isinstance(args, list):
        raise ValueError("render manifest requires inputs and ffmpegArgs")
    if len(inputs) > 64 or len(args) > 256:
        raise ValueError("render manifest exceeds safety limits")
    return manifest


def main() -> None:
    bucket = os.environ["RENDER_BUCKET"]
    manifest_key = os.environ["RENDER_MANIFEST_KEY"]
    manifest = load_manifest(bucket, manifest_key)

    with tempfile.TemporaryDirectory(prefix="yap-render-") as temp:
        root = Path(temp)
        name_to_path: dict[str, Path] = {}

        for item in manifest["inputs"]:
            name = str(item.get("name", ""))
            key = str(item.get("key", ""))
            if not name or not key or ".." in name or name.startswith("/"):
                raise ValueError("invalid input declaration")
            destination = root / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            s3.download_file(bucket, key, str(destination))
            name_to_path[name] = destination

        output = root / "output.mp4"
        resolved: list[str] = []
        for arg in manifest["ffmpegArgs"]:
            value = str(arg)
            if value == "{{output}}":
                resolved.append(str(output))
                continue
            if value.startswith("{{input:") and value.endswith("}}"):
                name = value[8:-2]
                if name not in name_to_path:
                    raise ValueError(f"undeclared input: {name}")
                resolved.append(str(name_to_path[name]))
                continue
            if value.startswith("{{") or value.endswith("}}"):
                raise ValueError("unresolved manifest placeholder")
            resolved.append(value)

        if "{{output}}" not in manifest["ffmpegArgs"]:
            raise ValueError("ffmpegArgs must contain {{output}}")

        command = ["ffmpeg", *resolved]
        completed = subprocess.run(command, capture_output=True, text=True, timeout=900)
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr[-4000:])

        if not output.is_file() or output.stat().st_size == 0:
            raise RuntimeError("FFmpeg produced no output")

        output_key = str(manifest["outputKey"])
        if not output_key.startswith("results/") or ".." in output_key:
            raise ValueError("outputKey must remain under results/")

        s3.upload_file(str(output), bucket, output_key)


if __name__ == "__main__":
    main()
