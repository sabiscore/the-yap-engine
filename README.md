# The Yap Engine

**The Yap Engine** is a local-first short-form video production hub powered by the SwarmXQ runtime. It turns a creative brief into a structured, provenance-aware video package and can render a playable MP4 locally without TikTok, cloud GPU, or public-posting credentials.

> **Production posture:** local generation is independent of social publishing. TikTok is an optional downstream distribution adapter and remains fail-closed until its explicit OAuth, privacy, AI-disclosure, account-verification, and publication gates are satisfied.

## Current stack

| Layer | Implementation | Role |
|---|---|---|
| Dashboard | Next.js 16.2.4 + React 19.2.4 + Tailwind CSS v4 | Creator-facing Studio / Creative Hub UI |
| API | Node.js + Fastify 5 | Video job API, orchestration, auth and publishing adapters |
| Local AI | Ollama + canonical SwarmXQ model registry | Intent, planning, scripting and storyboard stages |
| Local media | FFmpeg + FFprobe | Deterministic composition, validation and MP4 export |
| Local TTS | Piper / espeak-ng; optional Kokoro FastAPI service | Narration |
| Remote render | Optional Modal GPU / AWS Phase-D | Explicitly optional; disabled by default |
| Queue | BullMQ + Redis/Upstash | Background job dispatch |
| Durable state | Neon PostgreSQL | Accounts, render evidence, analytics and attribution |
| Observability | OpenTelemetry + structured logging | Traceable API and worker execution |

The repository does not contain a separate `apps/scraper` / Crawlee ingestion application. The production Node background worker is the BullMQ video worker under `apps/swarmx-api/src/workers/`.

Fastify is the primary HTTP API. FastAPI is used by the optional local Kokoro TTS microservice and the optional Modal renderer.

## Repository map

```text
apps/
  swarmx-api/              Fastify API + BullMQ video worker
  swarmx-dashboard/        Next.js creator dashboard
packages/
  swarmx-types/            Shared contracts + operator/model map
src/
  swarmx/                  Python control-plane and optional media services
docs/                       Operations, video, TikTok, monetization and release gates
.claude/                    Agent and command governance
infra/aws-render-cdk/       Optional AWS Phase-D render infrastructure
benchmarks/coding-agent/    Deterministic coding-agent benchmark harness
```

## Local 8 GB Windows / WSL2 setup

The constrained profile is the supported safety baseline for an 8 GB Windows machine.

### 1. Requirements

- Windows 10/11 with WSL2
- Node.js 22+
- pnpm 12.6.0
- Python 3.11+
- Ollama
- FFmpeg and FFprobe
- Git
- local Redis when BullMQ is enabled
- espeak-ng for the lowest-friction local TTS fallback

Kokoro and faster-whisper are optional. They improve voice quality and caption alignment but are not prerequisites for a basic local FFmpeg MP4.

### 2. Install

```bash
git clone https://github.com/sabiscore/the-yap-engine.git
cd the-yap-engine
python -m venv .venv
source .venv/bin/activate
python -m pip install --editable '.[dev]'
corepack enable
corepack prepare pnpm@12.6.0 --activate
pnpm install --frozen-lockfile
```

### 3. Verify host tools

```bash
node --version
pnpm --version
python --version
ollama --version
which ffmpeg
which ffprobe
which espeak-ng
```

With Windows + WSL2, FFmpeg must be reachable from the WSL2 process. A Windows installation that is not exposed on the WSL2 PATH is not enough.

### 4. Configure constrained execution

Create `.env.local` at repository root:

