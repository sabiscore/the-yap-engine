# The Yap Engine — Configuration Reference

> **Powered by SwarmXQ** · APEX-17 r8 · v6 production certification pass (`8f25287`)

## Runtime

- `runtime.autonomous` — enables autonomous execution when allowed
- `runtime.review_required` — forces human review before risky actions
- `runtime.auto_apply` — allows low-risk evolution patches to be applied automatically
- `runtime.max_iterations` — upper bound on task refinement passes
- `runtime.checkpoint_every` — checkpoint cadence during execution

## Routing

- `routing.provider` — LLM backend selector
- `routing.model_fast` — lightweight routing / critique model
- `routing.model_code` — implementation-heavy model
- `routing.workflow_preference` — preferred workflow override
- `routing.framework_preference` — optional orchestration backends

## Redis & Queue Infrastructure

| Variable | Default | Notes |
| --- | --- | --- |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection URL for BullMQ job queues and state persistence when `SWARMX_VIDEO_USE_BULLMQ=1`. |
| `SWARMX_VIDEO_USE_BULLMQ` | `1` | Enable BullMQ Redis-backed job queue. Falls back to in-memory FIFO queue when Redis is unavailable. |

## Ollama And Host Runtime Profiles

Set these before starting Ollama or the SwarmX stack. The startup script auto-detects `constrained_cpu_8gb` vs `standard_cpu_16gb` by total RAM, but you can pin the behavior explicitly. Legacy `8gb`, `16gb`, `constrained_cpu`, and `standard_cpu` values are accepted only as compatibility aliases.

| Variable | Default | Notes |
| --- | --- | --- |
| `SWARMX_HOST_PROFILE` | `auto` | Auto-detects `constrained_cpu_8gb` or `standard_cpu_16gb`; pin one explicitly when you need stable behavior across restarts. |
| `OLLAMA_MAX_LOADED_MODELS` | profile-managed | `1` on `constrained_cpu_8gb`; `2` on `standard_cpu_16gb` (Pilot resident while a 7B runs). Low free RAM forces constrained safeguards even on a 16 GB host. |
| `OLLAMA_NUM_PARALLEL` | `1` | One inference slot prevents duplicate heavyweight loads on CPU. Protected constant. |
| `OLLAMA_KEEP_ALIVE` | `0` | Global keep-alive stays off on CPU-only hosts; SwarmX still sends request-level `keep_alive` where safe. |
| `OLLAMA_FLASH_ATTENTION` | `0` | Conservative CPU default because Q8 Phi-4 flash-attention has shown host-specific instability. GPU operators may override after validation. |
| `OLLAMA_KV_CACHE_TYPE` | `f16` | Conservative CPU default paired with flash-attention off. |
| `SWARMX_MODEL_STARTUP_PREWARM` | profile-managed | Defaults `0` on `constrained_cpu_8gb`; standard prewarm is opt-in/profile-derived after measurement. |
| `SWARMX_MODEL_PREDICTIVE_PREWARM` | profile-managed | Defaults `0` on `constrained_cpu_8gb`; standard prewarm is opt-in/profile-derived after measurement. |
| `SWARMX_OLLAMA_URL` | `http://127.0.0.1:11434` | Canonical Ollama API URL for SwarmX. |
| `SWARMX_OLLAMA_PROBE_TIMEOUT_MS` | `5000` | General `/api/version` probe budget for startup and discovery paths. |
| `SWARMX_SYSTEM_HEALTH_PROBE_TIMEOUT_MS` | `1500` | Liveness budget for `/api/system/health`; bounded to 250–10000 ms. When liveness fails, the route returns degraded health without model discovery. |
| `SWARMX_SYSTEM_HEALTH_MODEL_PROBE_TIMEOUT_MS` | `2500` | Readiness budget for model listing after liveness succeeds; bounded to 250–10000 ms. |
| `SWARMX_API_INTERNAL` | `http://localhost:7380` | Internal Python sidecar base URL used for governor pressure probes. |
| `SWARMX_PYTHON` | `python3` | Python binary used for sidecar operations, metrics poller, and TTS server. |

