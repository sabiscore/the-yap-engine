"""Native Modal GPU worker for SwarmXQ video segment rendering.

The Fastify API remains the lifecycle owner. This module owns only remote GPU
execution and artifact persistence. One admitted local VideoJob may fan out its
render segments with Function.map(); the 8 GB local host remains single-job
locked.

Deployment invariants:
  - L4 GPU
  - min_containers=0
  - max_containers <= 4
  - secrets are injected with modal.Secret
  - artifacts are persisted to a Modal Volume
  - segment inputs are validated with Pydantic before inference
"""

from __future__ import annotations

import hashlib
import os
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
    steps: int = Field(default=28, ge=8, le=50)

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in MODEL_IDS:
            raise ValueError(f"unsupported Modal model: {normalized}")
        return normalized


class RenderSegmentArtifact(BaseModel):
    segmentId: str
    path: str
    durationSeconds: float
    width: int
    height: int
    fps: int
    checksum: str
    model: str


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


def _render_wan(task: RenderSegmentTask, output: Path) -> None:
    import torch
    from diffusers import WanPipeline
    from diffusers.utils import export_to_video

    pipe = WanPipeline.from_pretrained(MODEL_IDS["wan22"], torch_dtype=torch.bfloat16).to("cuda")
    frames = max(8, min(int(round(task.durationSeconds * task.fps)), 241))
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
    del pipe
    torch.cuda.empty_cache()


def _render_ltx(task: RenderSegmentTask, output: Path) -> None:
    import torch
    from diffusers import LTXVideoPipeline
    from diffusers.utils import export_to_video

    pipe = LTXVideoPipeline.from_pretrained(MODEL_IDS["ltx"], torch_dtype=torch.bfloat16).to("cuda")
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
    del pipe
    torch.cuda.empty_cache()


def _render(task: RenderSegmentTask) -> RenderSegmentArtifact:
    output = _output_path(task.jobId, task.segmentId)
    if task.model == "wan22":
        _render_wan(task, output)
    elif task.model == "ltx":
        _render_ltx(task, output)
    else:
        raise ValueError(f"unsupported render model: {task.model}")

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
    # Native Modal fan-out. The API still admits only one local VideoJob.
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
    }


@web.post("/v1/render")
async def submit(payload: dict[str, Any], authorization: str | None = Header(default=None)) -> dict[str, str]:
    _check_auth(authorization)
    tasks = payload.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise HTTPException(status_code=422, detail="tasks must be a non-empty list")
    if len(tasks) > MAX_CONTAINERS * 2:
        raise HTTPException(status_code=422, detail="too many segment tasks")
    # Function.spawn keeps HTTP submission cheap; the spawned Function invokes
    # render_one.map() and therefore fans out only within this single job call.
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