```dotenv
NODE_ENV=development
SWARMX_API_HOST=127.0.0.1
SWARMX_API_PORT=3001
SWARMX_DASHBOARD_ORIGIN=http://localhost:3000
NEXT_PUBLIC_SWARMX_API_URL=http://localhost:3001
SWARMX_HOST_PROFILE=constrained_cpu_8gb
SWARMX_PHASE_ABC_EXECUTION=local
SWARMX_PHASE_D_EXECUTION=local
MAX_CONCURRENT_JOBS=1
SWARMX_VIDEO_MAX_CONCURRENT_JOBS=1
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_KEEP_ALIVE=0
SWARMX_VIDEO_LOW_RAM_MODE=1
SWARMX_VIDEO_USE_BULLMQ=1
REDIS_URL=redis://127.0.0.1:6379
SWARMX_AWS_RENDER_ENABLED=0
SWARMX_TIKTOK_API_APPROVED=0
SWARMX_TIKTOK_PUBLIC_POSTS_ENABLED=0
SWARMX_TIKTOK_PRIVACY_LEVEL=SELF_ONLY
DATABASE_URL=<NEON_POOLED_CONNECTION>
DATABASE_URL_UNPOOLED=<NEON_DIRECT_CONNECTION>
NEON_BRANCH=production
```

Never put TikTok secrets, refresh tokens or server write tokens in `NEXT_PUBLIC_*` variables.

### 5. Start

```bash
pnpm --filter @swarmx/api dev
```

In another terminal:

```bash
pnpm --filter @swarmx/dashboard dev
```

Use `http://localhost:3000` for the dashboard and `http://127.0.0.1:3001/health` for API health.

## Production-readiness posture

The repository is **fail-closed** by design. A green build does not imply that TikTok public posting, AWS rendering, physical 8 GB hardware, or mobile-device UX has been verified. Each boundary has its own evidence gate.

### Current verified deployment baseline

- Vercel production deployment: `dpl_FczEzdqMHVyyRzQCpMjRYkgCu9aw`
- Deployment SHA: `25e38a342f8fc94bd67fc2400a5f6d26893c3489`
- Deployment state: `READY`
- Historical PR #10 commit `f45042b` is **not** a release baseline: its Vercel deployment failed with `lint_or_type_error`.
- GitHub Actions exact-head evidence must be re-established after every subsequent commit; historical green runs are never substituted for the current SHA.

### Important stack clarification

The current repository uses **Next.js 16.2.4 / React 19.2.4**, not Next.js 15. This is the actual production baseline on `main`; do not downgrade the dashboard merely to match an older architecture description without a compatibility migration and a fresh certification run.

## Local video generation

TikTok is not a prerequisite for generation.

```text
Creative brief
  -> Intent classification
  -> Planning
  -> Scripting
  -> Storyboard
  -> Asset and provenance validation
  -> Audio/TTS + timing
  -> FFmpeg render
  -> FFprobe + QC + checksums
  -> MP4 + production package
```

The dashboard defaults new video jobs to the **Generic** output profile. Selecting TikTok is a downstream output choice; it does not authenticate or publish during generation.

Smoke test:

```bash
pnpm --filter @swarmx/api run test:video:smoke
```

Regression contracts:

```bash
pnpm --filter @swarmx/api run test:video
pnpm --filter @swarmx/api run test:video:quality
```

## 8 GB memory policy

Use [docs/8GB-PROFILING-RUNBOOK.md](docs/8GB-PROFILING-RUNBOOK.md) for operator evidence. The CI Windows compatibility gate is regression evidence, not proof of behavior on an 8 GB physical machine.

The constrained profile enforces a single inference and single video job:

```text
OLLAMA_NUM_PARALLEL              = 1
OLLAMA_MAX_LOADED_MODELS         = 1
SWARMX_VIDEO_MAX_CONCURRENT_JOBS = 1
worker concurrency               = 1
```

The runtime also monitors available RAM, selects a low-RAM model when admission requires it, evicts incompatible resident models, serializes heavyweight transitions, and reduces context/token budgets under pressure.

These controls are implemented in `hybrid-execution.ts`, `video-runtime-config.ts`, `video-queue.ts` and `model-orchestrator.ts`.

## Creative originality and provenance

```text
Creative DNA
   -> Concept generation / tournament
   -> Scene graph / storyboard
   -> Substantive visual composition
   -> Audio timing + caption alignment
   -> Rights / provenance package
   -> Technical + creative + continuity + compliance QC
   -> Render / export
```

