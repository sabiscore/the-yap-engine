# Original User Request

## Initial Request — 2026-08-31T21:25:21Z

<USER_REQUEST>
Requested team: small focused team

This is a single self-contained update; keep it small and focused.
Update CLAUDE.md and NEXUS.md to reconcile their baselines with the shipped V6.2.60 reality and strictly apply the v3.1.0 Core Execution Directive's 16GB hardware assumptions (INV-09, CPU floor, etc.).

Integrity mode: demo
Working directory: /home/scar/Documents/SwarmXQ

## Requirements

### R1. Reconcile Baseline Versions
Update headers and references in both `CLAUDE.md` and `NEXUS.md` to reflect the shipped `V6.2.60` reality, replacing outdated `V6.2.53`/`V6.2.63` references where appropriate based on the memory notes.

### R2. Apply 16GB Hardware Assumptions
Integrate the v3.1.0 Core Execution Directive. Replace all 8GB-degraded assumptions with the new 16GB baseline (INV-09). Explicitly state that `OLLAMA_MAX_LOADED_MODELS=1` (or 2 for Pilot+7B) and `MAX_CONCURRENT_JOBS=1` remain strictly enforced, as CPU inference is strictly serial (`OLLAMA_NUM_PARALLEL=1`).

### R3. Update Pressure and Taxonomy Reasoning
Update the documentation to reflect that the binding constraint is now the CPU pressure floor (INV-06) (`loadAvg1m / coreCount < 0.85`), not RAM exhaustion. Ensure the 7-operator taxonomy fits within the new constraints without relaxing the SINGLE-7B LOCK.

## Acceptance Criteria

### Documentation Accuracy
- [ ] Both `CLAUDE.md` and `NEXUS.md` accurately state the 16GB RAM baseline.
- [ ] The SINGLE-7B LOCK and `MAX_CONCURRENT_JOBS=1` are explicitly preserved and not relaxed.
- [ ] The CPU pressure floor (INV-06) is documented as the primary stalling constraint.

### Verification (Programmatic & Agent-as-judge)
- [ ] `git diff --check` passes with zero whitespace violations.
- [ ] `grep -rn '\-scar'` across the updated files returns zero hits (no legacy aliases reintroduced).
- [ ] An independent reviewer agent verifies that all V3.1.0 directive invariants (INV-06, INV-08, INV-09) are present in the updated markdown files and that no existing invariants (like INV-01 through INV-05) were accidentally removed.
</USER_REQUEST>

## Follow-up — 2026-09-22T21:01:21Z

<USER_REQUEST>
# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Small focused team

This is a single self-contained fix; keep it small and focused. Resolve lingering UI issues, branding remnants, and overly aggressive CPU-blocking logic in The Yap Engine dashboard based on screenshot analysis.

Working directory: /home/scar/Documents/theyapengine
Integrity mode: development

## Requirements

### R1. Complete the Branding Renaming
The top-left logo component still displays "SwarmX". Replace the text "SwarmX" with "The Yap Engine" (or "Yap Engine") in the dashboard codebase while retaining the existing green polygon SVG icon.

### R2. Remove CPU-Load Pipeline Blocker
The dashboard currently blocks new video job submissions when the CPU load hits 85%. Since Ollama inference maxes out the CPU on this machine, this wrongly prevents queuing jobs. Remove the CPU-overload check from the submission blocking logic (e.g., `pipelineHealthBlocked` in `runtime-guidance.ts`).

### R3. Fix Job Progress Text Formatting
The active job status pill at the top shows awkwardly interpolated text (e.g., "Making Create a 30-second faceless TikTok video..."). Clean up this string interpolation so the active job display reads naturally without redundant phrasing.

## Verification Resources
- The project has a comprehensive vitest suite in `apps/swarmx-dashboard`.
- TypeScript compiler checks via `pnpm -F swarmx-dashboard tsc --noEmit`.
- Next.js build via `pnpm -F swarmx-dashboard next build`.

## Acceptance Criteria

### Branding
- [ ] No visual instances of "SwarmX" remain in the top navigation or side rail components.
- [ ] The SVG icon in the top left remains intact and functional.

