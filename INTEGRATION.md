# The Yap Engine — Integration Guide

This repository's current integration boundary is documented in the canonical APEX-17 r8 documents.

## Canonical entrypoints

- `docs/OPENCLAW-SWARMXQ-APEX17-DIRECTIVE.md` — OpenClaw architecture, invariants, model strategy and promotion policy.
- `integrations/openclaw/README.md` — OpenClaw setup and operational boundary.
- `integrations/openclaw/config.json5` — reference local Ollama/sandbox configuration.
- `benchmarks/coding-agent/` — deterministic coding-agent evaluation harness.
- `scripts/validate-openclaw-integration.py` — static integration invariant check.

## Current production boundary

OpenClaw is an outer control plane. Production video inference remains owned by SwarmXQ's `ModelOrchestrator` and existing Operator taxonomy.

Do not:
- start a second Ollama daemon;
- bypass `ModelOrchestrator`;
- increase `OLLAMA_NUM_PARALLEL`;
- weaken the SINGLE-7B or pressure policy;
- promote experimental models without benchmark evidence;
- expose secrets or broad host filesystem access to local agents.

The historical V6.1 integration instructions that previously occupied this file are retired; current runtime behavior is defined by the source tree and canonical documents above.