The creative compiler creates a content-addressed cache key from Creative DNA identity, scenes, background recipes, audio timing, renderer version and asset hashes. Invalid scene intervals and overlaps are rejected.

The platform-integrity policy requires original narrative, substantive editorial structure, meaningful scene composition, rights-cleared assets and provenance. No fingerprint spoofing, hash manipulation, proxy rotation, CAPTCHA bypass or artificial engagement is supported.

## Hybrid execution

| Phase | Responsibility | Execution |
|---|---|---|
| A | Creative architecture / intent / planning | Local |
| B | Asset sourcing / provenance / composition planning | Local |
| C | Audio Timing Spine / TTS orchestration | Local |
| D | Heavy asynchronous rendering | Local FFmpeg unless explicitly enabled |
| E | Managed state / analytics / learning evidence | Cloud-backed where configured |

AWS Phase-D remains disabled until its deployment and end-to-end release gate is independently evidenced:

```dotenv
SWARMX_AWS_RENDER_ENABLED=0
```

## Cloud integration

### Vercel

The current Vercel project is the Fastify API deployment. Its build contract is `pnpm install --frozen-lockfile`, then `@swarmx/types build` and `@swarmx/api build`. The dashboard remains its own Next.js application in the monorepo.

### Render

`render.yaml` defines the authoritative BullMQ worker. It connects to Upstash Redis and Neon, runs one video job at a time, keeps A-C local, and leaves AWS rendering disabled.

### Neon

Neon stores durable TikTok account state, render evidence and monetization observations. Use pooled connections for normal queries and the direct/unpooled connection for schema operations where required by the repository.

### Upstash Redis

Upstash Redis provides the managed queue/cache coordination used by BullMQ in the worker deployment. Keep `SWARMX_REDIS_PROVIDER=upstash` and `SWARMX_VIDEO_USE_BULLMQ=1` for the managed worker.

## TikTok publishing

Use [docs/TIKTOK-RELEASE-GATE-TEST.md](docs/TIKTOK-RELEASE-GATE-TEST.md) before enabling any automated Direct Post path.

TikTok is an optional downstream distribution adapter.

```text
OAuth 2.0
  -> durable tiktok_accounts row (active)
  -> creator_info/query
  -> controlled SELF_ONLY verification
  -> video/init using video.publish
  -> chunked FILE_UPLOAD
  -> status/fetch
  -> controlled_verified
  -> separate public-post gate and applicable audit requirements
```

The controlled verification path requires `privacy_level=SELF_ONLY` and `is_aigc=true`. Direct Post uses `video.publish`; `video.upload` is the separate draft-upload flow. The production publisher additionally requires a durable `controlled_verified` account; public posting remains a separate, explicitly disabled-by-default gate.

The publisher uses the provider-returned upload URL and bounded `Content-Range` chunks, then polls post status. Public posting remains independently disabled until the applicable TikTok requirements are satisfied.

See [docs/TIKTOK_SETUP.md](docs/TIKTOK_SETUP.md) and [docs/TIKTOK-CONTROLLED-VERIFICATION.md](docs/TIKTOK-CONTROLLED-VERIFICATION.md).

## Durable multi-account TikTok storage

`public.tiktok_accounts` stores one durable account identity per `user_id + open_id`, including encrypted token ciphertext, expiry timestamps, granted scopes and lifecycle status.

Supported status values are `active`, `controlled_verified`, `reauthorization_required`, `revoked` and `disabled`.

The normal Direct Post scope set is `user.info.basic` plus `video.publish`. Client keys, client secrets, access tokens and refresh tokens stay server-side.

Never manually write `controlled_verified`; the controlled-verification command promotes the real durable row only after a real successful provider result.

## Empirical monetization

Monetization is observation-based, not projection-based.

Track platform rewards, affiliate revenue, owned-product revenue, sponsorship revenue, LLM/TTS/render/storage/egress costs, view and watch metrics, engagement and deterministic attribution identifiers.

