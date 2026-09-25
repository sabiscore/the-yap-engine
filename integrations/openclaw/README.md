# OpenClaw × SwarmXQ integration

## Local agent baseline

- Primary coding/reasoning: `qwen3:8b` Q4_K_M (~5.2 GB)
- Utility/fallback: `qwen3:4b` Q4_K_M (~2.6 GB)
- Vision: `qwen3-vl:4b` Q4_K_M (~3.3 GB)
- OpenClaw concurrency: `1`
- Keep-alive: `0s`

These models serve OpenClaw's bounded control-plane work. SwarmXQ remains authoritative for production video inference and model lifecycle.

This directory is the packaging boundary for the OpenClaw control plane. It does **not** replace the SwarmX runtime.

## Architecture

```
Telegram / Discord / local CLI
            │
            ▼
        OpenClaw
   control + coding agent
            │
      approved tools only
            │
            ▼
     SwarmXQ API / CLI
            │
      ModelOrchestrator
            │
            ▼
          Ollama
            │
   one inference slot
            │
            ▼
   existing Operators
```

### Production coding route

`ollama/qwen3:8b`

### Experimental vision route

`ollama/qwen3-vl:4b`

The vision route is intentionally not added to `MODEL_OPERATOR_MAP` by this integration. It is an experimental worker until the repository has a formal vision contract, residency accounting, and local evals.

## Setup

Use OpenClaw's Ollama provider and point it at the existing local daemon:

```bash
export OLLAMA_API_KEY="ollama-local"
openclaw onboard --auth-choice ollama --non-interactive --accept-risk --skip-health \
  --custom-base-url "http://127.0.0.1:11434" \
  --custom-model-id "qwen3:8b"
```

For a local-only installation, keep cloud models disabled and use OpenClaw's tool allowlist/sandbox.

The checked-in `config.json5` is a **reference profile**, not a secret-bearing production configuration. It uses OpenClaw's `coding` tool profile, lean local-model mode, and Docker sandboxing for non-main sessions. The sandbox keeps tool execution isolated while the Gateway/provider remains on-host. Keep `workspaceAccess: "rw"` only for a dedicated coding workspace; never bind a home directory or credential directory.

## Guardrails

- `OLLAMA_NUM_PARALLEL=1`
- 8 GB: one loaded model.
- 16 GB: one active 7B-class model; small non-7B residency only after pressure checks.
- OpenClaw never calls Ollama directly for SwarmX video stages.
- Production model changes require local benchmark evidence.
- Cloud routing is disabled by default.
- Production deployment remains human-gated.

## Skill package

`skills/` contains five OpenClaw-ready skills:

- Creative Director
- Virality Critic
- Swarm Doctor
- Vision-Enhanced Storyboard
- Virality Cheatbook Writer

They are deliberately bounded and composable; none can mutate protected SwarmX invariants.


## Benchmark before model promotion

Run the repository-owned baseline:

```bash
pnpm bench:coding-agent --model qwen3:8b --output benchmarks/coding-agent/results/baseline.json
```

The harness uses isolated fixtures and a fixed tool surface. It records pass rate, first-pass rate, tool-call validity, latency and memory pressure. Candidate models must be compared against the same cases and hardware profile.

## Verification

```bash
pnpm validate:openclaw
```

The validator is deliberately static. It does not start Ollama, change concurrency, or mutate production model state.