The `standard_cpu_16gb` profile permits `OLLAMA_MAX_LOADED_MODELS=2` only for
dual residency; it does not permit concurrent inference. Keep
`OLLAMA_NUM_PARALLEL=1`, and route application-level Ollama HTTP calls through
the shared backend classifier so network failures retain the stable
`OLLAMA_UNAVAILABLE` code.

ZRAM is compressed swap capacity, not free physical RAM. Runtime pressure
decisions use physical `MemAvailable` and report ZRAM separately.

## Video

| Variable | Default | Notes |
| --- | --- | --- |
| `SWARMX_VIDEO_ARTIFACT_DIR` | `.swarmx/video/artifacts` | Job metadata, queue recovery data, and performance records. |
| `SWARMX_VIDEO_EXPORT_DIR` | `.swarmx/video/exports` | Final rendered files served by the API. Legacy `VIDEO_OUTPUT_DIR` is still accepted by the env schema. |
| `SWARMX_VIDEO_PUBLIC_URL_BASE` | `/api/video/files` | Public URL prefix embedded in final output metadata. Legacy `VIDEO_PUBLIC_URL_BASE` is still accepted by the env schema. |
| `SWARMX_VIDEO_TEMP_DIR` | `.swarmx/video/tmp` | Per-render FFmpeg workspaces, removed after each render. |
| `SWARMX_VIDEO_FFMPEG_TIMEOUT_MS` | `240000` | Local render command timeout, bounded to 30–900 seconds. |
| `SWARMX_VIDEO_FFPROBE_TIMEOUT_MS` | `15000` | Artifact validation timeout, bounded to 5–60 seconds. |
| `SWARMX_VIDEO_HIGH_PRESSURE_DELAY_MS` | `3000` | Delay before re-checking the Python governor after a high-pressure signal; clamped to 1000–30000 ms. Legacy `HIGH_PRESSURE_DELAY_MS` is still accepted by the env schema. |
| `SWARMX_COMFYUI_URL` | `http://127.0.0.1:8188` | ComfyUI base URL for availability checks and workflow handoff. Legacy `COMFY_HOST` is still accepted by the env schema. |
| `SWARMX_VIDEO_ALLOW_SILENT_AUDIO` | unset | Set `1` only for deliberate silent test renders when every configured VoiceProvider is unavailable; production runs fail instead of silently masking narration loss. |
| `SWARMX_TTS_PROVIDER` | `auto` | Server-side voice provider selection: `auto`, `kokoro`, `piper`, `espeak`, or `silent_fixture`. `silent_fixture` is for explicit tests only. |
| `SWARMX_TTS_URL` | `http://127.0.0.1:8888` | Kokoro TTS microservice URL. The provider is installed in the app; the host still must have the optional Python `tts` extra installed and the service running. |
| `SWARMX_TTS_PIPER_MODEL_PATH` | unset | Piper voice model path. Piper reports degraded/unavailable when the binary or model path is missing. |
| `SWARMX_AUDIO_TARGET_LUFS` | `-16` | Local mastering loudness target for rendered short-form narration packages. |
| `SWARMX_AUDIO_TRUE_PEAK_MAX_DBFS` | `-1.5` | Local mastering true-peak cap. |
| `SWARMX_VIDEO_ALLOW_UNSTRUCTURED_INTENT` | unset | Debug escape hatch: set `1` only to pass raw sanitized text through when intent classification is not valid structured output. By default, malformed intent JSON falls back to a deterministic structured intent derived from the validated request. |
| `SWARMX_VIDEO_INTENT_MODEL` | `instruct-phi4-pro-q8-prod` | Intent classification model override. The default Q8 Pilot is attempted first; retryable Ollama failures fall back to canonical Pilot-lite inside the same stage timeout. Once intent uses Pilot-lite, later text stages keep the Pilot-lite recovery profile for that job. |
| `SWARMX_VIDEO_LOW_RAM_MODE` | unset | Set `1` to force all video text stages through the 2.5 GB Pilot-lite profile; requires at least 3300 MB available RAM. |
| `SWARMX_VIDEO_API_TOKEN` | unset | Server-only bearer/API-key token for video and series write routes. Production writes fail closed when unset. Never expose through `NEXT_PUBLIC_*`. |
| `SWARMX_VIDEO_JOB_LIMIT_PER_HOUR` | `10` | Max video job submissions per connection per hour (sliding window). Returns 429 when exceeded. |
| `SWARMX_VIDEO_QUEUE_MAX_SIZE` | `20` | Max queued or running video jobs accepted by the local registry. |
| `SWARMX_VIDEO_QUEUE_NAME` | `swarmx-video` | BullMQ queue name when Redis-backed video jobs are enabled. |
| `SWARMX_VIDEO_MAX_RETRIES` | `3` | Retry count for retryable video job failures. Legacy `VIDEO_MAX_RETRIES` is still accepted by the env schema. |
| `SWARMX_VIDEO_RETRY_BASE_DELAY_MS` | `5000` | Base delay before a retryable job re-queues. Actual delay grows exponentially per attempt (`base * 2^retryCount`) plus jitter, capped by `SWARMX_VIDEO_RETRY_MAX_DELAY_MS`. |
| `SWARMX_VIDEO_RETRY_MAX_DELAY_MS` | `30000` | Ceiling on the computed exponential-backoff retry delay. |
| `SWARMX_VIDEO_RETRY_JITTER_MS` | `1000` | Max random jitter (ms) added to each retry delay to avoid thundering-herd re-queues. |
| `SWARMX_VIDEO_JOB_TTL_MS` | `14400000` | Terminal job retention window before in-memory cleanup. Legacy `VIDEO_JOB_TTL_MS` is still accepted by the env schema. |
| `SWARMX_VIDEO_MAX_CONCURRENT_JOBS` | `1` | Configuration visibility for concurrency requests. The SINGLE-VIDEO LOCK still enforces one active video job on CPU-only hosts. Legacy `VIDEO_MAX_CONCURRENT_JOBS` is still accepted by the env schema. |
| `SWARMX_VIDEO_RENDER_BACKEND` | `auto` | Render backend selection: `auto`, `ffmpeg`, `comfyui`, or `modal`. Defaults to local FFmpeg on CPU hosts. |
| `SWARMX_MODAL_RENDER_URL` | unset | Modal cloud GPU render endpoint URL. When set, renders can run on cloud GPUs. |
| `SWARMX_MODAL_SECRET_NAME` | `swarmxq-video-renderer` | Secret name used in Modal deployments. |
| `SWARMX_MODAL_MAX_CONTAINERS` | `4` | Max concurrent Modal container instances. |
| `SWARMX_MODAL_FUNCTION_TIMEOUT_S` | `600` | Function execution timeout (seconds) on Modal. |
| `SWARMX_MODAL_STARTUP_TIMEOUT_S` | `180` | Container cold-start timeout (seconds) on Modal. |
| `SWARMX_VIDEO_REQUIRE_WORD_ALIGNMENT` | `0` | Require word-level whisper alignment before assembling subtitles. When 0, degrades gracefully to sentence timing if whisper is missing. |
| `SWARMX_WHISPER_DEVICE` | `cpu` | Faster-whisper device: `cpu` or `cuda`. |
| `SWARMX_WHISPER_COMPUTE_TYPE` | `int8` | Faster-whisper quantization type. |
| `SWARMX_WHISPER_MODEL_SIZE` | `small` | Faster-whisper model size (`tiny`, `base`, `small`, `medium`). |
| `SWARMX_AUDIO_MASTER_SAMPLE_RATE_HZ` | `48000` | Sample rate for final audio track mastering (Hz). |
| `SWARMX_AUDIO_MASTER_CHANNELS` | `2` | Audio channel count (2 = stereo). |
| `SWARMX_AUDIO_AMBIENT_BED_ENABLED` | `0` | Enable ambient audio bed mixing behind narration. |
| `SWARMX_VOICE_BENCHMARK_FILE` | `/tmp/swarmxq-voice-benchmark.json` | Voice benchmark file path. |
| `SWARMX_VOICE_BENCHMARK_MAX_AGE_HOURS` | `168` | Cache validity duration (hours) for voice benchmark rankings. |
| `SWARMX_VIDEO_EXPORT_TTL_DAYS` | `7` | Days after which rendered exports and artifacts are eligible for cleanup. Minimum 1. |
| `SWARMX_VIDEO_CLEANUP_INTERVAL_MS` | `21600000` | How often the cleanup service scans for stale exports (ms). Minimum 60000. First run fires 30 s after startup. |

