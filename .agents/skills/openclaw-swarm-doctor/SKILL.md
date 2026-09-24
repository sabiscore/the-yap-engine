---
name: openclaw-swarm-doctor
description: Diagnose The Yap Engine runtime, Ollama reachability, model admission, RAM pressure and queue health without bypassing SwarmXQ governance.
user-invocable: true
---

# Swarm Doctor

## Use when
The operator reports slow inference, OOM risk, failed model loads, stuck jobs or unexpected degradation.

## Workflow
1. Read documented health/status surfaces.
2. Check Ollama reachability and current model state through supported interfaces.
3. Inspect SwarmXQ pressure/governor status.
4. Inspect queue/job state.
5. Correlate symptoms with the existing pressure tier and Operator.
6. Recommend the smallest reversible action.

## Hard boundaries
Never directly unload models, change pressure thresholds, increase concurrency or bypass execution gates. Never infer that a model is safe from RAM total alone.

## Output
`NEXUS → symptoms → evidence → invariant check → root-cause candidates → safe action → verification`.

## Stop conditions
Stop when evidence identifies a safe next action or required telemetry is unavailable. Report uncertainty explicitly.
