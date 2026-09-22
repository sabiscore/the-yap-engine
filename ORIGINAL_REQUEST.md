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