Voice fallback visibility is derived from the voice benchmark report and
`/api/system/health`; there is no separate environment flag. If Kokoro is
unavailable and another provider is selected, the dashboard shows the warning
without blocking submissions. Static dashboard preview clips must be generated
from Kokoro into `apps/swarmx-dashboard/public/audio/voice-previews/`; the
V6.2.61 dashboard ships five verified Kokoro WAV previews. Do not ship
Piper/eSpeak substitutes under Kokoro preview names.

Secrets and parametric override reads are centralized in
`apps/swarmx-api/src/lib/env.ts`. `SWARMX_VIDEO_API_TOKEN`,
`SWARMX_TIKTOK_ACCESS_TOKEN`, and `SWARMX_INSTAGRAM_ACCESS_TOKEN` are read
through non-cached secret helpers so they are never copied into logged config
snapshots; stage-specific timeout/model override names are read through the same
module rather than directly from services or routes.

**Stage timeouts** — defaults are CPU-safe and account for cold model-load latency plus inference slack, so most operators do not need to override anything. Bounds still allow tightening for latency-sensitive GPU hosts or raising for very slow CPUs.

| Variable | Default | Ceiling (max) | Floor (min) |
| --- | --- | --- | --- |
| `VIDEO_INTENT_CLASSIFY_TIMEOUT_MS` | `240000` | `600000` | `1000` |
| `VIDEO_PLANNING_TIMEOUT_MS` | `300000` | `900000` | `5000` |
| `VIDEO_SCRIPTING_TIMEOUT_MS` | `600000` | `1800000` | `10000` |
| `VIDEO_STORYBOARD_TIMEOUT_MS` | `600000` | `1200000` | `10000` |
| `VIDEO_RENDER_TIMEOUT_MS` | `1800000` | `7200000` | `30000` |
| `VIDEO_FINALIZING_TIMEOUT_MS` | `120000` | `600000` | `5000` |

