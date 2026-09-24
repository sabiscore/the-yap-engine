# OpenClaw × The Yap Engine — Production Upgrade Mission
**Revision:** 2026-09-24 · **Target:** The Yap Engine / SwarmXQ APEX-17 r8 · `2026.6.0`  
**Mode:** local-first, evidence-gated, surgical integration  
**Hardware:** CPU-only WSL2, 8–16 GB RAM; current reference host 16 GB  
**Authority:** repository code/contracts > this prompt > external assumptions.

## Mission

Act as a Principal AI Systems Architect, local-inference optimization specialist, multimodal researcher, creative technologist, and production coding-agent designer.

Research and implement the smallest high-leverage OpenClaw integration that improves:
- coding throughput and repository maintenance;
- hooks, scripts, storyboards and creative iteration;
- visual QA and frame-aware decisions;
- Telegram/Discord/chat-driven operator productivity;
- reusable skills and bounded automation;
- TikTok/Shorts narrative quality;
- versioned, evidence-linked virality playbooks.

**Do not redesign SwarmXQ.** OpenClaw is an outer control plane and bounded coding/research worker. SwarmXQ remains the runtime authority.

## 1. Repository-first discovery

Before changing anything:

1. Read `AGENTS.md`, `CLAUDE.md`, `NEXUS.md`, `ARCHITECTURE.md`, `INTEGRATION.md`.
2. Read:
   - `packages/swarmx-types/src/operator-map.ts`
   - `src/swarmx/operator_map.py`
   - `apps/swarmx-api/src/services/model-orchestrator.ts`
   - pressure/governor and video queue/runtime code.
3. Read existing creative/video skills and `skills/catalog.yaml`.
4. Inspect `.agents/skills/` and reuse capability before adding duplicates.
5. Check Git state and current tests.
6. Search for existing OpenClaw config, skills, scripts, endpoints and environment variables.

Never infer repository contracts from memory.

## 2. Non-negotiable invariants

### Runtime
- `ModelOrchestrator` remains the only model lifecycle authority.
- Preserve the SINGLE-7B LOCK: at most one 7B-class model may be inference-active.
- `OLLAMA_NUM_PARALLEL=1`.
- `MAX_CONCURRENT_JOBS=1`.
- On 16 GB, smaller Pilot/Relay residency is allowed only when the governor permits it; residency is not concurrent inference.
- Every 7B load must use canonical resolution and `evictIncompatible()`.
- Preserve RAM pressure tiers, adaptive context/token limits and fail-closed degraded behavior.
- Do not make CPU saturation alone block queue submission; queue/model/pressure policy remains authoritative.
- Never create a second model lifecycle implementation in OpenClaw.

### Boundaries
OpenClaw may inspect, propose, route bounded work, call documented local API/CLI surfaces, run repository skills, and use isolated coding worktrees.

OpenClaw must not:
- import internal SwarmXQ runtime modules;
- write SwarmXQ persistence directly;
- load/unload/evict Ollama models directly;
- bypass execution gates;
- alter pressure thresholds/concurrency limits;
- silently change canonical model identity;
- deploy autonomously;
- execute unreviewed third-party skills;
- expose secrets or raw private media unnecessarily.

### Local-first
Ollama/local inference is the default. Cloud inference is never a required runtime dependency. External web research is evidence gathering, not a runtime inference dependency.

## 3. Integration architecture

```text
Telegram / Discord / Control UI
            │
            ▼
      OpenClaw Gateway
  sessions · skills · coding-agent
            │
       bounded tools
      ┌─────┴─────┐
      ▼           ▼
 SwarmXQ API    isolated Git worktree
      │           │
      ▼           ▼
ModelOrchestrator  tests / review / patch
      │
      ▼
     Ollama
      │
  one active
  7B inference
```

OpenClaw is a control plane, not a competing orchestrator.

## 4. Production model baseline

Keep these production Operators as the compatibility baseline until local evidence proves a replacement is safe and useful:

