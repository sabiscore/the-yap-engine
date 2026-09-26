"""Native Modal GPU worker for SwarmXQ video segment rendering.

APEX-21 rules:
- SwarmXQ owns lifecycle, admission, persistence and publication.
- This module owns only remote GPU execution and artifact persistence.
- Local 8 GB constraints are never relaxed by remote fan-out.
- Tasks are schema validated, bounded and checksum verified.
- GPU model state is reused only inside an already-admitted Modal container.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any

import modal
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

APP_NAME = os.getenv("SWARMX_MODAL_APP", "swarmxq-video-renderer")
VOLUME_NAME = os.getenv("SWARMX_MODAL_VOLUME", "swarmxq-video-artifacts")
MODEL_NAME = os.getenv("SWARMX_VIDEO_MODEL", "wan22").strip().lower()
SECRET_NAME = os.getenv("SWARMX_MODAL_SECRET_NAME", "swarmxq-video-renderer")
MAX_CONTAINERS = max(1, min(4, int(os.getenv("SWARMX_MODAL_MAX_CONTAINERS", "4"))))
OUTPUT_ROOT = Path("/outputs")
MODEL_IDS = {
    "wan22": "Wan-AI/Wan2.2-TI2V-5B-Diffusers",
    "ltx": os.getenv("SWARMX_MODAL_LTX_MODEL_ID", "Lightricks/LTX-Video"),
}
MODEL_CACHE: dict[str, Any] = {}
MODEL_CACHE_LOCKED: str | None = None

app = modal.App(APP_NAME)
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)
modal_secret = modal.Secret.from_name(SECRET_NAME)

render_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch",
        "diffusers>=0.35.0",
        "transformers>=4.55.0",
        "accelerate>=1.8.0",
        "safetensors>=0.5.3",
        "imageio>=2.37.0",
        "imageio-ffmpeg>=0.6.0",
        "fastapi>=0.115.0",
        "pydantic>=2.9.0",
    )
)


class RenderSegmentTask(BaseModel):
    jobId: str = Field(min_length=1, max_length=128)
    segmentId: str = Field(min_length=1, max_length=128)
    prompt: str = Field(min_length=1, max_length=4000)
    negativePrompt: str = Field(default="", max_length=4000)
    durationSeconds: float = Field(ge=1.0, le=12.0)
    fps: int = Field(ge=8, le=30)
    width: int = Field(ge=256, le=1920)
    height: int = Field(ge=256, le=1920)
    seed: int = Field(ge=0, le=2**63 - 1)
    model: str = Field(default=MODEL_NAME)
    aspectRatio: str = Field(default="9:16")
    steps: int = Field(default=28, ge=8, le=50)
    cacheKey: str | None = Field(default=None, max_length=128)

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in MODEL_IDS:
            raise ValueError(f"unsupported Modal model: {normalized}")
        return normalized

    @field_validator("aspectRatio")
    @classmethod
    def validate_aspect_ratio(cls, value: str) -> str:
        if value not in {"9:16", "1:1", "16:9"}:
            raise ValueError(f"unsupported aspect ratio: {value}")
        return value


class RenderSegmentArtifact(BaseModel):
    segmentId: str
    path: str
    durationSeconds: float
    width: int
    height: int
    fps: int
    checksum: str
    model: str
    cacheKey: str | None = None


def _output_path(job_id: str, segment_id: str) -> Path:
    safe_job = "".join(c for c in job_id if c.isalnum() or c in "-_")[:128]
    safe_segment = "".join(c for c in segment_id if c.isalnum() or c in "-_")[:128]
    path = OUTPUT_ROOT / safe_job / f"{safe_segment}.mp4"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _probe(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-show_entries", "stream=codec_type,width,height,r_frame_rate",
            "-of", "json", str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr[-500:]}")
    payload = json.loads(result.stdout or "{}")
    streams = payload.get("streams") or []
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    duration = float((payload.get("format") or {}).get("duration") or 0)
    if not video or duration <= 0:
        raise RuntimeError("rendered artifact failed media validation")
    fps_raw = str(video.get("r_frame_rate") or "0/1")\n    numerator, denominator = (fps_raw.split("/", 1) + ["1"])[:2]\n    fps = float(numerator) / max(1.0, float(denominator))\n    return {"durationSeconds": duration, "width": video.get("width"), "height": video.get("height"), "fps": fps}


def _load_pipeline(model: str):
    global MODEL_CACHE_LOCKED
    cached = MODEL_CACHE.get(model)
    if cached is not None:
        return cached

    if MODEL_CACHE_LOCKED and MODEL_CACHE_LOCKED != model:
        old = MODEL_CACHE.pop(MODEL_CACHE_LOCKED, None)
        if old is not None:
            del old
        import torch
        torch.cuda.empty_cache()

    import torch
    if model == "wan22":
        from diffusers import WanPipeline
        pipe = WanPipeline.from_pretrained(MODEL_IDS[model], torch_dtype=torch.bfloat16).to("cuda")
    elif model == "ltx":
        from diffusers import LTXVideoPipeline
        pipe = LTXVideoPipeline.from_pretrained(MODEL_IDS[model], torch_dtype=torch.bfloat16).to("cuda")
    else:
        raise ValueError(f"unsupported render model: {model}")

    MODEL_CACHE[model] = pipe
    MODEL_CACHE_LOCKED = model
    return pipe


def _render_wan(task: RenderSegmentTask, output: Path) -> None:
    import torch
    from diffusers.utils import export_to_video

    pipe = _load_pipeline("wan22")
    frames = max(8, min(int(round(task.durationSeconds * task.fps)), 121))
    result = pipe(
        prompt=task.prompt,
        negative_prompt=task.negativePrompt or "low quality, blurry, watermark, distorted",
        height=task.height,
        width=task.width,
        num_frames=frames,
        guidance_scale=5.0,
        num_inference_steps=task.steps,
        generator=torch.Generator(device="cuda").manual_seed(task.seed),
    )
    export_to_video(result.frames[0], str(output), fps=task.fps)
    del result
    torch.cuda.empty_cache()


def _render_ltx(task: RenderSegmentTask, output: Path) -> None:
    import torch
    from diffusers.utils import export_to_video

    pipe = _load_pipeline("ltx")
    frames = max(8, min(int(round(task.durationSeconds * task.fps)), 121))
    result = pipe(
        prompt=task.prompt,
        negative_prompt=task.negativePrompt or "worst quality, blurry, watermark, distorted",
        height=task.height,
        width=task.width,
        num_frames=frames,
        num_inference_steps=task.steps,
        generator=torch.Generator(device="cuda").manual_seed(task.seed),
    )
    export_to_video(result.frames[0], str(output), fps=task.fps)
    del result
    torch.cuda.empty_cache()


def _render(task: RenderSegmentTask) -> RenderSegmentArtifact:
    output = _output_path(task.jobId, task.segmentId)
    if task.model == "wan22":
        _render_wan(task, output)
    elif task.model == "ltx":
        _render_ltx(task, output)
    else:
        raise ValueError(f"unsupported render model: {task.model}")

    probe = _probe(output)
    if int(probe["width"] or 0) != task.width or int(probe["height"] or 0) != task.height:
        raise RuntimeError("rendered dimensions do not match the task contract")

    checksum = _checksum(output)
    volume.commit()
    return RenderSegmentArtifact(
        segmentId=task.segmentId,
        path=str(output),
        durationSeconds=task.durationSeconds,
        width=task.width,
        height=task.height,
        fps=task.fps,
        checksum=checksum,
        model=task.model,
        cacheKey=task.cacheKey,
    )


@app.function(
    image=render_image,
    gpu="L4",
    volumes={"/outputs": volume},
    secrets=[modal_secret],
    min_containers=0,
    max_containers=MAX_CONTAINERS,
    timeout=900,
    startup_timeout=180,
    retries=modal.Retries(max_retries=2, initial_delay=5.0, backoff_coefficient=2.0),
)
def render_one(task: dict[str, Any]) -> dict[str, Any]:
    validated = RenderSegmentTask.model_validate(task)
    return _render(validated).model_dump()


@app.function(
    image=render_image,
    volumes={"/outputs": volume},
    secrets=[modal_secret],
    min_containers=0,
    max_containers=1,
    timeout=1200,
    startup_timeout=60,
)
def render_segments(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    validated = [RenderSegmentTask.model_validate(task).model_dump() for task in tasks]
    if not validated:
        return []
    if len(validated) > MAX_CONTAINERS * 2:
        raise ValueError(f"segment batch exceeds safety ceiling: {len(validated)}")
    return list(render_one.map(validated))


web = FastAPI(title="SwarmXQ Modal Video Renderer")


def _check_auth(authorization: str | None) -> None:
    expected = os.getenv("SWARMX_MODAL_RENDER_TOKEN", "").strip()
    if expected and authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="invalid renderer token")


@web.get("/health")
async def health(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _check_auth(authorization)
    return {
        "ok": True,
        "app": APP_NAME,
        "models": MODEL_IDS,
        "gpu": "L4",
        "min_containers": 0,
        "max_containers": MAX_CONTAINERS,
        "fanout": "Function.map",
        "model_cache": list(MODEL_CACHE),
    }


@web.post("/v1/render")
async def submit(payload: dict[str, Any], authorization: str | None = Header(default=None)) -> dict[str, str]:
    _check_auth(authorization)
    tasks = payload.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise HTTPException(status_code=422, detail="tasks must be a non-empty list")
    if len(tasks) > MAX_CONTAINERS * 2:
        raise HTTPException(status_code=422, detail="too many segment tasks")
    call = render_segments.spawn(tasks)
    return {"call_id": call.object_id}


@web.get("/v1/render/file/{job_id}/{segment_id}")
async def file(job_id: str, segment_id: str, authorization: str | None = Header(default=None)) -> FileResponse:
    _check_auth(authorization)
    path = _output_path(job_id, segment_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="segment artifact not found")
    return FileResponse(path, media_type="video/mp4", filename=path.name)


@web.get("/v1/render/{call_id}")
async def result(call_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _check_auth(authorization)
    function_call = modal.FunctionCall.from_id(call_id)
    try:
        value = function_call.get(timeout=0)
    except TimeoutError:
        return {"status": "pending"}
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}
    return {"status": "completed", "artifacts": value}


@app.function(
    image=render_image,
    volumes={"/outputs": volume},
    secrets=[modal_secret],
    min_containers=0,
    max_containers=1,
    timeout=120,
)
@modal.asgi_app()
def fastapi_app() -> FastAPI:
    return web