**LOW_RAM_MODE auto-detection (V6.2.15)** — `SWARMX_VIDEO_LOW_RAM_MODE` is auto-enabled at API startup when `MemAvailable < 6170 MB` and the operator has not set an explicit value. Explicit `SWARMX_VIDEO_LOW_RAM_MODE=1` or `=0` always wins. When auto-enabled, the API also fires a fire-and-forget prewarm of `instruct-phi4-lite-q4km-prod` so the first user submission finds a warm model. A one-line startup log summarises the resolved mode: `{ lowRamMode, availableMb, videoModel }`.

For persistent per-host overrides, use `apps/swarmx-api/.env.local` (gitignored).

### 10-Template Creative Taxonomy (`templateFamily`)

The Yap Engine provides 10 structured creative templates (`VIDEO_TEMPLATE_FAMILY_VALUES`):
- `myth-vs-fact`
- `list/countdown` (accepts legacy `listicle-countdown`)
- `mystery/reveal`
- `product-demo`
- `quote-to-insight`
- `chart/data`
- `motivational`
- `series-recap`
- `pov-immersion`
- `reddit-story`

Required local binaries for production local renders:

```bash
command -v ffmpeg
command -v ffprobe
command -v espeak-ng
```

A job is not marked completed until the final artifact exists, is non-empty,
and passes FFprobe metadata validation.

## Evolution

- `evolution.proposal_only_by_default` — proposals are stored before application
- `evolution.auto_apply_low_risk` — only low-risk items may be auto-applied
- `evolution.budget.proposals_per_run` — number of proposals returned per evolution pass
- `evolution.budget.refinement_passes` — bounded evaluator passes

## Safety

- `safety.approval_required_for` — risk levels that must stay gated
- `safety.strict_review_targets` — target classes that require caution
- `safety.allow_destructive_actions` — should remain false in normal operation