```text
contribution margin = observed revenue - observed LLM/TTS/render/storage/egress cost
```

Do not treat assumed RPM, CPM or expected virality as observed performance. P25/P50/P75 distributions are meaningful only after enough real observations exist.

See [docs/CREATIVE-HUB-MONETIZATION.md](docs/CREATIVE-HUB-MONETIZATION.md).

## UI / UX

The dashboard uses Obsidian Nocturne v2:

```text
#050508  base
#0B0D12  panel
#11141B  raised panel
#252A33  border
#3A424E  active border
#00E5FF  cyan
#00FF66  green accent
#F1F5F9  primary text
#7C8794  muted text
#FF5C5C  error
#F5C451  pending / warning
```

Creative Hub surfaces the states `RUNNING`, `QC_FAILED`, `NEEDS_REVISION`, `REVIEW_REQUIRED` and `READY_TO_POST`. Publishing authorization remains a separate gate from generation.

The dashboard includes safe-area handling, visible focus states, reduced-motion support and touch-friendly controls for mobile production use.


## Creative Hub v3

The canonical dashboard is apps/swarmx-dashboard. Creative Hub v3 extends the existing dashboard rather than introducing a parallel UI. Protected production writes require the server-configured dashboard access gate; the API token remains server-side.

### Local profiles

- 8 GB: docker-compose.8gb.yml — one model and one video job; validate peak memory with docs/8GB-PROFILING-RUNBOOK.md.
- 16 GB: docker-compose.16gb.yml — larger memory ceiling with the same one-job safety invariant.

Start with env.local, then use package scripts docker:up:8gb, docker:down, doctor and dev:hub. The hub-up script performs preflight, compose validation, health wait and a dashboard smoke test.

For cloud deployment, keep the same dashboard/API split and configure the non-loopback SWARMX_API_URL plus server-side secrets on the hosting platform. Certification remains SHA-specific; preview deployments are the validation surface for this branch.

See docs/CREATIVE-HUB.md and docs/accessibility/creative-hub-audit.md.

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm validate:openclaw
pnpm --filter @swarmx/api run test:video
pnpm --filter @swarmx/api run test:video:quality
pnpm --filter @swarmx/api run test:video:smoke
```

Use [docs/RELEASE-GATE-CHECKLIST.md](docs/RELEASE-GATE-CHECKLIST.md) for exact-head CI, deployment, AWS, TikTok, monetization and mobile evidence.

## Evidence posture

Automated green CI does not by itself certify local hardware, AWS deployment, TikTok controlled verification, public posting or physical-device UX. Those gates require their own evidence and remain fail-closed when absent.

## Release commands

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @swarmx/api run test:video
pnpm --filter @swarmx/api run test:video:quality
pnpm --filter @swarmx/api run test:video:smoke
pnpm --filter @swarmx/api test -- tiktok-protocol.test.ts
```

## Documentation

| Document | Purpose |
|---|---|
| [docs/QUICKSTART.md](docs/QUICKSTART.md) | Fast local startup |
| [docs/VIDEO-GENERATION.md](docs/VIDEO-GENERATION.md) | Video route, stage and local-generation contract |
| [docs/CREATIVE-HUB-MONETIZATION.md](docs/CREATIVE-HUB-MONETIZATION.md) | Empirical contribution-margin model |
| [docs/TIKTOK_SETUP.md](docs/TIKTOK_SETUP.md) | OAuth, scopes and publishing setup |
| [docs/TIKTOK-CONTROLLED-VERIFICATION.md](docs/TIKTOK-CONTROLLED-VERIFICATION.md) | Controlled SELF_ONLY verification |
| [docs/RELEASE-GATE-CHECKLIST.md](docs/RELEASE-GATE-CHECKLIST.md) | Production evidence gates |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Operational diagnosis |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Day-to-day operations |

## Project policy

Read `CLAUDE.md`, `SAFETY.md` and the release-gate documents before changing execution, memory or publication behavior.