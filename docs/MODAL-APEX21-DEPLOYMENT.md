# APEX-21 Modal GPU Worker Deployment

## Purpose

The Modal worker is a burst GPU execution adapter for The Yap Engine. SwarmXQ remains the lifecycle authority.

Current baseline:
- GPU: L4
- Model: Wan2.2 TI2V 5B
- min containers: 0
- max containers: 4
- one HTTP gateway function
- bounded Function.map fan-out
- persistent artifact Volume
- authenticated renderer token

## 1. Prerequisites

Install the Modal CLI and authenticate the deployment environment.

Create a dedicated Modal secret containing:

- SWARMX_MODAL_RENDER_TOKEN

Optional configuration:

- SWARMX_MODAL_APP
- SWARMX_MODAL_VOLUME
- SWARMX_VIDEO_MODEL
- SWARMX_MODAL_SECRET_NAME
- SWARMX_MODAL_MAX_CONTAINERS

Never commit the token.

## 2. Create the artifact volume

Create the named volume before the first deployment, or allow the application to create it lazily:

modal volume create swarmxq-video-artifacts

Keep the volume focused on model/output artifacts. Avoid creating tens of thousands of tiny files.

## 3. Deploy

From the repository root:

modal deploy src/swarmx/services/modal_video_renderer.py

The deployed ASGI function exposes the health and render endpoints used by:

apps/swarmx-api/src/services/modal-video-render-backend.ts

Configure the API:

SWARMX_MODAL_RENDER_URL=<deployed Modal web endpoint>
SWARMX_MODAL_RENDER_TOKEN=<same secret value>

## 4. Smoke test

Run the repository regression first:

pnpm -F @swarmx/api exec tsx scripts/video-modal-contract-regression.ts

Then check:

curl -H "Authorization: Bearer $SWARMX_MODAL_RENDER_TOKEN" "$SWARMX_MODAL_RENDER_URL/health"

A healthy response must identify:
- app;
- L4 GPU;
- min_containers=0;
- max_containers<=4;
- Function.map fan-out.

## 5. Production task profile

Start with conservative Wan2.2 settings:

- portrait 9:16;
- moderate resolution;
- 8–16 FPS for generated motion tests;
- 1–6 second segments;
- deterministic seed;
- bounded inference steps.

Do not begin with 1080x1920, 30 FPS and 12 second generation as the default. Increase resource intensity only after measured VRAM, latency and artifact-quality evidence.

## 6. Cost control

Use min_containers=0 for burst workloads.

Prefer:
- scene-level cache hits;
- short reusable segments;
- deterministic seeds;
- selective hero shots;
- CPU/FFmpeg rendering for ordinary motion graphics;
- GPU only for scenes whose creative benefit justifies the cost.

Record:
- cold-start latency;
- GPU execution time;
- render time;
- cache hit/miss;
- generated segment duration;
- failure/retry count.

## 7. Artifact acceptance

SwarmXQ must reject a Modal result if:
- segment ID is unexpected or duplicated;
- cache key does not match;
- checksum is invalid;
- dimensions do not match;
- media probe fails;
- job authorization/state has changed.

Modal output is never published directly.

## 8. Operational rollback

If Modal becomes unavailable, SwarmXQ should use the configured local/ComfyUI fallback when its capability gates permit it. If no safe backend is available, the job becomes BLOCKED or RENDER_DEFERRED rather than bypassing the render contract.

## 9. Architecture note

Modal Volumes are appropriate for write-once/read-many model and artifact workloads. Explicit commits are retained even though Modal also supports background commits, because artifact persistence is part of the acceptance contract.

The worker must remain provider-scoped. Do not add business workflow state, user authentication state or publication logic to the Modal Python module.