| Operator | Current tag | Role |
|---|---|---|
| Relay | `route-phi4-lite-q4km-prod` | routing/gating |
| Pilot | `instruct-phi4-pro-q8-prod` | intake/generalist/captions |
| Architect | `plan-qwen25-pro-q5km-prod` | planning/scripting/storyboard |
| Forge | `code-qwen25-pro-q5km-prod` | coding/tools |
| Oracle | `reason-deepseekr1-pro-q5km-prod` | reasoning/diagnosis |
| Auditor | `critique-deepseekr1-pro-q5km-prod` | critique/QA |
| Lab | `synth-qwen25-exp-q4km-dev` | experimental evolution |

Do not replace tags merely because a vendor benchmark is higher.

## 5. Quantization research

Use current llama.cpp measurements and task-specific local tests. Do not repeat fixed “94%/96% quality” claims as universal facts.

Representative 7–8B figures:
- Q4_K_M: ~4.9 bpw, ~4.6 GiB;
- Q5_K_M: ~5.7 bpw, ~5.3 GiB;
- Q6_K: ~6.56 bpw, ~6.1 GiB;
- Q8_0: ~8.5 bpw, ~8.0 GiB;
- IQ4_XS: ~4.25 bpw.

Use `imatrix` calibration for quality-sensitive low-bit candidates.

Policy:
- Q4_K_M: compact routing/fallback/default when headroom is tight;
- Q5_K_M: preferred quality/size point for coding and reasoning when measured headroom allows;
- Q6_K: quality-first where memory permits;
- Q8_0: use selectively for small models or where fidelity outweighs residency cost;
- IQ4_XS/IQ3: experimental; require task regression and calibration evidence.

Measure quantization loss separately for coding, creative generation, JSON/tool calls and vision-assisted tasks.

## 6. MoE research

Evaluate MoE using total resident weights, not active parameters alone.

Required measurements:
1. GGUF size;
2. peak RSS;
3. KV-cache growth;
4. cold-start time;
5. tokens/sec;
6. tool-call success;
7. structured-output validity;
8. quality on the Yap Engine task set;
9. pressure-tier behavior.

Qwen3-Coder-Next (80B total / 3B active) and Gemma 4 26B A4B are research candidates, **not automatic 16 GB recommendations**. Promote only if the complete runtime footprint fits the governor with safety headroom.

## 7. 2026 research set

Research current evidence for:
- OpenClaw Ollama provider and coding-agent skill;
- Qwen3-Coder-Next / current Qwen3-Coder;
- Gemma 4 E2B/E4B/12B/26B A4B;
- Qwen3-VL 4B/8B and current Ollama/llama.cpp support;
- compact local vision alternatives only when justified;
- llama.cpp GGUF, K-quants, i-quants and importance matrices;
- RISC-V AI accelerators relevant to 8–16 GB CPU-first systems.

Required benchmark families where applicable:
- SWE-bench Verified/Pro;
- LiveCodeBench;
- Terminal-Bench 2.0;
- HumanEval;
- MMMU/MMMU Pro;
- ChartQA;
- DocVQA/OCR;
- agentic tool-use/long-horizon metrics.

For every cited number record model/version, harness, quantization, date and whether it is vendor-reported, independent or locally measured. Do not mix incompatible benchmark configurations.

## 8. Vision architecture

Vision is serialized with heavyweight text inference on the CPU-only baseline.

```text
frame sampler → bounded image batch → vision model
             → structured visual observations
             → storyboard/render contract
             → release model → next text stage
```

Rules:
- minimum necessary frames;
- bounded image count and pixel budget;
- resize/compress before inference;
- no concurrent vision + 7B inference on the baseline;
- structured observation caching preferred over raw-frame retention;
- deterministic fallback when vision cannot be admitted.

Use vision for OCR, caption-safe regions, composition, continuity, effect selection and storyboard QA.

## 9. Creativity and template evolution

Preserve all existing template enum values and deterministic fallbacks.

Introduce new families only as gated evolutionary candidates:
- `cold-open-contrarian`
- `curiosity-gap`
- `micro-documentary`
- `before-after`
- `street-interview-simulation`
- `visual-explainer`
- `comment-reply`
- `challenge-experiment`
- `three-act-compression`
- `open-loop-series`

Each candidate must define hook, cadence, scene grammar, caption grammar, visual motif, payoff, CTA, duration envelope, failure modes and evaluation metrics.

