# The Yap Engine — Video Generation Subsystem

> **Powered by SwarmXQ** — pressure-aware, viral short-form video generation orchestrated through
> Ollama local models → storyboard → render (local FFmpeg / ComfyUI / Modal GPU).

---

## Table of contents

1. [Architecture overview](#architecture-overview)
2. [10-Template creative taxonomy](#10-template-creative-taxonomy)
3. [File map](#file-map)
4. [Environment setup](#environment-setup)
5. [Installation & startup](#installation--startup)
6. [API reference](#api-reference)
7. [SSE event lifecycle](#sse-event-lifecycle)
8. [Job lifecycle & state machine](#job-lifecycle--state-machine)
9. [Degradation behavior](#degradation-behavior)
10. [Model assignment](#model-assignment)
11. [Dashboard integration](#dashboard-integration)
12. [M13 live certification](#m13-live-certification)
13. [Browser verification](#browser-verification)
14. [ComfyUI render setup](#comfyui-render-setup)
15. [Troubleshooting](#troubleshooting)
16. [Known bugs fixed in this release](#known-bugs-fixed-in-this-release)

---

## Architecture overview

```text
Browser / API client
        │
        ▼ POST /api/video/jobs
┌───────────────────────┐
│   routes/video.ts     │  Fastify route handlers — validation, queue creation,
│   (Fastify plugin)    │  health probe, cancel/retry
└──────────┬────────────┘
           │ createJob()
           ▼
┌───────────────────────┐      SSE → dashboard
│   video-queue.ts      │ ──── orchestrator emits video lifecycle events ─────►
│   (in-memory queue)   │
└──────────┬────────────┘
           │ queue.startJob() → runOrchestration()
           ▼
┌───────────────────────┐
│ video-orchestrator.ts │  Sequential, pressure-aware pipeline:
│                       │  intent_classification → planning → scripting
│  Model calls          │    → storyboard_generation → render_assembly → finalizing
│  via Ollama REST API  │
└──────────┬────────────┘
           │
    ┌──────┴──────────────────────────────────┐
    │                                          │
    ▼                                          ▼
Ollama (local)                          ComfyUI (optional)
instruct-phi4-pro-q8-prod (fast)        LTX-Video / Wan 2.2
reason-deepseekr1-pro-q5km-prod         POST /prompt per shot
code-qwen25-pro-q5km-prod
    │
    ▼
┌───────────────────────┐
│   video-assets.ts     │  Per-job artifact storage under
│                       │  SWARMX_VIDEO_ARTIFACT_DIR/<jobId>/
│                       │    manifest.json
│                       │    render-ready.json  (deferred path)
│                       │    production package sidecars
└───────────────────────┘
```

The pipeline runs **one job at a time** (sequential queue). Under `constrained_cpu_8gb`, parallel heavyweight model, TTS, and render stages are rejected rather than queued into memory pressure. The queue drains FIFO; the orchestrator respects cancellation at every stage boundary.

---

## 10-Template creative taxonomy

The Yap Engine provides 10 structured creative templates defined in `@swarmx/types/video-types` (`VIDEO_TEMPLATE_FAMILY_VALUES`). Each template family provides a distinct narrative architecture applied to the 5-beat production planner (`buildPlanningPrompt` in `video-orchestrator.ts`):

| Template Family (`templateFamily`) | Narrative Structure & Strategy | Strategic Guidance |
|---|---|---|
| `myth-vs-fact` | Direct debunking | Hook states the popular myth; Body reveals the surprising fact and counter-evidence; Resolution explains why the myth persisted. |
| `list/countdown` | Rapid-fire high-retention list | Hook establishes high stakes/topic; Body cycles through 3–5 items in rapid succession; Resolution synthesizes the ultimate takeaway. Accepts legacy `listicle-countdown` and normalizes automatically. |
| `mystery/reveal` | Narrative puzzle | Hook presents an intriguing anomaly; Body drops progressive clues and breadcrumbs; Resolution delivers the unexpected answer. |
| `product-demo` | Problem/solution showcase | Hook highlights a visceral user pain point; Body demonstrates the practical solution in action; Resolution showcases the transformative outcome. |
| `quote-to-insight` | Powerful quote breakdown | Hook drops a provocative quote; Body analyzes its non-obvious deeper meaning; Resolution applies the wisdom to the viewer's everyday life. |
| `chart/data` | Single striking data point | Hook leads with an astonishing stat; Body visualizes the trend, comparison, and context; Resolution reveals the real-world implication. |
| `motivational` | Micro-narrative arc | Hook captures a relatable moment of defeat; Body demonstrates the pivot, discipline, and grind; Resolution delivers the hard-earned triumph. |
| `series-recap` | Fast-paced catch-up | Hook reminds viewers of the critical cliffhanger; Body blitzes through pivotal plot turns; Resolution sets up anticipation for the next episode. |
| `pov-immersion` | First-person immersion | Hook drops the viewer immediately into the action (zero preamble); Body unfolds sensory, real-time detail; Resolution lands the emotional beat from inside the POV. |
| `reddit-story` | Found-story readaloud | Hook quotes a provocative thread title or premise; Body escalates tension through plot turns with narrator commentary; Resolution delivers the moral or punchline. |

### Canonical Pipeline Stage Flow

The video pipeline stage sequence is immutable:

```
intent_classification → planning → scripting → storyboard_generation → render_assembly → finalizing
```

Post-pipeline (non-blocking): `stageViralityAndCaption()`

1. **Intent Classification** (Pilot: `instruct-phi4-pro-q8-prod`) — Parses user input into structured creative intent. Malformed JSON falls back deterministically to a structured object derived from the request.
2. **Planning** (Architect: `plan-qwen25-pro-q5km-prod`) — Generates 5 precise production beats (HOOK, CONTEXT, INSIGHT, PROOF, CTA) structured according to the selected `templateFamily`.
3. **Scripting** (Architect) — Produces narration text with strict section markers (`[HOOK]`, `[BODY]`, `[RESOLUTION]`, `[CTA]`), visual cues (`[VISUAL: ...]`), and tone rules.
4. **Storyboard Generation** (Architect) — Generates scene frames, camera motions, and visual prompts for rendering.
5. **Render Assembly** (Renderer) — Synthesizes narration (Kokoro TTS / Piper / eSpeak), masters audio with EBU R128 two-pass loudnorm (Gap B fail-open), generates kinetic captions, and renders 1080x1920 MP4 via FFmpeg, ComfyUI, or Modal GPU.
6. **Finalizing** (Assets layer) — Verifies MP4 with FFprobe, runs template-aware QC, and packages metadata.

---

## File map

| Path | Role |
| --- | --- |
| `apps/swarmx-api/src/types/video.ts` | All video domain types: job, intent, script, storyboard, render, and API contracts. |
| `apps/swarmx-api/src/types/events.ts` | SSE event union, including video lifecycle variants. |
| `apps/swarmx-api/src/services/video-queue.ts` | In-memory job registry, FIFO processor, and SSE emission. |
| `apps/swarmx-api/src/services/video-orchestrator.ts` | Pressure-aware pipeline execution, Ollama calls, and ComfyUI dispatch. |
| `apps/swarmx-api/src/services/video-assets.ts` | File-system helpers for artifact storage and cleanup. |
| `apps/swarmx-api/src/services/runtime-profiles.ts` | Typed runtime profile resolver for `constrained_cpu_8gb`, `standard_cpu_16gb`, and `accelerated_optional`. |
| `apps/swarmx-api/src/services/voice-providers.ts` | Server-side voice provider adapters for Kokoro microservice probing, Piper probing, and honest `espeak-ng` fallback synthesis. |
| `src/swarmx/services/kokoro_tts_server.py` | Optional local Kokoro TTS microservice entrypoint. The module is installed in the repo; install the Python `tts` extra before starting it. |
| `apps/swarmx-api/src/routes/video.ts` | Fastify route plugin for all `/api/video/*` endpoints. |
| `apps/swarmx-api/src/server.ts` | Registers `videoRoutes` under `/api/video`. |
| `apps/swarmx-dashboard/src/lib/video-dashboard.ts` | Dashboard-facing adapter layer that normalizes API payloads into UI-safe video job shapes. |
| `apps/swarmx-dashboard/src/stores/video.ts` | Zustand store for job map, SSE upsert, and status helpers. |
| `apps/swarmx-dashboard/src/stores/events.ts` | Routes shared compact video progress events into the video store. |
| `apps/swarmx-dashboard/src/app/(dashboard)/video/page.tsx` | Main video workspace page with form and queue list. |
| `apps/swarmx-dashboard/src/app/(dashboard)/video/loading.tsx` | Suspense skeleton. |
| `apps/swarmx-dashboard/src/app/(dashboard)/video/error.tsx` | Error boundary. |
| `apps/swarmx-dashboard/src/components/video/VideoJobForm.tsx` | Job creation form. |
| `apps/swarmx-dashboard/src/components/video/VideoJobCard.tsx` | Job card with progress, stage log, and output preview. |
| `apps/swarmx-dashboard/src/components/video/VideoJobTimeline.tsx` | Compact and full stage timeline components. |
| `apps/swarmx-dashboard/src/components/layout/NavRail.tsx` | Sidebar nav with the video entry. |
| `apps/swarmx-dashboard/src/app/(dashboard)/layout.tsx` | Breadcrumb mapping including `/video`. |
| `workflows/video-generation.yaml` | Workflow definition with stages, owners, and models. |
| `agents/catalog.yaml` | Agent catalog including `video-planner`. |
| `agents/video-planner.md` | Video planner agent persona and stage output specs. |

---

## Environment setup

Create or extend your `.env` / `apps/swarmx-api/.env.local`:

```bash
# ── API server ──────────────────────────────────────────────────────────────
SWARMX_API_PORT=3001
SWARMX_API_HOST=127.0.0.1

# ── Video model assignments ──────────────────────────────────────────────────
# These must match Ollama model names (run `ollama list` to verify)
SWARMX_MODEL_FAST=instruct-phi4-pro-q8-prod             # default fast model
SWARMX_MODEL_REASON=reason-deepseekr1-pro-q5km-prod     # narrative planning
SWARMX_MODEL_CODE=code-qwen25-pro-q5km-prod             # script + storyboard generation

# ── Render target (optional — jobs degrade gracefully without it) ────────────
SWARMX_COMFYUI_URL=http://127.0.0.1:8188
SWARMX_VIDEO_ARTIFACT_DIR=./.swarmx/video/artifacts
SWARMX_VIDEO_EXPORT_DIR=./.swarmx/video/exports
SWARMX_VIDEO_PUBLIC_URL_BASE=/api/video/files
SWARMX_VIDEO_TEMP_DIR=./.swarmx/video/tmp
SWARMX_VIDEO_FFMPEG_TIMEOUT_MS=240000
SWARMX_VIDEO_FFPROBE_TIMEOUT_MS=15000
SWARMX_VIDEO_HIGH_PRESSURE_DELAY_MS=3000
SWARMX_VIDEO_API_TOKEN=replace-me-for-write-routes
SWARMX_HOST_PROFILE=constrained_cpu_8gb
SWARMX_TTS_PROVIDER=auto
SWARMX_TTS_URL=http://127.0.0.1:8888
SWARMX_TTS_PIPER_MODEL_PATH=/path/to/piper/voice.onnx

# ── CORS ─────────────────────────────────────────────────────────────────────
SWARMX_DASHBOARD_ORIGIN=http://localhost:3000
```

Local renders now produce a production package beside the MP4: transcript, SRT,
VTT, render manifest, hashes, `quality-report.json`, `rights-manifest.json`,
`platform-manifest.json`, `voice-lineage.json`, `template-lineage.json`, and
`thumbnail.jpg`. Compatibility copies of the older QC/provenance filenames are
also emitted for downstream tools that have not migrated yet. A valid decode can
earn `TECHNICALLY_VALID`; postable packages require the stricter tier ladder
`PRODUCTION_PACK_VALID` → `READY_TO_POST` → `PUBLISHED_VERIFIED`.

The local FFmpeg fallback is no longer a flat-color text plate. Production
tiers render deterministic `drawgrid` texture, layered motion panels, accent
scan lines, caption cards, and a progress bar directly in FFmpeg, so upgraded
backgrounds remain reproducible without external media or model-generated
filter graphs. The V6.2.61 motion pass keeps that CPU-safe filter class while
adding style-specific pulse/drift profiles, niche-aware accent hue shifts, a
third slow parallax `drawbox` layer, and a hook-window amplitude boost tied to
the first caption card timing. Do not replace these with `zoompan`, `vignette`,
or other heavier filters on the 16 GB CPU-only profile.

The optional ComfyUI path now builds its LTX prompt from the user prompt plus
`tone`, `niche`, `style`, and first storyboard-frame context. This keeps the
AI-backdrop path visually aligned with the deterministic FFmpeg fallback.

Kokoro support is installed at the application/provider layer. To make it the
active neural voice provider on a host, start the local service from the repo
virtualenv. Install the optional Python extra only if import verification fails.

```bash
SWARMX_TTS_PROVIDER=kokoro .venv/bin/python -m swarmx.services.kokoro_tts_server --port 8888
```

If the service is not reachable or reports `engine: unavailable`, the API reports a degraded voice capability and falls back according to `SWARMX_TTS_PROVIDER`. `/api/system/health` can also include a voice fallback warning when Kokoro is unavailable and the benchmarked provider path selects Piper or eSpeak instead; the dashboard shows that as a warning without blocking submission.

Kokoro synthesis supports section-level prosody for structured scripts. HOOK
segments render slightly faster, BODY uses baseline speed, and
RESOLUTION/CTA slow down for a deliberate close. For storytime jobs using
`storyMode: "dialogue_storytime"` or `voiceProfileId:
"kokoro_storytime_dual"`, quoted/dialogue lines can route to a second Kokoro
speaker. Piper and eSpeak remain single-pass fallbacks.

Create or extend your `apps/swarmx-dashboard/.env.local`:

```bash
SWARMX_API_URL=http://127.0.0.1:3001
SWARMX_VIDEO_API_TOKEN=replace-me-for-write-routes
```

The dashboard proxies `/api/*` through its Next.js server. Browser code never
receives `SWARMX_VIDEO_API_TOKEN`; the server-side proxy injects it only for
mutating requests. Do not configure a `NEXT_PUBLIC_*` write token.

### Local media binary requirements

Production local renders require:

```bash
command -v ffmpeg
command -v ffprobe
command -v espeak-ng
```

`ffmpeg` renders the MP4, `ffprobe` validates the final artifact, and
`espeak-ng` produces narration audio. Missing binaries fail with stable,
actionable video error codes (`FFMPEG_UNAVAILABLE`, `FFPROBE_UNAVAILABLE`, or
`ESPEAK_UNAVAILABLE`). Silent audio is allowed only when
`SWARMX_VIDEO_ALLOW_SILENT_AUDIO=1`; the default is to fail rather than produce
a misleading voiced-video success. This escape hatch is for deliberate local
testing only: the renderer supplies an AAC silence track so the MP4 remains
valid, but it does not synthesize narration or honor the selected `voice`.

### Ollama model requirements

Pull the required models before starting the API:

```bash
ollama pull route-phi4-lite-q4km-prod
ollama pull instruct-phi4-pro-q8-prod
ollama pull plan-qwen25-pro-q5km-prod
ollama pull reason-deepseekr1-pro-q5km-prod
ollama pull code-qwen25-pro-q5km-prod
```

For an 8 GB CPU-only first-video run, use the low-RAM Pilot profile instead of
the Q8 Pilot or 7B planner:

```bash
ollama create instruct-phi4-lite-q4km-prod \
  -f models/Modelfiles/primary/instruct-phi4-lite-q4km-prod.modelfile
```

Verify they are available:

```bash
ollama list
pnpm --filter @swarmx/api run test:models
```

The model gate is non-mutating. It validates the canonical operator registry,
directive-required model metadata, Modelfile presence, and executable setup
references without pulling, creating, or deleting Ollama models.

---

## Installation & startup

From the monorepo root:

```bash
# 1. Install all workspace dependencies
pnpm install --frozen-lockfile

# 2. (Optional) Ensure video output dir exists
mkdir -p .swarmx/video/artifacts .swarmx/video/exports .swarmx/video/tmp

# 3. Start the API
pnpm --filter @swarmx/api dev

# 4. Start the dashboard (separate terminal)
pnpm --filter @swarmx/dashboard dev
```

Verify API availability and video routes:

```bash
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/api/video/templates
curl http://127.0.0.1:3001/api/video/jobs
```

Validate package gates before exercising the video UI:

```bash
pnpm --filter @swarmx/types typecheck
pnpm --filter @swarmx/api build
pnpm --filter @swarmx/api test
pnpm --filter @swarmx/api run test:video:smoke
pnpm --filter @swarmx/dashboard typecheck
```

### Write-route auth

The following routes require write auth:

- `POST /api/video/jobs`
- `POST /api/video/jobs/:id/cancel`
- `DELETE /api/video/jobs/:id`
- `POST /api/video/jobs/:id/resume`
- `POST /api/video/jobs/reprioritize`
- `POST /api/video/jobs/:id/publish`
- `POST /api/video/caption-draft`
- `POST /api/video/caption/score`
- `POST /api/video/virality-score`

Provide the token as either:

```bash
-H "Authorization: Bearer $SWARMX_VIDEO_API_TOKEN"
```

or:

```bash
-H "x-video-api-key: $SWARMX_VIDEO_API_TOKEN"
```

If `SWARMX_VIDEO_API_TOKEN` is unset in production, write routes fail closed
with `401 unauthorized`. In development, local API writes remain open for
operator convenience, but the dashboard should still use the server-side proxy
when a token is configured.

### Prewarm the Pilot text model (CPU-only hosts)

**V6.2.15**: automatic. When `SWARMX_VIDEO_LOW_RAM_MODE=1` is active — either
explicitly or auto-detected on hosts where `MemAvailable < 6170 MB` — the API
fires a fire-and-forget prewarm of `instruct-phi4-lite-q4km-prod` at startup
right after `ModelOrchestrator.init()`. The 100–140 s cold load happens off
the user path; the first video submission finds a warm model.

Auto-detection at boot logs one line so you can confirm the resolved mode:

```text
Video pipeline runtime mode resolved
  { lowRamMode: true, availableMb: 8527, videoModel: "instruct-phi4-lite-q4km-prod" }
```

If you want to prewarm manually (e.g. after a `killall ollama` while the API
stays up), the exact curl is still supported. **Set `keep_alive` longer than
the full pipeline wall time — ~8 min on CPU-only 16 GB hosts — so the model
does not unload between stages:**

```bash
curl -sS http://127.0.0.1:11434/api/generate \
  -d '{"model":"instruct-phi4-lite-q4km-prod","prompt":"warm","stream":false,"keep_alive":"20m","options":{"num_predict":8,"num_ctx":2048}}'
```

With a warm model, intent classification completes in ~14 s. Without it, the
first request spends part of the current 240 s intent-classification budget on
the cold-load window. Symptom: a slow first classification followed by a faster
retry because the previous cold-load left the model partially cached. Prefer
explicit prewarm over relying on retry.

The dashboard video page shows a **"Loading Model"** notice when a running or
classifying job has been active for more than 30 seconds — this is the expected
cold-start indicator, not a failure. The ETA is read from
`/api/system/health → warmup.coldStartEtaSecs`; when health does not provide an
ETA, the dashboard shows **ETA unknown** instead of falling back to a local
constant.

### Script quality guardrails

The scripting stage enforces the shared `HOOK_BLOCKLIST` from
`apps/swarmx-api/src/lib/creative-quality.ts`. A blocklisted hook is not fatal:
the first valid script is regenerated once with a reinforced no-preamble
instruction. If the second usable script still opens with a blocked phrase, the
job continues and records a `scriptQualityWarnings` entry so the dashboard can
surface the creative issue without converting a recoverable soft-quality signal
into a failed render.

---

## API reference

All endpoints are under the `/api/video` prefix registered in `server.ts`.

---

### POST /api/video/jobs

Create a new video generation job and enqueue it.

**Request body:**

```json
{
  "prompt": "string (required, 1-2000 chars)",
  "platform": "tiktok | youtube_shorts | reels | generic",
  "niche": "motivational | finance | facts | true_crime | tech | other",
  "targetDurationSeconds": "optional; default 30, clamped to 15–180",
  "modelTier": "fast | worker | supervisor | reasoner",
  "audience": "string (optional, <=160 chars)",
  "tone": "educational | urgent | warm | contrarian | cinematic | minimal | faceless_broll | kinetic_text",
  "style": "faceless_broll | kinetic_text | storytime | tutorial | myth_busting",
  "captionStyle": "bold_center | lower_third | minimal",
  "voice": "default | calm | energetic | narrator",
  "voiceProfileId": "auto | kokoro_warm | kokoro_narrator | kokoro_energetic | kokoro_contrarian | kokoro_storytime_dual",
  "storyMode": "single_narrator | dialogue_storytime",
  "clientRequestId": "optional-idempotency-key"
}
```

`voice` remains the coarse fallback hint. `voiceProfileId` pins a concrete recurring profile when supported, and `storyMode` nudges narration defaults for formats like storytime without changing the rest of the script contract. When a Kokoro profile is requested, the renderer now prefers the Kokoro provider ahead of benchmark ordering; if that provider is unavailable, the fallback reason is preserved in the packaged voice artifact. Kokoro artifacts may also include `prosodySegments` documenting each section's voice id, speaking rate, and measured duration.

**Minimal request:**

```bash
curl -X POST http://localhost:3001/api/video/jobs \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A 30-second motivational video about starting your first business"}'
```

Observed smoke result on the current local stack: the route returns `201 Created` immediately with a job id, even when downstream orchestration later fails under timeout or memory pressure.

**Full request:**

```bash
curl -X POST http://localhost:3001/api/video/jobs \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Explain compound interest in a way that motivates a first-time investor", "platform": "tiktok", "niche": "finance", "targetDurationSeconds": 45, "audience":"first-time investors", "tone":"warm", "style":"faceless_broll", "captionStyle":"bold_center", "voice":"narrator", "voiceProfileId":"kokoro_narrator", "storyMode":"single_narrator"}'
```

**Response `201`:**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "createdAt": "2026-05-21T09:55:00.000Z",
  "message": "Video job created. Track progress via SSE or GET /api/video/jobs/550e8400-e29b-41d4-a716-446655440000"
}
```

**Response `503` (RAM gate):**

Admission is profile-aware: the route calculates the selected model's estimated
RAM plus an 800 MB reserve. The low-RAM Pilot-lite profile needs at least 3300
MB; full 7B planning profiles need at least 6170 MB. When available RAM is
below the selected profile's requirement, admission is blocked:

```json
{
  "error": "insufficient_ram_for_video",
  "message": "Insufficient RAM for video generation",
  "availableMb": 742,
  "minimumRequired": 3300
}
```

---

### GET /api/video/jobs

List video jobs, most-recent first.

**Query params:**

| Param | Type | Default | Max |
| --- | --- | --- | --- |
| `status` | enum | unset | — |
| `limit` | integer | `20` | `100` |
| `offset` | integer | `0` | — |

```bash
curl "http://localhost:3001/api/video/jobs?limit=10"
```

**Response `200`:**

```json
{
  "jobs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "running",
      "request": {
        "prompt": "A 30-second motivational video about starting your first business",
        "platform": "tiktok"
      },
      "overallProgress": 35,
      "createdAt": "2026-05-21T09:55:00.000Z",
      "updatedAt": "2026-05-21T09:55:42.000Z"
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0,
  "queueDepth": 0,
  "runningCount": 1
}
```

---

### GET /api/video/jobs/:id

Full job detail including intent, script, storyboard, render manifest, stage log, and warnings.

Observed smoke result on the current local stack: the job detail route returns queued and failed states correctly, including timeout payloads such as `Stage intent_classification timed out after 4000ms`.

```bash
curl http://localhost:3001/api/video/jobs/550e8400-e29b-41d4-a716-446655440000
```

**Response `200` (shape):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "request": {
    "prompt": "A 30-second motivational video about starting your first business",
    "platform": "tiktok"
  },
  "stages": {
    "scripting": {
      "stage": "scripting",
      "stageProgress": 35,
      "overallProgress": 35,
      "startedAt": "2026-05-21T09:55:14.000Z"
    }
  },
  "currentStage": "scripting",
  "overallProgress": 35,
  "retryCount": 0,
  "createdAt": "2026-05-21T09:55:00.000Z",
  "updatedAt": "2026-05-21T09:55:42.000Z"
}
```

**Response `404`:**

```json
{ "error": "Job 550e8400-e29b-41d4-a716-446655440000 not found" }
```

---

### POST /api/video/jobs/:id/cancel

Cancel a job. Returns `409` when the job is already terminal.

```bash
curl -X POST http://localhost:3001/api/video/jobs/550e8400-e29b-41d4-a716-446655440000/cancel \
  -H "Authorization: Bearer $SWARMX_VIDEO_API_TOKEN"
```

### DELETE /api/video/jobs/:id

REST alias for cancellation, identical behavior to POST cancel.

```bash
curl -X DELETE http://localhost:3001/api/video/jobs/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $SWARMX_VIDEO_API_TOKEN"
```

### POST /api/video/jobs/:id/resume

Resume a terminal job from a prior stage marker if partial artifacts exist.

```bash
curl -X POST http://localhost:3001/api/video/jobs/550e8400-e29b-41d4-a716-446655440000/resume \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SWARMX_VIDEO_API_TOKEN" \
  -d '{"fromStage":"failed"}'
```

### POST /api/video/jobs/reprioritize

Reorder queued jobs. Accepts queue order as an array of job IDs.

```bash
curl -X POST http://localhost:3001/api/video/jobs/reprioritize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SWARMX_VIDEO_API_TOKEN" \
  -d '{"orderedIds":["job-a","job-b","job-c"]}'
```

---

### GET /api/video/jobs/:id/artifacts

Fetch resolved artifact pointers for a job, including published target URLs and persisted publish history.

```bash
curl http://localhost:3001/api/video/jobs/550e8400-e29b-41d4-a716-446655440000/artifacts
```

---

### GET /api/video/jobs/:id/analysis

Fetch engagement heuristic analysis and caption draft state for a completed job.

```bash
curl http://localhost:3001/api/video/jobs/550e8400-e29b-41d4-a716-446655440000/analysis
```

---

### POST /api/video/jobs/:id/publish

Create a platform-specific publish handoff record. The API persists the publish attempt on the job, updates `outputArtifacts.exportPathByPlatform`, and emits a `video:snapshot` event so the dashboard refreshes immediately.

```bash
curl -X POST http://localhost:3001/api/video/jobs/550e8400-e29b-41d4-a716-446655440000/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SWARMX_VIDEO_API_TOKEN" \
  -d '{"platform":"tiktok"}'
```

**Response shape:**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "publishHistory": [
      {
        "publishId": "2d24...",
        "platform": "tiktok",
        "status": "pending_review",
        "approvalState": "pending_review",
        "deliveryMode": "studio_export",
        "accountLabel": "TikTok Studio",
        "requestedAt": "2026-06-01T09:00:00.000Z",
        "updatedAt": "2026-06-01T09:00:00.000Z",
        "requiresApproval": true,
        "platformUrl": "https://studio.tiktok.com/upload?..."
      }
    ]
  },
  "result": {
    "publishId": "2d24...",
    "platform": "tiktok",
    "status": "pending_review"
  }
}
```

Current adapter behavior:

- `generic`: direct export, no approval required, immediately marked `published`
- `tiktok`: if `SWARMX_TIKTOK_ACCESS_TOKEN` is set and `SWARMX_TIKTOK_API_APPROVED=1`, the adapter uploads via the TikTok Content API and returns `scheduled`, `published`, `failed`, or `pending_review` based on the API result; otherwise it falls back to generic export with persisted `pending_review` approval state
- `reels`: if `SWARMX_INSTAGRAM_ACCESS_TOKEN`, `SWARMX_INSTAGRAM_USER_ID`, and a publicly reachable output URL are available, the adapter uses the Instagram Graph API and returns `scheduled` or `published`; otherwise it falls back to generic export with persisted `pending_review` approval state
- `shorts`: local export/studio handoff path, no direct platform API adapter yet

---

### POST /api/video/caption-draft

Generate a standalone caption draft without creating a full video job.

```bash
curl -X POST http://localhost:3001/api/video/caption-draft \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SWARMX_VIDEO_API_TOKEN" \
  -d '{"prompt":"How compound interest changes your life","platform":"tiktok"}'
```

Observed smoke result on the current local stack: the route reaches handler logic and returns `503 caption_generation_unavailable` when the caption generator cannot complete within the available runtime conditions.

---

### POST /api/video/virality-score

Generate a standalone engagement heuristic preview. The endpoint name is kept
for backward compatibility; scores are guidance signals, not predictions that a
video will become viral.

```bash
curl -X POST http://localhost:3001/api/video/virality-score \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SWARMX_VIDEO_API_TOKEN" \
  -d '{"prompt":"How compound interest changes your life","platform":"tiktok","durationSec":30}'
```

### POST /api/video/caption/score

Generate a caption draft and engagement heuristic score in one call.

Rate limit: 10 requests/minute per connection by default
(`SWARMX_VIDEO_CAPTION_SCORE_LIMIT_PER_MIN`).

```bash
curl -X POST http://localhost:3001/api/video/caption/score \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SWARMX_VIDEO_API_TOKEN" \
  -d '{"prompt":"How compound interest changes your life","platform":"tiktok"}'
```

Returns `429` when the per-connection rate limit is exceeded.

---

### Publish state in job detail

Publish records are persisted in two places on the job payload:

- `job.publishHistory`
- `job.outputArtifacts.publishHistory`

The dashboard list uses the latest record for compact status, while the detail panel renders the full history with approval state and target URL.

---

### Snapshot refresh behavior

After a publish request succeeds, the API broadcasts:

```json
{
  "type": "video:snapshot",
  "data": {
    "job": { "...": "updated job with publishHistory" }
  }
}
```

This avoids a second polling path for publish state and keeps the dashboard job list/detail view in sync with the route mutation.

---

## SSE event lifecycle

Video updates are available through two SSE surfaces:

- `/api/events` for the shared dashboard-wide event stream
- `/api/video/jobs/:id/sse` for a job-scoped stream that immediately emits a `video:snapshot` payload and then continues with incremental updates and heartbeats

API video lifecycle events (from `apps/swarmx-api/src/types/events.ts`) use canonical
`{ type, timestamp, data }` shape:

- `video:created`
- `video:queued`
- `video:stage_started`
- `video:progress`
- `video:completed`
- `video:failed`
- `video:cancelled`
- `video:snapshot`

### Event: `video:progress` (API lifecycle shape)

```json
{
  "type": "video:progress",
  "timestamp": "2026-05-21T09:55:42.000Z",
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "stage": "scripting",
    "stageProgress": {
      "stage": "scripting",
      "stageProgress": 0,
      "overallProgress": 30,
      "startedAt": "2026-05-21T09:55:42.000Z"
    },
    "overallProgress": 30,
    "message": "Starting scripting..."
  }
}
```

### Compact progress projection on shared dashboard stream

The dashboard `events` store currently handles a compact projection event shape from
`@swarmx/types` for `video:progress` and forwards it to `useVideoStore.applyProgressEvent()`.
That shape includes `jobId`, `status`, `degradeMode`, `progress`, `timestamp`, `correlationId`, and optional `error`.
The richer API lifecycle events are consumed by `useVideoStore.ingestEvent()`.

### Typical stage sequence for a successful job

```text
video:created
video:stage_started(stage=intent_classification)
video:progress(stage=intent_classification)
video:stage_started(stage=planning)
video:progress(stage=planning)
video:stage_started(stage=scripting)
video:progress(stage=scripting)
video:stage_started(stage=storyboard_generation)
video:progress(stage=storyboard_generation)
video:stage_started(stage=render_assembly)
video:progress(stage=render_assembly)
video:stage_started(stage=finalizing)
video:progress(stage=finalizing)
video:completed
```

---

## Job lifecycle & state machine

The orchestrator executes these canonical stages in order:

1. `intent_classification`
2. `planning`
3. `scripting`
4. `storyboard_generation`
5. `render_assembly`
6. `finalizing`

State transitions are queue-driven:

- Initial: `queued`
- Active processing: `running`
- Terminal: `completed` | `failed` | `cancelled`

At any stage boundary, a cancelled job is aborted and no further stages run.

---

## Degradation behavior

Current implementation degrades via retryable/terminal failures and pressure-aware timeouts.

- Under critical pressure, orchestration fails fast with `PRESSURE_CRITICAL`.
- Transient upstream failures (`TIMEOUT`, `OLLAMA_UNAVAILABLE`, `COMFY_UNAVAILABLE`) are marked retryable.
- Missing local render binaries fail clearly with `FFMPEG_UNAVAILABLE`,
  `FFPROBE_UNAVAILABLE`, or `ESPEAK_UNAVAILABLE`.
- `SWARMX_VIDEO_ALLOW_SILENT_AUDIO=1` is an explicit development-only fallback:
  it creates a valid MP4 with an AAC silence track when `espeak-ng` is absent;
  it does not create a narrated video.
- Final artifacts are accepted only after the export file exists, has nonzero
  size, and FFprobe reports a valid stream, duration, dimensions, frame rate,
  and format.
- Final artifacts served by `/api/video/files/:filename` are allowlisted to
  `.mp4` and `.webm`. Unknown extensions return `415 unsupported_media_type`.
- Job retry behavior is controlled by queue policy (`SWARMX_VIDEO_MAX_RETRIES`, default `3`).
  Each retryable failure re-queues after an exponential backoff delay
  (`SWARMX_VIDEO_RETRY_BASE_DELAY_MS * 2^retryCount`, jittered by
  `SWARMX_VIDEO_RETRY_JITTER_MS`, capped at `SWARMX_VIDEO_RETRY_MAX_DELAY_MS`).
  The scheduled time is recorded on the job as `nextRetryAt` /
  `nextRetryDelayMs` and cleared once the job resumes, completes, or is
  cancelled. Every failure — retryable or terminal — appends a capped
  (25-entry) record to `job.errorLog` for dead-letter triage.

### Creative Factory V4 contracts

The Creative Factory registry exposes typed records under `/api/video/factory/*`:

- `/creative-dna` for local creator preferences and constraints.
- `/concept-tournaments` for scored concept candidates.
- `/variants` for variant lineage and learning-loop references.
- `/agents` for typed agent specs such as intake, strategy, tournament, rights,
  quality council, and analytics evolution.

These records persist through the existing local JSON snapshot/JSONL state
store. Learning records remain approval-gated; observed analytics are not
conflated with predicted virality.

---

## Model assignment

| Stage | Model env var | Default | Typical latency (8 GB) |
| --- | --- | --- | --- |
| Intent classification | `SWARMX_VIDEO_INTENT_MODEL` | `instruct-phi4-pro-q8-prod` | 3–8 s |
| Planning | `SWARMX_VIDEO_PLAN_MODEL` | `plan-qwen25-pro-q5km-prod` | 45–90 s |
| Scripting | `SWARMX_VIDEO_SCRIPT_MODEL` | `plan-qwen25-pro-q5km-prod` | 60–120 s |
| Storyboard | `SWARMX_VIDEO_STORYBOARD_MODEL` | `plan-qwen25-pro-q5km-prod` | 120–300 s |
| Render assembly | `ffmpeg` / `ffprobe` / `espeak-ng` | Local binaries | 15–120 s |

The default intent path still attempts the full Q8 Pilot first. If that model
returns a retryable Ollama failure during intent classification, the stage
unloads it and retries once with canonical Pilot-lite
(`instruct-phi4-lite-q4km-prod`) inside the same stage timeout. The operator
trace and final `modelsUsed.intent_classification` record the fallback model, so
the recovery path is visible rather than hidden. If the first attempt exhausts
the stage budget after recording a Q8 Pilot failure, the job retry starts
directly on Pilot-lite instead of spending another cold-start cycle on the
unstable Q8 runner. After intent has recovered to Pilot-lite, planning,
scripting, and storyboard generation also use the Pilot-lite recovery profile
for that job so constrained CPU hosts do not reload the heavier planner and
trip the M13 planning timeout immediately after a successful intent retry.

Stage `maxTokens` values are hard caps over adaptive model profile
`num_predict`, so shared 7B defaults cannot silently expand short video stages.
Planning asks for only the five required production beats and is capped at 320
generated tokens; intent classification keeps a 256-token cap so Pilot-lite can
return complete strict JSON.

All Ollama and ComfyUI HTTP calls in the video-adjacent API surface must use the
shared backend classifier. The video pipeline, ComfyUI client, Ollama service,
Composer route, and server startup prewarm call `fetchBackend()` so network
failures keep stable error codes such as `OLLAMA_UNAVAILABLE` and
`COMFY_UNAVAILABLE`. Do not introduce a bare `fetch()` for those backends;
`video-regression-check.ts` guards the Composer `/api/chat`, `/api/ps`, and
`/api/generate` call sites plus server prewarm explicitly.

`pnpm --filter @swarmx/api run test:m13` validates the HTTP job detail contract
against the canonical completed-job `output` metadata. The required production
evidence is `output.modelsUsed`, `output.certificationTier`, and
`output.mediaQualityReport`; older top-level mirrors remain accepted by the
harness only for backwards compatibility.

The harness targets the direct Fastify API, not the dashboard proxy. API base
resolution order is:

```text
SWARMX_API_BASE_URL
SWARMX_API_URL
http://${SWARMX_API_HOST ?? "127.0.0.1"}:${SWARMX_API_PORT ?? "3001"}
```

Storyboard extraction accepts strict numbered/bulleted scene lines first, then
falls back to `[SCENE N | BEAT]` lines and `[VISUAL: ...]` tags from either the
storyboard response or the script. Extracted frames are normalized and clamped to
the storyboard schema budget before validation so one overlong scene line does not
invalidate the entire storyboard stage. Generic safe-default frames are only used
when no script-specific visual beats can be recovered.

For the CPU `ffmpeg_kinetic_text` renderer, template-aware QC treats deliberate text
holds up to 6 seconds as expected. Longer freezes remain review warnings because they
usually indicate a missing motion beat rather than normal narration pacing.

Set `SWARMX_VIDEO_LOW_RAM_MODE=1` to force all four text stages to
`instruct-phi4-lite-q4km-prod`. Do not send `modelTier` in the first low-RAM
video payload; it remains a text-stage override for compatibility, not a fast
pipeline selector.

### First-job admission checklist

Do not submit a real job merely because `POST /api/video/jobs` is reachable.
Before the first render, verify API and Ollama liveness, ensure `ffmpeg`,
`ffprobe`, and `espeak-ng` are installed (or explicitly choose silent testing),
and compare available physical RAM with the selected profile requirement.

**RAM requirements by profile:**

| Profile | Minimum available RAM | When to use |
| ------- | --------------------- | ----------- |
| Low-RAM / Pilot-lite (`SWARMX_VIDEO_LOW_RAM_MODE=1`) | 3300 MB | Constrained 8 GB hosts; no model resident |
| Full 7B planning (default) | 6170 MB | Standard; available on 16 GB hosts with headroom |
| reasoner tier (`modelTier=reasoner`) | 6170 MB | Requires the same headroom as the full 7B planning profile |

On **constrained 8 GB hosts**, use `SWARMX_VIDEO_LOW_RAM_MODE=1` only when at
least 3300 MB is available and no model is currently resident. Do not preload
Relay or a specialist before that measurement.

On **16 GB hosts** (auto-detected by `startup-enhanced.sh` when total RAM ≥ 12 GB,
or pinned via `SWARMX_HOST_PROFILE=16gb`), the full 7B planning profile (6170 MB
minimum) is typically available with comfortable headroom. `SWARMX_VIDEO_LOW_RAM_MODE`
is not needed on these hosts unless free RAM is unexpectedly constrained at the
time of submission; the admission gate will block the job and report the deficit if
so.

The dashboard video form defaults to **Auto** model routing, which intentionally
omits `modelTier` from `POST /api/video/jobs`. Operators can still choose an
explicit model tier from the form, but that should be reserved for hosts with
measured memory headroom for the selected profile.

On constrained hosts, startup prewarm and predictive prewarm default to
`SWARMX_MODEL_STARTUP_PREWARM=0` and `SWARMX_MODEL_PREDICTIVE_PREWARM=0`. Keep
those defaults on low-RAM video runs so Relay or a specialist is not
speculatively loaded before the foreground text model. On 16 GB hosts these
prewarm defaults are raised to `1` by `startup-enhanced.sh`, which is safe
because Relay (phi4-lite, ~2.5 GB, not is7B) can co-reside with the planning
model without triggering the SINGLE-7B LOCK.

Stage timeouts are bounded through:

```text
VIDEO_INTENT_CLASSIFY_TIMEOUT_MS
VIDEO_PLANNING_TIMEOUT_MS
VIDEO_SCRIPTING_TIMEOUT_MS
VIDEO_STORYBOARD_TIMEOUT_MS
VIDEO_RENDER_TIMEOUT_MS
VIDEO_FINALIZING_TIMEOUT_MS
```

Renderer selection is controlled by `SWARMX_VIDEO_RENDER_BACKEND=auto|comfyui|ffmpeg`.
Production runs should keep `SWARMX_VIDEO_ALLOW_STUB_RENDER=0`. The local FFmpeg
path is the default production fallback. ComfyUI handoff requires
`SWARMX_COMFYUI_OUTPUT_DIR`; returned filenames are copied into the SwarmXQ
export directory before metadata is built. `SWARMX_COMFYUI_URL` controls the
ComfyUI base URL, with legacy `COMFY_HOST` normalized by the API env schema.

When the Python governor reports high memory pressure, the orchestrator waits
`SWARMX_VIDEO_HIGH_PRESSURE_DELAY_MS` before probing again. The value defaults
to 3000 ms, is clamped to 1000–30000 ms, and preserves the legacy
`HIGH_PRESSURE_DELAY_MS` alias for existing host scripts.

Context windows are scaled down under pressure (`adaptive-timeout-config.ts`):

| Pressure | num_ctx scale | num_predict scale |
| --- | --- | --- |
| `normal` | 100% | 100% |
| `high` | 75% | 65% |
| `critical` | 50% | 50% |

### Internal LLM stage output formats (V6.2.12)

The orchestrator uses structured output contracts at each text stage. Preserve these
formats — downstream parsing depends on them.

**Intent stage** — packed into the `intent` string field:

```text
HOOK: [one-sentence contrarian or surprising angle] | ARC: [viewer journey start→middle→end] | TAKEAWAY: [specific actionable conclusion]
```

`parseIntentClassification` validates `{ intent: string, complexity: number }`. Extra
fields are silently ignored; the richness is in the `intent` string value. As of
V6.2.63, sanitized model output that is malformed JSON no longer blocks the
entire job: the orchestrator records the malformed model attempt in operator
telemetry and continues with a deterministic structured intent derived from the
validated request. Transport failures, cancellation, and pressure failures still
follow the existing retry/error paths.

**Planning stage** — exactly 5 named beats in order:

```text
HOOK (0–4 s)          — the scroll-stopping opener
CONTEXT (~25% mark)   — familiar pain or premise
INSIGHT (~65% mark)   — the reframe or unexpected truth
PROOF (to −7 s)       — concrete illustration
CTA (last 7 s)        — specific behavior, not generic
```

Beat timing is derived from `targetDurationSeconds`.

**Scripting stage** — section markers that `extractHookLine()` and downstream
renderers depend on:

```text
[HOOK]
(12–18 words, pattern-interrupting, no preamble)

[BODY]
(3–4 sentences, escalating stakes, [VISUAL: ...] cues inline)

[RESOLUTION]
(1–2 concrete, actionable sentences)

[CTA]
(5–8 words, specific)
```

`extractHookLine(scriptText)` finds the first non-empty line after `[HOOK]` for
virality scoring. If the `[HOOK]` marker is absent it falls back to `lines[0]`.

**Storyboard stage** — per-scene format:

```text
- [SCENE N | BEAT] [Text: "..."] | Motion: ... | Color: ... | Pacing: ...
```

Color palettes are tone-mapped: `contrarian` → high-contrast B&W + accent;
`urgent` → warm red/amber; `educational` → cool blue/green; etc.

**Caption generator** receives `tone: req.tone` (not `niche`). This was corrected in
8ab025a. The `CAPTION_RULES` validation enforces: `firstLine ≤ 40 chars`, 3–5
hashtags, no URLs in `soundSuggestion`.

**Virality oracle** (`reason-deepseekr1-pro-q5km-prod`) is unavailable in
`LOW_RAM_MODE` — the circuit breaker returns `undefined`. The dashboard surfaces this
as "Virality scoring unavailable in low-RAM mode" on the job detail page; it never
shows a score of 0 or "N/A" as if scoring ran.

---

## Dashboard integration

The dashboard `/video` page is accessible at `http://localhost:3000/video` and is reachable
via the NavRail at keyboard shortcut `⌘7`.

**Live update flow:**

1. `useSwarmXEvents` (mounted by `DashboardShell`) opens the SSE connection to `/api/events`.
2. Each incoming event is passed to `handleEvent()` in `useEventsStore`.
3. Shared compact `video:progress` events are routed via `applyVideoProgress()` which calls
  `useVideoStore.getState().applyProgressEvent()` — a static Zustand accessor, safe outside React.
4. API lifecycle video events are applied in `useVideoStore.ingestEvent()`.
5. The video page subscribes to `useVideoStore` and re-renders on every upsert.
6. React Query polls `GET /api/video/jobs` every 8 seconds as a fallback for clients that
   briefly disconnect from SSE.

**Store state shape (`useVideoStore`):**

```ts
{
  jobs: Map<string, VideoJobSummary>;   // keyed by jobId
  selectedJobId: string | null;         // drives detail panel
  loading: boolean;
  error: string | null;
}
```

**Layout:**

- `/video` (list page) — left panel: submit form + job queue; right panel (lg+): empty state prompting job selection or navigates to `/video/:id` on card click.
- `/video/[id]` (detail page) — two-column layout: left column has the video player, metadata, timeline, and operator trace; right column has ViralityMeter, CaptionEditor, and PlatformPublishPanel.

**Submission UX and failure guidance:**

- The submit form now exposes quick-start presets plus an Essentials/Advanced split so the common path stays short while tone, style, caption, and voice routing remain available.
- Select controls for niche, tone, style, caption style, voice, and voice profile now explain the visible output effect of the current choice. Voice preview buttons use real Kokoro-generated WAV clips in `apps/swarmx-dashboard/public/audio/voice-previews/`, verified with `ffprobe`; if those clips are removed or not generated in a future build, the controls render disabled instead of substituting another TTS provider.
- Runtime readiness messaging from `/api/system/health` can block submission before enqueue when RAM or CPU telemetry indicates the host cannot safely admit a full pipeline job.
- Failed job surfaces now render both the normalized error hint and a concrete next-action string so operators can distinguish retryable pressure problems from missing-binary or configuration failures.
- The first-run empty queue CTA focuses the quick-start prompt gallery. `?`
  opens the keyboard shortcuts overlay, and mobile/narrow dashboard layouts use
  a telemetry drawer controlled by the same telemetry toggle that shows/hides
  the desktop rail.

**Accessibility notes (V6.2.5+):**

- All interactive job cards are fully keyboard-navigable (Enter/Space to select).
- Cancel and download action buttons surface via `focus-visible` ring even when hidden from mouse hover.
- All caption editor form controls have programmatic `<label htmlFor>` associations.
- Publish status feedback is announced via `aria-live="polite"`.
- ViralityMeter dimension bars expose `role="progressbar"` with `aria-valuenow`.

**Dead-letter triage (queue page):**

- The `/video` queue header shows a "Failed (`n`)" filter toggle whenever at
  least one job is in the `failed` state; toggling it narrows the list to
  failed jobs only, with an empty-state message when none remain.
- An advisory banner (`role="status"`) surfaces above the queue when failed
  jobs exist and the filter is not yet active.
- Job cards show retry progress as `retry {retryCount}/{maxRetries}` (default
  ceiling `3`) plus the next scheduled retry time when `nextRetryAt` is set.

**Client / operator disclosure mode:**

- `useUIStore.operatorViewMode` (`"client" | "operator"`, default `"client"`)
  gates internal/debugging surfaces — the Operator Trace table on
  `/video/[id]` and the per-operator token-ceiling chips in the Telemetry
  rail's Governor section.
- Toggle via the CommandBar "Client"/"Operator" button, the command palette
  ("Toggle Operator View"), or the global shortcut `⌘⇧O`.
- A small `DisclosureModeBadge` next to the Telemetry rail header and the
  Operator Trace section header always shows the active mode so a hidden
  section is never mistaken for missing data.
- Telemetry token ceilings render with a `tok` suffix and tooltip so operator
  budget numbers are not confused with RAM or latency.
- The shortcuts overlay and narrow-viewport telemetry drawer use native modal
  dialog activation. When either overlay is open, background controls must not
  appear in the accessibility tree; verify this with `agent-browser snapshot -i`
  after dashboard changes that touch the shell or overlay components.

---

## M13 live certification

Run M13 only against a healthy local runtime. The harness submits a real job
through the Fastify API default (`http://127.0.0.1:3001`) unless
`SWARMX_API_BASE_URL` or `SWARMX_API_URL` is explicitly set.

```bash
redis-cli ping
curl -fsS http://127.0.0.1:11434/api/ps
curl -fsS http://127.0.0.1:8888/health
pnpm --filter @swarmx/api exec tsx scripts/doctor.ts
```

Then start the API with `SWARMX_VIDEO_API_TOKEN` set and run:

```bash
pnpm --filter @swarmx/api run test:m13
```

The successful path writes
`.swarmx/video/artifacts/m13/m13-cert-report.json`. Treat the run as certified
only when that report records all assertions passing and the completed job
output includes a real non-stub MP4, `modelsUsed`, `stageValidationTrace`,
`mediaQualityReport`, and at least `PRODUCTION_PACK_VALID`.

Latest local evidence from 2026-07-24:

- Job `da82bfb8-ff66-4f58-9dd5-c2641d08571c` completed in 862 s through the
  Fastify API with `voice.benchmark.recommendedProviderId: kokoro`.
- The certified MP4 is
  `video_da82bfb8-ff66-4f58-9dd5-c2641d08571c.mp4`: 720x1280 H.264, 30 fps,
  18.00 s, AAC 48 kHz stereo, SHA-256
  `056e161b8a54f99e7f5a1961e43456e6210c88b0dec4006349e01427a1d2e2a7`.
- Media/package checks passed outside the harness: FFmpeg volume detect reported
  `mean_volume: -20.0 dB`, `max_volume: -1.3 dB`; the package contains captions,
  manifests, QC, rights, transcript, thumbnail, template lineage, and voice
  lineage; `/api/video/files/:filename` served the MP4 with `206 Partial Content`.

---

## Browser verification

After M13 passes and the dashboard is running, verify the operator UI with
`agent-browser` instead of relying on HTTP status alone:

```bash
agent-browser doctor
agent-browser open http://localhost:3000/video
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser errors
agent-browser console
agent-browser open http://localhost:3000/system
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser set viewport 390 844
agent-browser open http://localhost:3000/video
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser close
```

For a completed video job, also open `/video/<jobId>` at desktop and narrow
widths. Confirm the video player, certification metadata, timeline, operator
trace, virality/caption panels, runtime guidance, and queue controls remain
visible and keyboard reachable. Page errors must be empty; console output should
not include application errors.

---

## ComfyUI render setup

To enable live rendering, start ComfyUI with low-VRAM flags:

```bash
python main.py --lowvram --force-fp16 --listen 127.0.0.1 --port 8188
```

Required model: `ltx-video-2b-v0.9.1_fp8_e4m3fn.safetensors` in ComfyUI's models directory.

The orchestrator dispatches one `/prompt` request per storyboard shot. Each shot uses the
`LTXVSampler` workflow with the shot's `comfyPrompt` as input. Clips are saved as MP4 with
the prefix `swarmx_video_<jobId>_shot<n>`.

If ComfyUI is not running, the render stage can fail with `COMFY_UNAVAILABLE` and follow the queue retry/fail policy.

---

## Troubleshooting

### `/api/system/health` reports `degraded`

**Cause:** On 8 GB hosts this usually means memory pressure, model probe timeouts, or both.
If `availableRamMb < 800`, SwarmX intentionally downgrades to `rule_engine` topology and the
health surface can remain degraded even while the API `/health` endpoint is OK.

**Fix:** Evict resident 7B models, warm Relay again, then rerun:

```bash
bash scripts/swarm-healthcheck-apex17.sh
```

This is an operational pressure signal, not automatically a regression in the video code path.

---

### `/api/video/jobs` returns `404`

**Cause:** `videoRoutes` not registered in `server.ts`.

**Fix:** Confirm `server.ts` contains:

```ts
import { videoRoutes } from "./routes/video.js";
// ...
await server.register(videoRoutes, { prefix: "/api/video" });
```

This was a known bug fixed in `[VIDEO-SERVER-01]`. If you copied an older `server.ts`, apply
the fix above.

---

### Jobs always show `status: failed` with `No video processor registered`

**Cause:** API is running an outdated `video` route/orchestrator bundle.

**Fix:** Ensure the current `apps/swarmx-api/src/routes/video.ts` and
`apps/swarmx-api/src/services/video-orchestrator.ts` are deployed together.

---

### Pressure warning never shows in the job form

**Cause:** `VideoJobForm.tsx` referenced `s.governorSnapshot` but the events store exports the
field as `governorState`.

**Fix:** Use `VideoJobForm.tsx` from this bundle, which corrects the selector to
`s.governorState?.pressureLevel`. This was `[VIDEO-FORM-01]`.

---

### Job created but SSE events don't arrive in the dashboard

**Checklist:**

1. Confirm `broadcastEvent` in `video-queue.ts` is not throwing. The catch block silently
   swallows errors to avoid crashing the queue — check API logs for repeated SSE exceptions.
2. Confirm `useSwarmXEvents` is mounted. It lives in `DashboardShell` in `layout.tsx`. If you
   have a custom layout that skips `DashboardShell`, SSE will not be subscribed.
3. Confirm `NEXT_PUBLIC_API_URL` points to the correct API host:port.
4. Open browser DevTools → Network → filter by `EventSource` — the `/api/events` stream should
   show `connected` as the first event.

---

### Ollama connection refused

**Checklist:**

1. Is Ollama running? `ollama serve` or check `systemctl status ollama`.
2. Is it listening on the expected interface? By default Ollama binds `127.0.0.1:11434`.
3. Verify: `curl http://localhost:11434/api/tags`
4. The `SWARMX_OLLAMA_URL` env var (if set) must match the Ollama bind address.

---

### Script generation returns `Script generation returned incomplete data`

**Cause:** The model returned partial or malformed JSON. This happens when:

- `num_predict` is too low to complete the JSON object (common under `critical` pressure)
- The model is being swapped mid-generation (OOM kill)

**Fix:** Under high pressure, reduce job `length` to `short`. The orchestrator automatically
scales context and prediction ceilings via `adaptive-timeout-config.ts` — at `critical`
pressure these are halved. If the host has less than 4 GB available, script generation may
not reliably complete for `medium` or `long` jobs.

---

### ComfyUI `POST /prompt` returns `500`

**Checklist:**

1. Confirm the LTX-Video model is present: check ComfyUI's `models/checkpoints/` or
   `models/diffusion_models/` directory for `ltx-video-2b-v0.9.1_fp8_e4m3fn.safetensors`.
2. Start ComfyUI with `--lowvram --force-fp16` to stay within 8 GB.
3. The ComfyUI workflow in `dispatchRender()` uses `LTXVLoader` and `LTXVSampler`. If your
   ComfyUI version does not have these nodes, install the `ComfyUI-VideoHelperSuite` and
   `ComfyUI-LTXVideo` custom nodes.

---

## Known bugs fixed in this release

| ID | File | Description |
| --- | --- | --- |
| `VIDEO-ROUTE-01` | `routes/video.ts` | File contained the `VideoPageLoading` React component instead of Fastify route definitions. All `/api/video/*` endpoints returned `404`. Replaced with correct Fastify plugin. |
| `VIDEO-SERVER-01` | `server.ts` | `videoRoutes` was never imported or registered. All `/api/video/*` routes were unreachable. Import and `server.register(videoRoutes, ...)` call added. |
| `VIDEO-FORM-01` | `VideoJobForm.tsx` | `s.governorSnapshot` referenced a non-existent key; the correct field is `s.governorState`. The pressure warning was never shown. Fixed selector. |
| `VIDEO-FIX-01` | `types/events.ts` | API video lifecycle events are now explicitly represented in the local `SwarmXEvent` union (`video:created` / `video:queued` / `video:stage_started` / `video:progress` / `video:completed` / `video:failed` / `video:cancelled` / `video:snapshot`). |
| `VIDEO-FIX-03` | `stores/events.ts` | `video:progress` events were not routed to the video store from the events reducer. Fixed in the current bundle (already present). |

---

## VIDEO-ALPHA r1 additions

### New API endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/video/jobs/:id/sse` | GET | Job-specific SSE stream — filtered video:* events for one job |
| `/api/video/jobs/:id` | DELETE | Cancel alias (same as POST cancel, for REST semantics) |
| `/api/video/jobs/:id/resume` | POST | Resume a terminal job from a stage marker when partial artifacts exist |
| `/api/video/jobs/reprioritize` | POST | Reorder queued jobs by explicit ordered job IDs |
| `/api/video/templates` | GET | List available ComfyUI workflow templates with RAM requirements (distinct from the 10 creative narrative templates) |
| `/api/video/caption/score` | POST | Score a caption draft and return both captionDraft + engagement heuristic signal |

### New dashboard components

| Component | Path | Purpose |
| --- | --- | --- |
| `ViralityMeter` | `components/video/ViralityMeter.tsx` | 5-bar engagement heuristic display with reasoning tooltips |
| `CaptionEditor` | `components/video/CaptionEditor.tsx` | Editable caption draft with live char count, hashtag pills, re-score, copy |
| `PlatformPublishPanel` | `components/video/PlatformPublishPanel.tsx` | Publishing panel with scheduling, approval notices, publish history |

### Publisher modularization

The publisher layer is now split into:

```text
apps/swarmx-api/src/services/publishers/
├── index.ts          — getVideoPublisher() factory (existing import surface preserved)
├── base-publisher.ts — abstract base with retry, logging, schedule sidecar helpers
├── generic.ts        — local filesystem export (always available, no approval needed)
├── tiktok.ts         — TikTok Content API (requires SWARMX_TIKTOK_API_APPROVED=1)
└── instagram.ts      — Instagram Graph API (requires SWARMX_INSTAGRAM_ACCESS_TOKEN)
```

TikTok and Instagram publishers fall back to generic export when required credentials are missing,
when TikTok approval is not enabled, or when Instagram lacks a publicly reachable output URL.
TikTok fallback logs a clear message pointing to `docs/TIKTOK_SETUP.md`.

### New environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `SWARMX_TIKTOK_ACCESS_TOKEN` | (empty) | TikTok OAuth access token |
| `SWARMX_TIKTOK_CLIENT_KEY` | (empty) | TikTok app client key |
| `SWARMX_TIKTOK_CLIENT_SECRET` | (empty) | TikTok app client secret |
| `SWARMX_TIKTOK_API_APPROVED=1` | `0` | Explicit opt-in for real TikTok uploads |
| `SWARMX_INSTAGRAM_ACCESS_TOKEN` | (empty) | Instagram page access token |
| `SWARMX_INSTAGRAM_USER_ID` | (empty) | Instagram user ID |
| `SWARMX_VIDEO_USE_BULLMQ` | `0` | Enable Redis-backed video queue (optional) |
