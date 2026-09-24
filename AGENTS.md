# SwarmXQ Engineering Contract — V6.2.22
# Location: AGENTS.md (root — governs all Codex / OpenAI Agents / ChatGPT Code tasks)
# Hardware: HP EliteBook 850 G3 · 16 GB RAM · CPU-only · WSL2

This document governs all AI-assisted code generation, review, and modification in
the SwarmXQ repository. Read it completely before producing any output.

---

## PROJECT DISCOVERY (Execute Before Any Task)

```
1. Read CLAUDE.md (root)         ← project invariants, skill registry, milestone queue
2. Read NEXUS.md (root)          ← task routing and skill selection logic
3. Read the relevant SKILL.md    ← domain-specific constraints for the task
4. Read affected source files    ← grep/cat before writing; never infer from memory
5. Check git status              ← working tree must be clean before changes
6. Verify invariants are intact  ← run quick-check commands below
```

**Do not infer the stack from training data. Verify it from the repository.**

---

## NON-NEGOTIABLE INVARIANTS

Violations of these rules are CRITICAL — fix before any other work in a session.

### 1. SINGLE-7B LOCK
Only one 7B-class model (Architect, Oracle, Forge, Auditor, Lab) may be
inference-active simultaneously. On 16 GB, `OLLAMA_MAX_LOADED_MODELS=2` allows
Pilot (~3 GB) to remain resident while a 7B runs — NOT concurrent inference.
`evictIncompatible()` must be called before every 7B model load.

### 2. console.* ZERO TOLERANCE
`grep -rn 'console\.' apps/swarmx-api/src/services apps/swarmx-api/src/routes`
must return zero hits. Use `log.*` from `src/lib/logger.ts` exclusively.

### 3. CANONICAL TAG RESOLUTION
All model tags MUST pass through `resolveCanonicalTag()` from
`@swarmx/types/operator-map` before entering the registry, any log entry,
or any API response. Legacy `-scar` tags and V5 operator names
(`SENTINEL`, `CANVAS`, `LEDGER`, `PROPHET`, `EVOLVER`) are forbidden in new code.

### 4. sanitizeReasoningOutput() MANDATORY
Every Ollama response passes through `sanitizeReasoningOutput()` before parsing.
DeepSeek `<think>` blocks must never reach intent JSON, script text, storyboard
frames, or downstream agents. Use `extractJson()` — never `JSON.parse()` on raw output.

### 5. ENV SCHEMA COMPLIANCE
Never use `process.env['VAR']` directly in `src/services/` or `src/routes/`.
All environment access goes through `src/lib/env.ts` (Zod schema + `loadEnv()`).

### 6. PROTECTED CONSTANTS
- `RAM_CRITICAL_MB = 800` — do not change
- `MAX_CONCURRENT_JOBS = 1` — do not change
- `OLLAMA_NUM_PARALLEL = 1` — CPU cannot benefit from parallelism; do not increase

### 7. VIDEO STAGE ORDER (immutable)
```
intent_classification → planning → scripting → storyboard_generation → render_assembly → finalizing
```
Post-pipeline (non-blocking): `stageViralityAndCaption()`

### 8. modelsUsed[stage] PLACEMENT
Set `ctx.modelsUsed[stage]` immediately after `acquireModel()` inside the stage
function — never in `runStage()`.

### 9. TONE_RULES EXHAUSTIVE
`TONE_RULES` in `video-orchestrator.ts` must contain all 8 variants:
`contrarian | urgent | educational | cinematic | warm | minimal | faceless_broll | kinetic_text`

---

## MONOREPO BOUNDARIES

```
packages/swarmx-types/  ← canonical contracts; apps import from here, never the reverse
apps/swarmx-api/        ← Fastify API; imports from packages/
apps/swarmx-dashboard/  ← Next.js dashboard; imports from packages/; zero direct Ollama calls
src/swarmx/             ← Python brain; structlog only; asyncio + httpx; no requests/print
```

**Package manager: pnpm only.** Never create a second lockfile. Never `npm install`.

---

## OPERATOR MAP (Canonical — packages/swarmx-types/src/operator-map.ts)

| Operator | Canonical tag | Role |
|---|---|---|
| Relay | `route-phi4-lite-q4km-prod` | Pre-pipeline routing |
| Pilot | `instruct-phi4-pro-q8-prod` | intent_classification, caption |
| Pilot lite | `instruct-phi4-lite-q4km-prod` | Low-RAM text stage fallback |
| Architect | `plan-qwen25-pro-q5km-prod` | planning, scripting, storyboard |
| Architect deep | `plan-deepseekr1-pro-q5km-prod` | Deep planning fallback |
| Oracle | `reason-deepseekr1-pro-q5km-prod` | Virality scoring |
| Forge | `code-qwen25-pro-q5km-prod` | Agent code generation |
| Auditor | `critique-deepseekr1-pro-q5km-prod` | Agent QA gating |
| Lab | `synth-qwen25-exp-q4km-dev` | Meta-evolution (dev only) |

---

## SKILL SYSTEM (.ai/skills/)

Before generating code for any domain, read the governing SKILL.md:

```bash
# Read before writing video pipeline code
cat .ai/skills/swarmxq-video-pipeline-architect/SKILL.md

# Read before any model routing or keep-alive change
cat .ai/skills/swarmxq-model-orchestrator/SKILL.md

# Read before any script quality, tone, or virality change
cat .ai/skills/swarmxq-creative-director/SKILL.md

# Read before startup-enhanced.sh or Ollama perf var changes
cat .ai/skills/swarmxq-startup-ops-architect/SKILL.md

# Read before .github/workflows/ changes
cat .ai/skills/swarmxq-ci-release-architect/SKILL.md
```