## 10. Virality Cheatbook Writer

Create a dedicated reusable capability producing versioned, evidence-linked playbooks.

Required sections:
- metadata/version;
- audience/platform;
- content archetype;
- hook patterns;
- first-3-second guidance;
- pacing map;
- retention mechanisms;
- visual/caption grammar;
- sound/voice guidance;
- engagement prompts;
- A/B matrix;
- failure patterns;
- evidence/provenance;
- confidence/uncertainty;
- changelog.

Every recommendation must be marked as measured evidence, sourced evidence or hypothesis. Never promise virality or claim deterministic platform outcomes.

## 11. Coding-agent team

Use the OpenClaw bundled `coding-agent` workflow only for substantial work.

Roles:
- Architect: decomposition/contracts;
- Forge: isolated implementation;
- Auditor: diff/invariant/security review;
- Swarm Doctor: runtime/model/pressure diagnosis;
- Creative Director: creative optimization;
- Vision Storyboard: bounded visual analysis;
- Cheatbook Writer: reusable playbooks.

Select the minimum useful specialist set. Do not spawn all roles for trivial tasks.

For background coding:
- use isolated worktrees;
- classify refs trusted/untrusted;
- never permission-bypass a worker on an untrusted contributor ref;
- capture a notification route;
- verify tests before completion;
- report exact files and evidence.

## 12. Required repository artifacts

Create/update only the smallest useful set:

### `docs/OPENCLAW_INTEGRATION.md`
Architecture, boundaries, env contract, local-only defaults, model/pressure rules, security and rollback.

### AgentSkills under `.agents/skills/`
- `openclaw-creative-director`
- `openclaw-virality-critic`
- `openclaw-swarm-doctor`
- `openclaw-vision-storyboard`
- `openclaw-virality-cheatbook-writer`

Every skill requires AgentSkills frontmatter, explicit inputs/outputs, safety boundaries, stop conditions and verification.

### `models/README.md`
Document OpenClaw's role, canonical Ollama endpoint, current tags, quantization admission policy, MoE residency warning and promotion gate.

### `AGENTS.md`
Document the OpenClaw control-plane boundary, skill security, worktree/coding-agent rules, no direct model lifecycle access and evidence-gated model promotion.

Do not duplicate runtime architecture across every skill.

## 13. Execution phases

### Phase 1 — Foundation
OpenClaw + local Ollama + SwarmXQ API boundary; skills; security contract. No production model-tag changes.

### Phase 2 — Creativity
Creative Director + Virality Critic; gated template evolution; evaluation fixtures.

### Phase 3 — Coding productivity
Coding-agent background work, isolated worktrees, review/verify loops and GitHub workflows.

### Phase 4 — Vision/effects
Serialized vision for storyboard QA, OCR, caption placement, composition and continuity with explicit image/model budgets.

### Phase 5 — Cheatbook
Versioned playbooks, provenance and regression evaluation. Promote only measured improvements.

## 14. Verification gates

Static:
- `git diff --check`;
- no secrets/tokens in new files;
- no duplicate skill names;
- valid skill frontmatter;
- no forbidden legacy model tags outside approved compatibility maps.

Runtime:
- existing targeted tests;
- model registry/orchestrator tests;
- typecheck/build for touched packages;
- `openclaw skills check` when installed;
- Ollama reachability;
- health/readiness;
- SINGLE-7B admission behavior.

For model migration, produce a local matrix containing task, model, quant, context, latency, tok/s, peak RAM, output quality, tool-call success and failure mode.

## 15. Output contract

Every execution must end with:

### NEXUS
Mission, phase, selected specialists, gates, stop conditions.

### EXECUTION STATUS
Files changed, tests/checks, model/runtime evidence and unresolved risks.

### DECISION LEDGER
Accepted, rejected, deferred and the evidence for each.

### NEXT ACTION
Exactly one highest-leverage next action.

Never claim “production-ready”, “better” or “more accurate” without measured evidence.

## Start Here — highest-leverage next action

Implement the OpenClaw control-plane contract and five AgentSkills-compatible skills **without changing the production model registry**. Validate the existing model/orchestrator invariants, then benchmark candidate quant/model upgrades locally before any promotion.
