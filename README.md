# The Yap Engine — Viral Short-Form Video Generation Platform

> **Powered by SwarmXQ** — an autonomous multi-agent AI runtime<br/>
> **Runtime:** APEX-17 r8 · CPU-only (HP EliteBook 850 G3 · 16 GB RAM · WSL2)<br/>
> **Version:** `2026.6.0` · v6 production certification pass (`8f25287`)

The Yap Engine is a viral short-form video generation pipeline — end-to-end, AI-driven, designed for TikTok and YouTube Shorts creators. Feed it a topic; receive a scripted, voiced, captioned MP4 ready to publish. The underlying runtime (SwarmXQ) orchestrates a pressure-aware fleet of local LLMs through Ollama, with memory safety, circuit breakers, and graceful degradation built in for CPU-only hardware.

---

## Operator Taxonomy

SwarmXQ organizes its model fleet through a **dual-layer naming system** — memorable Operator names for humans, canonical runtime tags for machines.

| Operator | Purpose | Canonical Tag | RAM | 7B? |
|----------|---------|---------------|-----|-----|
| **Relay** | Ultra-light routing / intent classification | `route-phi4-lite-q4km-prod` | ~2.5 GB | No |
| **Pilot** | Fast generalist / intake / session routing | `instruct-phi4-pro-q8-prod` | ~4.3 GB | No |
| **Architect** | Planning / orchestration / strategy | `plan-{phi4,qwen25,deepseekr1}-pro-*-prod` | 4.3–5.4 GB | Mixed |
| **Forge** | Code generation / execution / tool use | `code-qwen25-pro-q5km-prod` | ~5.4 GB | Yes |
| **Oracle** | Deep reasoning / diagnosis / architecture | `reason-deepseekr1-pro-q5km-prod` | ~5.4 GB | Yes |
| **Auditor** | Adversarial review / critique / safety | `critique-deepseekr1-pro-q5km-prod` | ~5.4 GB | Yes |
| **Lab** | Experimental / evolution / non-production | `synth-*-exp-*-dev` | 4.4–5.4 GB | Mixed |

**Usage rules:** Code, configs, and Ollama commands use canonical tags. Docs, dashboards, logs, and UI use Operator names. Both layers are synchronized through `MODEL_OPERATOR_MAP` — the single source of truth (defined in `packages/swarmx-types/src/operator-map.ts` and mirrored in `src/swarmx/operator_map.py`).

**Startup behavior by host profile:** the startup script now auto-detects total system RAM and selects either the constrained `8gb` profile or the warmer `16gb` profile. On the `8gb` profile no model is loaded by default, Relay loads on the first eligible request unless `SWARMX_MODEL_STARTUP_PREWARM=1` is set deliberately, and predictive specialist warmup stays off. On the `16gb` profile the startup script allows two resident models, enables a short global reuse window, and opt-in warmups default on. Override auto-detection with `SWARMX_HOST_PROFILE=8gb` or `SWARMX_HOST_PROFILE=16gb` when you need to pin behavior explicitly.

---

## Quick Start

### Prerequisites

| Requirement | Verified version | Notes |
|---|---|---|
| Node.js | **v24.17.0** | v22 is the package minimum; v24 is the tested runtime |
| pnpm | **11.9.0** | `npm install -g pnpm@11.9.0` |
| Python | **3.14.6** | pyproject.toml minimum is 3.11; 3.14 is tested |
| Ollama | latest | Running locally with GGUF models in `~/llm-local/gguf/` |
| Redis | 7.x | Required only when `SWARMX_VIDEO_USE_BULLMQ=1` |
| FFmpeg ≥ 6.0 | system install | **Not in Windows PATH by default** — must be reachable from WSL2 for local video renders |
| espeak-ng | system install | Fallback TTS for local renders |
| Kokoro TTS | optional | `pip install '.[tts]'` — recommended for production voice quality |
| faster-whisper | optional | `pip install '.[video]'` — required for word-level caption alignment |
| Modal credentials | optional | Required only for cloud GPU renders (`SWARMX_MODAL_RENDER_URL`) |