### Logic
- [ ] The dashboard allows queuing new jobs even if the CPU is at 100% load.
- [ ] The `apps/swarmx-dashboard` vitest test suite passes (specifically `runtime-guidance.test.ts`).

### UI Polish
- [ ] The active job progress pill text does not awkwardly duplicate verbs (e.g., it shouldn't say "Making Create a...").
- [ ] Next.js project builds successfully without type errors.
</USER_REQUEST>

## Follow-up — 2026-09-23T00:08:48Z

<USER_REQUEST>
# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Full multi-agent team

Implement the comprehensive UI/UX overhaul of The Yap Engine dashboard into a modern, high-contrast, visually cohesive creativity hub with container-query responsive layouts, upgraded telemetry observability widgets, semantic typography hierarchy, and interactive video pipeline UX affordances.

Working directory: /home/scar/Documents/theyapengine
Integrity mode: development

## Requirements

### R1. Responsive Information Architecture & Layout Overhaul
Restructure the dashboard layout (`AppShell.tsx`, `(dashboard)/layout.tsx`) into a container-query driven layout. Support smooth collapsible sidebar navigation and a floating/collapsible telemetry drawer on constrained viewports while preserving xterm.js terminal integration and layout state.

### R2. High-Contrast Observability & Telemetry Module
Create and integrate a high-contrast, modern `TelemetryWidget` component displaying CPU load, ZRAM usage, agent fleet fanout, and Ollama warming status with semantic CSS theme variables (`text-status-active`, `text-status-warning`, `text-status-error`, `bg-bg-elevated`) and accessible `aria-live` regions.

### R3. Interactive Video Pipeline UX & Queue Triage
Overhaul the video pipeline and studio page (`video/page.tsx`, `VideoJobForm.tsx`, queue views) to feature:
- Progressive disclosure for advanced parameters (model tiers, voice settings) using modern semantic details/disclosure patterns.
- Consolidated tabbed queue management (Active, Queued, Failed / Dead-letter triage).
- Quick actions (retry, cancel, move) revealed smoothly on hover and focus-within.
- High-contrast visual indicators for active rendering states (subtle pulse and status highlights).

### R4. Documentation, Quality Gate, and Release
Update user-facing and architectural documentation (`README.md`, `DESIGN_OVERHAUL_STRATEGY.md`) to document the new UI architecture and layout system. Verify all vitest suites, TypeScript compilation, and Next.js production builds pass without errors, then commit and push to `main`.

## Verification Resources
- Vitest test suite: `pnpm -F swarmx-dashboard vitest run`
- TypeScript compilation: `pnpm -F swarmx-dashboard tsc --noEmit`
- Production Next.js build: `pnpm -F swarmx-dashboard next build`
- Monorepo invariant checks per `AGENTS.md` (no `console.*` in services/routes, no legacy `-scar` tags)

## Acceptance Criteria

### Layout & Responsiveness
- [ ] Dashboard layout seamlessly adapts across desktop, tablet, and compact container widths.
- [ ] Navigation rail cleanly expands and collapses without content clipping or terminal canvas desync.
- [ ] Telemetry drawer can be toggled or floated cleanly.

### Telemetry Observability
- [ ] Telemetry widget distinctly separates CPU load, ZRAM pressure, and agent fanout using high-contrast status tokens.
- [ ] Real-time updates utilize accessible `aria-live="polite"` regions and screen-reader safe labels.

### Pipeline UX & Queue Management
- [ ] Advanced video job options are collapsed by default via progressive disclosure and expand smoothly.
- [ ] Queues provide tabbed triage between active jobs, queued jobs, and dead-letter/failed jobs.
- [ ] Quick actions (retry/cancel) are accessible via keyboard focus (`focus-within`) as well as mouse hover.

### Build & Release Integrity
- [ ] `pnpm -F swarmx-dashboard tsc --noEmit` exits with code 0.
- [ ] All vitest test suites in `apps/swarmx-dashboard` pass.
- [ ] `pnpm -F swarmx-dashboard next build` compiles cleanly across all routes.
- [ ] Changes committed cleanly and pushed to `origin/main`.
</USER_REQUEST>

## Follow-up — 2026-09-24T09:46:50Z

<USER_REQUEST>
OpenClaw × SwarmXQ APEX-17 r8 Local Coding-Agent, Multimodal Intelligence & Creative Systems Engineering Directive implementation across The Yap Engine repository.

Working directory: /home/scar/Documents/theyapengine
Integrity mode: development

## Requirements

### R1. Harden OpenClaw Integration Boundaries & Static Invariant Validation
- Ensure OpenClaw operates strictly as an outer human-facing control plane and bounded coding worker, never a second orchestrator.
- Maintain static validation (scripts/validate-openclaw-integration.py) preserving ModelOrchestrator authority, SINGLE-7B lock, and gated production deployments.
- Ensure package script pnpm validate:openclaw executes correctly across environments with Python 3 resolution.

### R2. Deterministic Bounded Coding-Agent Baseline Harness
- Maintain deterministic local benchmark harness at benchmarks/coding-agent/ with bounded tool surface (list_files, read_file, search_repo, write_file, run_validation).
- Validate harness robustness against Python executable variations and record baseline for code-qwen25-pro-q5km-prod (Forge) under CPU-only memory constraints.
- Multi-dimensional reporting: pass rate, first-pass rate, tool-call validity, latency, and host memory footprint (MemAvailable).

### R3. Bounded Multimodal Vision Worker Integration
- Keep vision capability (qwen3-vl:4b) strictly bounded and advisory for storyboard inspection, OCR, safe-zone analysis, and composition critique.
- Ensure deterministic render and QC code remain authoritative; no permanent co-residency of vision models on constrained hardware.

### R4. Creative Intelligence System Integration
- Integrate bounded creative workflows: Creative Director, Virality Critic, Vision Critic, and Virality Cheatbook Writer.
- Preserve 10-family template taxonomy, explicit hook grammars, and enforce max 1 critique + 1 revision pass (no unbounded loops).
- Maintain evidence-backed cheatbook entries with explicit observation, hypothesis, and causal separation.

### R5. Non-Negotiable Runtime Invariants & Monorepo Health
- Enforce SINGLE-7B LOCK, MAX_CONCURRENT_JOBS=1, OLLAMA_NUM_PARALLEL=1, RAM_CRITICAL_MB=800.
- Zero console.* in API services and routes; all environment reads through loadEnv().
- Canonical tag resolution for all operators (@swarmx/types/operator-map).
- Full monorepo typecheck, lint, and test suite green.

## Acceptance Criteria

### Security & Invariants
- [ ] OpenClaw reference configuration enforces localModelLean: true, non-main docker sandboxing, and denies unapproved network/browser tools.
- [ ] pnpm validate:openclaw exits cleanly with code 0.
- [ ] Zero console.* statements across apps/swarmx-api/src/services/ and apps/swarmx-api/src/routes/.
- [ ] Zero legacy -scar tags in active production code.

### Coding-Agent Benchmark Contract
- [ ] Benchmark runner (benchmarks/coding-agent/run.py) executes cleanly with python3/venv support.
- [ ] Validation commands in benchmarks/coding-agent/cases.jsonl execute deterministically in isolated workspaces.
- [ ] Multi-dimensional metrics contract captured (pass rate, first-pass rate, tool validity, memory delta).

### Creative Intelligence & Vision
- [ ] 5 OpenClaw skills present and verified in integrations/openclaw/skills/.
- [ ] Creative loop strictly bounded to 1 critique and 1 revision pass.
- [ ] Virality cheatbook maintains structured schema with verified evidence.

### Monorepo Verification
- [ ] pnpm -F @swarmx/types typecheck exits 0.
- [ ] pnpm -F @swarmx/api typecheck exits 0.
- [ ] pnpm -F @swarmx/dashboard typecheck exits 0.
- [ ] pnpm -F @swarmx/dashboard test passes with all suites green.
- [ ] pnpm -F @swarmx/api test passes.
</USER_REQUEST>
