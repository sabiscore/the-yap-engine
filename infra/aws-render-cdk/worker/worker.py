"""Fail-closed Fargate Phase-D renderer.

The manifest is trusted only as a contract. S3 inputs are declared explicitly,
and FFmpeg receives an argv vector rather than a shell command.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

import boto3

s3 = boto3.client("s3")


def put_json(bucket: str, key: str, payload: dict) -> None:
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        ContentType="application/json",
    )


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

        probe = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries",
                "format=format_name,duration,size:stream=index,codec_name,codec_type,width,height,r_frame_rate",
                "-of", "json", str(output),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if probe.returncode != 0:
            raise RuntimeError(f"FFprobe validation failed: {probe.stderr[-2000:]}")
        try:
            probe_data = json.loads(probe.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError("FFprobe returned invalid JSON") from exc

        if not probe_data.get("streams") or not probe_data.get("format"):
            raise RuntimeError("FFprobe validation returned incomplete media metadata")

        digest = hashlib.sha256(output.read_bytes()).hexdigest()
        output_key = str(manifest["outputKey"])
        if not output_key.startswith("results/") or ".." in output_key:
            raise ValueError("outputKey must remain under results/")

        s3.upload_file(str(output), bucket, output_key)
        validation_key = output_key + ".validation.json"
        validation = {
            "version": 1,
            "jobId": manifest["jobId"],
            "outputKey": output_key,
            "sha256": digest,
            "sizeBytes": output.stat().st_size,
            "ffprobe": probe_data,
            "sourceManifestKey": manifest_key,
        }
        put_json(bucket, validation_key, validation)


if __name__ == "__main__":
    bucket = os.environ["RENDER_BUCKET"]
    manifest_key = os.environ["RENDER_MANIFEST_KEY"]
    try:
        main()
    except Exception as exc:
        failure_key = manifest_key.replace("jobs/", "results/", 1) + ".failure.json"
        payload = {
            "version": 1,
            "status": "failed_unrecoverable",
            "manifestKey": manifest_key,
            "error": str(exc)[-2000:],
        }
        try:
            manifest = load_manifest(bucket, manifest_key)
            payload["jobId"] = manifest["jobId"]
            payload["outputKey"] = str(manifest["outputKey"])
        except Exception:
            payload["jobId"] = manifest_key
        put_json(bucket, failure_key, payload)
        raise
