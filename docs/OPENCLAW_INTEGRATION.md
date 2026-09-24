# OpenClaw Integration Contract — The Yap Engine

**Status:** additive / fail-closed / local-first  
**Revision:** 2026-09-24

## Purpose

OpenClaw is the human-facing control plane and bounded coding/research worker for The Yap Engine. SwarmXQ remains the runtime authority for model lifecycle, pressure policy, video jobs, execution gates and render orchestration.

```text
Chat channels / Control UI
        ↓
OpenClaw Gateway
        ↓ bounded skills/tools
The Yap Engine public API / CLI
        ↓
SwarmXQ ModelOrchestrator
        ↓
Ollama
```

## Non-negotiable boundaries

### OpenClaw may
- inspect repository files and documented API status;
- submit bounded missions through the public API;
- inspect job status/events;
- invoke repository-local AgentSkills;
- run coding-agent work in isolated Git worktrees;
- run tests, lint and typecheck in the approved worktree;
- prepare reviewable patches.

### OpenClaw must not
- instantiate or replace `ModelOrchestrator`;
- call Ollama model eviction/unload directly;
- bypass `execution_gate.py` or public API authorization;
- modify pressure thresholds or concurrency limits;
- write SwarmXQ persistence directly;
- activate two 7B-class inference workloads;
- promote an experimental model without local evidence;
- expose credentials or raw private media in prompts/logs.

## Local runtime contract

```bash
SWARMX_OLLAMA_URL=http://127.0.0.1:11434
SWARMX_API_URL=http://127.0.0.1:3001
OLLAMA_NUM_PARALLEL=1
```

The existing host profile and governor remain authoritative for `OLLAMA_MAX_LOADED_MODELS`, keep-alive, context and pressure behavior. Do not hard-code competing values in OpenClaw.

Minimal OpenClaw local model selection:

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "ollama/instruct-phi4-pro-q8-prod"
      }
    }
  }
}
```

Use the installed OpenClaw version's provider/config schema when applying this snippet; do not copy an obsolete schema blindly.

## Model admission

The current Operator registry remains the compatibility baseline. New GGUFs are experimental until measured for resident weight size, KV-cache growth, peak host RAM, tokens/sec, time-to-first-token, structured-output validity, tool-call success, task quality and failure behavior under each pressure tier.

### Quantization rule

Q4_K_M is the compact baseline. Q5_K_M/Q6_K are preferred for quality-sensitive coding/reasoning when measured headroom permits. IQ4_XS/IQ3 candidates require importance-matrix calibration and task-level regression testing.

Do not equate bits-per-weight with a universal percentage of retained quality.

### MoE rule

Active-parameter count is not a memory guarantee. A 26B-A4B or 80B/3B-active model can still require substantial resident weight storage. Admit an MoE only after measuring its complete GGUF/runtime footprint on the target host.

## Vision contract

Vision is serialized with text inference on the CPU-only baseline:

1. sample only required frames;
2. cap image count and pixel dimensions;
3. infer;
4. convert output to structured observations;
5. release the vision model;
6. resume the text/operator stage.

Vision may assist storyboard QA, OCR, caption placement, visual continuity and composition. It must not become an uncontrolled second resident model.

## Coding-agent security

Use isolated worktrees for changes. Treat contributor-controlled refs as untrusted. Do not run permission-bypassed coding workers against untrusted refs.

OpenClaw skills are executable instructions and must be treated as untrusted until reviewed. Prefer repository-local skills with explicit allowlists and narrow tool boundaries.

## Rollback

Disable OpenClaw skill entries and return to the normal SwarmXQ CLI/dashboard path. No SwarmXQ runtime state should depend on OpenClaw being installed.

## Acceptance

A change is accepted only when:
- existing SwarmXQ tests remain green;
- `git diff --check` is clean;
- no production Operator tag is silently changed;
- SINGLE-7B and serial inference remain enforced;
- new skills validate under the installed OpenClaw skill checker;
- model promotions have local benchmark evidence.