> **Known environment blockers (this host, no code changes needed):**
> - FFmpeg is not in Windows PATH — run FFmpeg from WSL2 or add it to WSL2's PATH.
> - `faster-whisper` is not installed — word-level caption alignment is disabled; runs succeed with caption alignment bypassed.
> - Modal credentials are not provisioned — `SWARMX_VIDEO_RENDER_BACKEND=auto` falls back to local FFmpeg.

### Clean Clone Setup

```bash
python -m venv .venv
source .venv/bin/activate          # Windows WSL2 / Linux
python -m pip install --editable '.[dev]'
pnpm install --frozen-lockfile
```

### Launch

```bash
bash scripts/startup-enhanced.sh --dashboard
```

Dashboard: **http://localhost:3000** · API: **http://localhost:3001/health**


### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SWARMX_OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama endpoint |
| `SWARMX_API_URL` | `http://127.0.0.1:3001` | API endpoint for CLI and server-side integrations |
| `NEXT_PUBLIC_SWARMX_API_URL` | `http://127.0.0.1:3001` | Preferred dashboard API endpoint |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:3001` | Legacy dashboard API fallback |
| `SWARMX_VIDEO_API_TOKEN` | unset | Write-route token for protected `/api/video/*` mutations |
| `SWARM_MODEL_FAST` | `instruct-phi4-pro-q8-prod` | Pilot model override |
| `SWARM_MODEL_CODE` | `code-qwen25-pro-q5km-prod` | Forge model override |
| `SWARM_MODEL_REASON` | `reason-deepseekr1-pro-q5km-prod` | Oracle model override |
| `SWARM_MODEL_ULTRA_ROUTER` | `route-phi4-lite-q4km-prod` | Relay model override |
| `SWARMX_HOST_PROFILE` | `auto` | Auto-detects `constrained_cpu_8gb` or `standard_cpu_16gb`; legacy `8gb`/`16gb` names are accepted as aliases at startup/API boundaries. |
| `OLLAMA_MAX_LOADED_MODELS` | profile-managed | `1` on `constrained_cpu_8gb`; `2` only under `standard_cpu_16gb` after host measurement and pressure checks. |
| `OLLAMA_NUM_PARALLEL` | `1` | One inference slot at a time |
| `OLLAMA_KEEP_ALIVE` | profile-managed | `0` on `constrained_cpu_8gb`; short reuse windows are profile-derived and must not be a universal default. |
| `SWARMX_MODEL_STARTUP_PREWARM` | profile-managed | Defaults `0` on `constrained_cpu_8gb`; heavyweight startup preload stays off on constrained hosts. |
| `SWARMX_MODEL_PREDICTIVE_PREWARM` | profile-managed | Defaults `0` on `constrained_cpu_8gb`; standard hosts may opt in after measurement. |
| `SWARMX_VIDEO_ALLOW_SILENT_AUDIO` | unset | Set to `1` only to permit silent local renders when `espeak-ng` is unavailable |

---

## Architecture

The `ModelOrchestrator` singleton enforces memory safety across constrained and standard CPU-only hosts through five mechanisms working in concert. The **single-7B lock** prevents heavyweight co-loads that would overrun physical RAM. **Profile-aware residency policy** keeps the `8gb` profile at strict single-model mode while allowing a short two-model reuse window on the `16gb` profile. **Request-level keep-alive** controls unload behavior per inference. **Warmup controls** avoid silently pinning multi-gigabyte models on constrained hosts. A **serialization mutex** prevents concurrent heavyweight races that cause OOM. Under critical pressure (<800 MB available), **degraded mode** halves context windows and token budgets.

### Pressure Tiers

| Available RAM | Tier | Behavior |
|---------------|------|----------|
| ≥ 2500 MB | Normal | Full context, standard keep-alive |
| 1500–2499 MB | Low-RAM | 75% context, shortened keep-alive |
| 800–1499 MB | High | Backoff delay before model loads |
| < 800 MB | Degraded | 50% context, minimal tokens, immediate eviction |

### Core Components

- **Relay** (`route-phi4-lite-q4km-prod`) — lightweight router, loaded on demand unless explicitly prewarmed
- **ModelOrchestrator** (`apps/swarmx-api/src/services/model-orchestrator.ts`) — SINGLE-7B LOCK, RAM polling, adaptive timeouts
- **Reasoning Sanitizer** (`apps/swarmx-api/src/services/reasoning-sanitizer.ts`) — strips `<think>` blocks from DeepSeek output
- **Swarm Pressure Monitor** (`apps/swarmx-api/src/services/swarm-pressure-monitor.ts`) — procfs-based RAM/ZRAM sampling
- **Evolution Layer** (`src/swarmx/evolution_layer/`) — observe → critique → mutate → validate → deploy cycle, dispatched to Lab Operators

---

## Video Generation Pipeline

SwarmXQ includes a pressure-aware, faceless video generation subsystem for TikTok and YouTube Shorts.

The dashboard consumes video API payloads through a local adapter boundary in `apps/swarmx-dashboard/src/lib/video-dashboard.ts`, which normalizes route payloads into dashboard-safe job shapes without coupling the UI to API-internal bridge types.

### Pipeline Stages (Canonical Order)

```
intent_classification → planning → scripting → storyboard_generation → render_assembly → finalizing
```
Post-pipeline (non-blocking): `stageViralityAndCaption()`

1. **Intent Classification** (Pilot by default: `instruct-phi4-pro-q8-prod`) — parse user request into structured intent with deterministic fallback on malformed JSON
2. **Planning** (Architect by default: `plan-qwen25-pro-q5km-prod`) — generate 5-beat production plan (HOOK, CONTEXT, INSIGHT, PROOF, CTA) tailored to the template family
3. **Scripting** (Architect by default) — produce narration text conforming to `[HOOK]`, `[BODY]`, `[RESOLUTION]`, `[CTA]` sections and strict tone rules
4. **Storyboard Generation** (Architect by default) — derive visual scene frames, visual prompts, and camera movements
5. **Render Assembly** (local FFmpeg by default, ComfyUI optional, Modal GPU cloud fallback) — assemble audio, b-roll/visuals, and kinetic captions into a 1080x1920 MP4
6. **Finalizing** (API assets layer) — probe artifact with FFprobe, run template-aware QC, and apply metadata

### 10-Template Creative Taxonomy

The Yap Engine provides 10 structured creative templates (`VIDEO_TEMPLATE_FAMILY_VALUES` in `@swarmx/types`):

| Template Family | Structure & Creative Direction |
|---|---|
| `myth-vs-fact` | Direct debunking: Hook states the myth, Body reveals the surprising fact, Resolution explains why it persisted |
| `list/countdown` | Rapid-fire list: Hook establishes stakes, Body cycles through 3–5 items, Resolution synthesizes takeaways (accepts legacy `listicle-countdown`) |
| `mystery/reveal` | Narrative puzzle: Hook presents an anomaly, Body drops clues/breadcrumbs, Resolution delivers the reveal |
| `product-demo` | Problem/solution showcase: Hook highlights visceral pain point, Body demonstrates solution in action, Resolution shows outcome |
| `quote-to-insight` | Powerful quote reframe: Hook drops the quote, Body analyzes deeper meaning, Resolution applies it to life |
| `chart/data` | Data-driven insight: Hook presents a striking stat, Body visualizes trend/context, Resolution delivers implication |
| `motivational` | Micro-narrative: Hook identifies moment of defeat, Body shows pivot/grind, Resolution lands triumph |
| `series-recap` | Fast-paced catch-up: Hook recalls cliffhanger, Body blitzes key plot points, Resolution sets up next episode |
| `pov-immersion` | First-person immersion: Hook drops viewer into moment without setup, Body unfolds sensory detail, Resolution lands emotional beat |
| `reddit-story` | Found-story readaloud: Hook quotes provocative thread title, Body escalates through plot turns, Resolution delivers punchline/moral |

Integrations: FFmpeg/FFprobe (>= 6.0), server-side VoiceProvider adapters (Kokoro TTS, Piper, `espeak-ng` fallback), ComfyUI, Modal GPU cloud backend, pressure-aware stage gating, and graceful degradation paths. Dashboard: `/video` route with job list, creative brief controls, package/certification state, and detail timeline. For the exact route and payload contract, see [docs/VIDEO-GENERATION.md](docs/VIDEO-GENERATION.md).

Operational note: the compiled Fastify entrypoint resolves to `apps/swarmx-api/dist/apps/swarmx-api/src/server.js` because the API TypeScript build uses the monorepo root as `rootDir`.

---

## Migration & Compatibility

Canonical tags are preferred in all runtime config, scripts, and operator workflows.
Legacy `-scar` tags still resolve automatically through `MODEL_ALIASES` during the migration window:

```
phi4-fast-scar         → instruct-phi4-pro-q8-prod   (Pilot)
deepseek-reasoner-scar → reason-deepseekr1-pro-q5km-prod  (Oracle)
qwen-worker-scar       → code-qwen25-pro-q5km-prod   (Forge)
```

Pre-scar tags (V5 and earlier) also resolve: `phi4-mini`, `deepseek-r1`, `qwen2.5-coder`, etc.

`scripts/startup-enhanced.sh` now auto-detects the host profile from total RAM and applies the matching Ollama defaults automatically. The constrained `constrained_cpu_8gb` profile clamps `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, and `OLLAMA_KEEP_ALIVE=0`; `standard_cpu_16gb` keeps `OLLAMA_NUM_PARALLEL=1` and may allow two resident models only after measurement and pressure checks. Set `SWARMX_HOST_PROFILE=constrained_cpu_8gb` or `SWARMX_HOST_PROFILE=standard_cpu_16gb` in `.env.local` to pin the profile explicitly.

### Legacy r7 migration

The current runtime uses canonical tags. Only repositories still on the legacy r7 naming scheme need the migration guide in **[docs/SETUP_AND_IMPLEMENTATION.md](docs/SETUP_AND_IMPLEMENTATION.md)**:

```bash
bash scripts/migrate-to-r7.sh --apply
```

Validate after migration:

```bash
source .venv/bin/activate
python -m pip install --editable '.[dev]'
pnpm --filter @swarmx/types typecheck
pnpm --filter @swarmx/api build
pnpm --filter @swarmx/api test
pnpm --filter @swarmx/api run test:regression
pnpm --filter @swarmx/api run test:video:smoke
pnpm --filter @swarmx/dashboard typecheck
python -m pytest
python -m ruff check .
python -m mypy src
bash scripts/rebuild-all-modelfiles.sh --validate
python -m pytest tests/test_naming_validation.py -v
bash scripts/swarm-healthcheck-apex17.sh
```

Operational note: on 8 GB hosts, `scripts/swarm-healthcheck-apex17.sh` may report `HEALTH: DEGRADED`
when free RAM falls below 800 MB or Ollama probe latency pushes Relay/model checks past their timeout.
That result indicates runtime pressure, not necessarily a build or type-safety regression.

### Validate Before Release

Run after activating `.venv`. The Makefile automatically uses `.venv/bin/python` when present.

```bash
# TypeScript type-checking
pnpm -F @swarmx/types typecheck
pnpm -F @swarmx/api typecheck
pnpm -F @swarmx/dashboard typecheck
# (or from repository root: pnpm typecheck)

# Tests
pnpm -F @swarmx/dashboard test              # 69 passing (9 test files)
pnpm -F @swarmx/api test                    # 377 passing (26 test files)
# (or from repository root: pnpm test)

# API regression scripts (require running API / local environment)
pnpm -F @swarmx/api run test:video          # video pipeline regression assertions
pnpm -F @swarmx/api run test:regression     # full regression suite (7 scripts)
pnpm -F @swarmx/api run test:models         # model registry / Modelfile check
pnpm -F @swarmx/api run test:factory        # creative factory release check

# Python
make test
make typecheck-py

# Build
pnpm -F @swarmx/dashboard build
pnpm -F @swarmx/api build
# (or from repository root: pnpm build)

# Invariant checks
grep -rn 'console\.' apps/swarmx-api/src/services apps/swarmx-api/src/routes  # → 0 hits
grep -rn '\-scar' apps/ packages/ src/                                          # → 0 hits
```


---

## CLI Entry Points

| Command | Purpose |
|---------|---------|
| `swarm run` | Mission execution |
| `swarm evolve` | Proposal generation and gated application |
| `swarm evolve-layer` | Autonomous self-improvement cycle (Lab Operators) |
| `swarm status` | Runtime state and telemetry |
| `swarm dashboard` | Browser dashboard |
| `swarm doctor` | Health diagnostics |

---

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/QUICKSTART.md](docs/QUICKSTART.md) | **Get running in five minutes** |
| [docs/STARTUP_GUIDE.md](docs/STARTUP_GUIDE.md) | Full startup, env-var reference, cold-start tuning |
| [docs/INSTALL.md](docs/INSTALL.md) | Detailed prerequisites, models, Redis, environment |
| [docs/CONFIG_REFERENCE.md](docs/CONFIG_REFERENCE.md) | All environment variables and runtime config options |
| [docs/VIDEO-GENERATION.md](docs/VIDEO-GENERATION.md) | Video pipeline route/payload contract, stage details |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common problems, debug flags, `swarm doctor` flow |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Day-to-day operator commands |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Full version history |
| `ARCHITECTURE.md` | System architecture deep dive |
| `SAFETY.md` | Safety guardrails and execution policy |
| [docs/SETUP_AND_IMPLEMENTATION.md](docs/SETUP_AND_IMPLEMENTATION.md) | Historical r7 migration guide (r8 repos: skip this) |
| `manifests/swarmx_model_manifest.yaml` | Bundle manifest with replacement matrix |


---

## Troubleshooting

**Dashboard shows 404** — Ensure API is running: `curl http://127.0.0.1:3001/health`

**Composer hangs on first call** — Cold model loads take 60–120s on constrained hosts. Startup and predictive warmup are off by default on 8 GB machines. Use the "SwarmX: Warm Relay Opt-In" VS Code task only when you intentionally want a short prewarm window.

**OOM on 7B load** — Run the "Evict 7B Models" VS Code task or `ollama ps` followed by `ollama stop <model>`, then retry. The API pre-evicts incompatible resident models before 7B loads, but a manually pinned Ollama model can still consume headroom.

**Video render fails before completion** — Verify local media binaries. On Windows/WSL2, FFmpeg must be on the WSL2 PATH (not Windows PATH):

```bash
which ffmpeg                                # must resolve in WSL2
which ffprobe
which espeak-ng
pnpm -F @swarmx/api run test:video:smoke   # smoke render test
```

**Naming validation fails** — Run `bash scripts/migrate-to-r7.sh --dry-run` to see what's out of sync, then `bash scripts/migrate-to-r7.sh --apply`.

**Port conflict** — `lsof -i :3000` / `lsof -i :3001` to find and kill stale processes.

---

## Philosophy

*The incision is precise.* The Yap Engine (powered by SwarmXQ) rejects ornamental complexity. Every layer — naming, orchestration, pressure governance, video pipeline — answers a specific failure mode observed on real constrained hardware. When something feels over-engineered, it's because the alternative crashed.
