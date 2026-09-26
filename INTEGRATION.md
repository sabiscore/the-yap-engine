# The Yap Engine — Integration Guide

The current OpenClaw integration uses the APEX-21 production boundary.

## Canonical entrypoints

- docs/OPENCLAW-SWARMXQ-APEX21-DIRECTIVE.md — canonical Creative Compiler, resource, Modal, QC and production automation directive.
- integrations/openclaw/README.md — OpenClaw setup and operational boundary.
- integrations/openclaw/config.json5 — reference local Ollama/sandbox configuration.
- benchmarks/coding-agent/ — deterministic coding-agent evaluation harness.
- scripts/validate-openclaw-integration.py — static integration invariant check.

## Production authority

OpenClaw is the outer control plane. SwarmXQ remains authoritative for production model lifecycle, RAM pressure, concurrency, video orchestration, rendering, BullMQ state and publication gates.

The Creative Factory is the authoritative creative compiler. Do not create a second creative compiler, renderer registry or model governor.

## Creative production path

Creative DNA → Concept Tournament → SceneSpecV2 → Asset Graph → Audio Timing Spine → Background Budget → Incremental Render Graph → deterministic QC → serialized visual QC → bounded revision → package.

## Remote GPU boundary

Modal is a burst render adapter only. The current worker targets Wan2.2 5B on L4 with min_containers=0 and a maximum of four containers. Remote artifacts require schema validation, checksum verification and FFprobe acceptance before SwarmXQ can consume them.

See docs/MODAL-APEX21-DEPLOYMENT.md for deployment and smoke-test procedures.

## Never

- start a second Ollama daemon;
- bypass ModelOrchestrator;
- increase OLLAMA_NUM_PARALLEL;
- weaken the SINGLE-7B or pressure policy;
- promote experimental models without benchmark evidence;
- expose secrets or broad host filesystem access to local agents;
- treat free media API access as automatic commercial-rights clearance;
- accept a remote artifact without contract and media validation.
