# 8 GB Windows / WSL2 Profiling Runbook

Status: operator evidence gate · fail-closed

## Objective

Prove that the local A–C generation path and its supporting ingestion/orchestration steps can complete on an 8 GB Windows host without out-of-memory termination, uncontrolled model residency, or accidental TikTok/cloud execution.

CI's Windows compatibility job is not a substitute for this runbook because GitHub-hosted memory is not the target physical machine.

## 1. Host preflight

Run from WSL2:

```bash
free -h
nproc
node --version
pnpm --version
python --version
ollama --version
ffmpeg -version | head -1
ffprobe -version | head -1
```

Record:

- physical RAM: approximately 8 GB;
- WSL2 memory/swap configuration;
- available RAM before starting the API;
- Ollama version;
- FFmpeg/FFprobe versions.

Do not interpret swap or zram as available physical RAM.

## 2. Constrained profile

Use these controls for the certification run:

```dotenv
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
SWARMX_AWS_RENDER_ENABLED=0
SWARMX_TIKTOK_API_APPROVED=0
SWARMX_TIKTOK_PUBLIC_POSTS_ENABLED=0
SWARMX_TIKTOK_PRIVACY_LEVEL=SELF_ONLY
```

## 3. Baseline measurements

Capture available memory at four points:

1. before API startup;
2. after API + Ollama startup;
3. during the highest-memory A–C stage;
4. after render/QC cleanup.

Use:

```bash
watch -n 1 'free -m'
```

On Windows, capture Task Manager's physical memory and the WSL VM process as a second view.

## 4. Execute the production regression sequence

```bash
pnpm install --frozen-lockfile
pnpm --filter @swarmx/types typecheck
pnpm --filter @swarmx/api typecheck
pnpm --filter @swarmx/dashboard typecheck
pnpm --filter @swarmx/api test
pnpm --filter @swarmx/api run test:video
pnpm --filter @swarmx/api run test:video:quality
pnpm --filter @swarmx/api run test:video:smoke
```

Then execute one real, representative local generation job through the dashboard/API.

## 5. A–C audit

Verify the trace remains:

```text
Creative brief
 -> intent
 -> planning
 -> scripting
 -> storyboard / Scene Graph
 -> asset sourcing + provenance
 -> Audio Timing Spine
```

Record the model selected for each text stage and confirm no second heavyweight model becomes resident concurrently.

## 6. OOM / pressure evidence

Pass criteria:

- no OOM killer event;
- no Node process termination;
- no Ollama model-load failure caused by host memory;
- one inference slot remains enforced;
- one video job remains active;
- temporary media files are cleaned after the run;
- final MP4 exists and passes FFprobe validation;
- TikTok credentials are not required anywhere in the generation trace.

Any failure is a **HOLD**, not a reason to increase concurrency or disable memory guards.

## 7. Originality / provenance handoff

Before any cloud render handoff, verify:

- Creative DNA exists;
- Scene Graph exists;
- scenes contain substantive visual composition rather than superficial transformations;
- assets have provenance/rights metadata;
- audio has a recorded lineage;
- artifact checksum is recorded;
- technical, creative, continuity and compliance QC are complete.

The local generation route must not call TikTok readiness, Direct Post queues, or TikTok account storage.

## 8. Evidence bundle

Attach:

- host memory screenshots;
- command output;
- effective environment profile with secrets redacted;
- model/runtime selection log;
- final MP4 path and FFprobe output;
- job/checkpoint identifier;
- peak physical-memory observation;
- OOM/termination check;
- checksum/provenance record.

Certification statement:

> Local 8 GB certification is valid only for the captured host, configuration, model profile and artifact. It does not certify other hardware.

## 9. Escalation

If memory pressure occurs, reduce model/context/token budgets or use the canonical low-RAM profile. Do not solve an 8 GB failure by enabling parallel inference, loading multiple models, or silently degrading required audio/QC stages.