---

## FASTIFY API CONTRACT

```typescript
// Routes: thin — auth, validation, protocol translation only
// Services: application logic, domain rules, AI calls
// Never: business logic in routes; never: model calls in routes

// All model calls require all three wrappers:
import { getAdaptiveCallConfig, withTimeout } from "./adaptive-timeout-config.js"
import { sanitizeReasoningOutput, extractJson } from "./reasoning-sanitizer.js"
import { resolveCanonicalTag } from "@swarmx/types/operator-map"

// requireVideoWriteAuth() on every POST /api/video/* mutation
// Logging: log.info | log.warn | log.error | log.fatal — zero console.*
```

---

## PYTHON BRAIN CONTRACT

```python
# structlog only — no print(), no logging.basicConfig()
import structlog
log = structlog.get_logger()

# httpx.AsyncClient only — no requests (blocking I/O)
import httpx

# operator_map.py must mirror operator-map.ts semantically
# Never: SENTINEL, CANVAS, LEDGER, PROPHET, EVOLVER (V5 names)
# Use: Relay, Pilot, Architect, Forge, Oracle, Auditor, Lab (APEX-17 r8)
```

---

## RELIABILITY REQUIREMENTS

All outbound Ollama calls require:
- Explicit timeout via `withTimeout()` from `adaptive-timeout-config.ts`
- Circuit breaker check (`circuitOpen`) before calling
- Fallback path when circuit is open — never throw uncaught exceptions
- `sanitizeReasoningOutput()` on every response
- `recordSuccess()` / `recordFailure()` for circuit breaker state

All BullMQ jobs require:
- Idempotent submission using `clientRequestId` dedup
- Dead-letter queue configuration
- Bounded retry attempts
- Graceful shutdown (stop accepting before process termination)

---

## OBSERVABILITY REQUIREMENTS

Structured logs must include where applicable:
`timestamp`, `level`, `service`, `requestId`, `jobId`, `stage`, `modelTag`,
`durationMs`, `status`, `errorCode`, `retryAttempt`, `availableMb`

Video-specific spans: `video.job.enqueue`, `video.stage.{name}.start`,
`video.stage.{name}.complete`, `video.model.acquire`, `video.render.start`

---

## DEFINITION OF DONE

Before marking any task complete:

```bash
pnpm -F swarmx-api tsc --noEmit
pnpm -F swarmx-types tsc --noEmit
pnpm -F swarmx-dashboard tsc --noEmit
pnpm -F swarmx-dashboard vitest run         # ≥52 passing
pnpm -F swarmx-dashboard next build
npx tsx apps/swarmx-api/scripts/video-regression-check.ts
npx tsx apps/swarmx-api/scripts/reasoning-sanitizer-regression.ts
git diff --check

# Invariant checks
grep -rn 'console\.' apps/swarmx-api/src/services apps/swarmx-api/src/routes  # zero hits
grep -rn '\-scar' apps/ packages/ src/                                          # zero hits
```

---

## WHAT NOT TO GENERATE

```
❌ Any -scar model tag (phi4-fast-scar, qwen-worker-scar, deepseek-reasoner-scar, ...)
❌ V5 operator names in new code (SENTINEL, CANVAS, LEDGER, PROPHET, EVOLVER)
❌ console.log / console.error anywhere in src/services/ or src/routes/
❌ process.env['VAR'] directly in services or routes (use env.ts)
❌ JSON.parse() on raw DeepSeek/Ollama output (use extractJson())
❌ OLLAMA_MAX_LOADED_MODELS=1 on 16 GB host (correct value is 2)
❌ OLLAMA_NUM_PARALLEL > 1 (CPU cannot benefit)
❌ Two 7B models simultaneously
❌ exec() for FFmpeg calls (use execFile() with timeout and maxBuffer)
❌ Hardcoded model tags outside MODEL_OPERATOR_MAP
❌ Cold-start ETA values (140/45) hardcoded in dashboard components
❌ COMFY_POLL_MAX_ATTEMPTS as a literal constant
❌ requestVideoWriteAuth() missing from POST /api/video/* routes
❌ AbortController listeners without { once: true }
❌ modelsUsed[stage] set in runStage() rather than inside the stage function
```

---

## OPENCLAW CONTROL-PLANE BOUNDARY

OpenClaw is an **outer human-facing control plane and coding-agent shell**. It is not a replacement
for SwarmXQ's ModelOrchestrator or Operator registry.

For OpenClaw work, read:
- `docs/OPENCLAW-SWARMXQ-APEX17-DIRECTIVE.md`
- `integrations/openclaw/README.md`
- `integrations/openclaw/config.json5`
- the relevant `integrations/openclaw/skills/*/SKILL.md`

### OpenClaw invariants

1. Production SwarmX inference remains behind `ModelOrchestrator`.
2. OpenClaw must not call Ollama directly for production video stages.
3. `OLLAMA_NUM_PARALLEL=1` remains mandatory.
4. The SINGLE-7B lock remains mandatory.
5. 8 GB hosts use one loaded model; 16 GB hosts may use bounded residency only after pressure checks.
6. Experimental vision models are on-demand workers and are not production Operators until they have formal registry contracts and local eval evidence.
7. Cloud routing is disabled for local-only missions.
8. Production deploys, model promotion, protected constants, and destructive actions remain human-gated.
9. Smaller/heavily quantized local models require sandboxing and strict tool allowlists.
10. Model replacement decisions require measured task success, tool reliability, latency, peak RSS, RAM headroom, and regression evidence — not leaderboard scores alone.


