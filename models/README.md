# SwarmXQ APEX Local Model Registry

The authoritative model contract is `packages/swarmx-types/src/operator-map.ts`.
Ollama tags are resolved through `resolveCanonicalTag()` before registry use,
logging, or API output.

`models/Modelfiles/primary/` contains the production Modelfile templates used by
the local CPU runtime. `models/Modelfiles/variants/` contains development-only
or experiment templates and is not a replacement for the canonical registry.

## Canonical APEX Operators

| Operator | Ollama tag | Primary role |
|---|---|---|
| Relay | `route-phi4-lite-q4km-prod` | Pre-pipeline routing |
| Pilot | `instruct-phi4-pro-q8-prod` | Intent classification and captions |
| Pilot lite | `instruct-phi4-lite-q4km-prod` | Low-RAM text fallback |
| Architect | `plan-qwen25-pro-q5km-prod` | Planning, scripting, storyboard |
| Architect deep | `plan-deepseekr1-pro-q5km-prod` | Deep planning fallback |
| Oracle | `reason-deepseekr1-pro-q5km-prod` | Virality scoring |
| Forge | `code-qwen25-pro-q5km-prod` | Agent code generation |
| Auditor | `critique-deepseekr1-pro-q5km-prod` | Agent QA gating |
| Lab | `synth-qwen25-exp-q4km-dev` | Meta-evolution, dev only |

## Registering Primary Modelfiles

The GGUF paths referenced by each Modelfile must exist on the host. Register the
canonical tags with Ollama from the repository root:

```bash
ollama create route-phi4-lite-q4km-prod \
  -f models/Modelfiles/primary/route-phi4-lite-q4km-prod.modelfile
ollama create instruct-phi4-pro-q8-prod \
  -f models/Modelfiles/primary/instruct-phi4-pro-q8-prod.modelfile
ollama create instruct-phi4-lite-q4km-prod \
  -f models/Modelfiles/primary/instruct-phi4-lite-q4km-prod.modelfile
ollama create plan-qwen25-pro-q5km-prod \
  -f models/Modelfiles/primary/plan-qwen25-pro-q5km-prod.modelfile
ollama create plan-deepseekr1-pro-q5km-prod \
  -f models/Modelfiles/primary/plan-deepseekr1-pro-q5km-prod.modelfile
ollama create reason-deepseekr1-pro-q5km-prod \
  -f models/Modelfiles/primary/reason-deepseekr1-pro-q5km-prod.modelfile
ollama create code-qwen25-pro-q5km-prod \
  -f models/Modelfiles/primary/code-qwen25-pro-q5km-prod.modelfile
ollama create critique-deepseekr1-pro-q5km-prod \
  -f models/Modelfiles/primary/critique-deepseekr1-pro-q5km-prod.modelfile
```

Validate the non-mutating registry and Modelfile contract with:

```bash
pnpm --filter @swarmx/api run test:models
```

## Runtime Controls

This repository targets the HP EliteBook 850 G3 CPU-only profile. Keep these
settings unless hardware changes and the release verifier is updated with
evidence:

```bash
export OLLAMA_MAX_LOADED_MODELS=2
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_KEEP_ALIVE=0
```

Only one 7B-class operator may be inference-active at a time. The second loaded
slot is reserved for the smaller Pilot/Relay class model residency, not
parallel 7B inference.


---

## OpenClaw Integration Policy

OpenClaw is an outer control plane for chat-driven missions and bounded coding/research work. It shares the local Ollama endpoint but **does not own model lifecycle**. SwarmXQ's `ModelOrchestrator`, pressure governor and execution gates remain authoritative.

Canonical local endpoint:

```bash
SWARMX_OLLAMA_URL=http://127.0.0.1:11434
SWARMX_API_URL=http://127.0.0.1:3001
OLLAMA_NUM_PARALLEL=1
```

Do not hard-code competing `OLLAMA_MAX_LOADED_MODELS` or keep-alive policies in OpenClaw; the existing host profile/governor owns them.

### Quantization admission

Representative llama.cpp 7–8B footprints are approximately:
- Q4_K_M: ~4.9 bpw / ~4.6 GiB;
- Q5_K_M: ~5.7 bpw / ~5.3 GiB;
- Q6_K: ~6.56 bpw / ~6.1 GiB;
- Q8_0: ~8.5 bpw / ~8.0 GiB;
- IQ4_XS: ~4.25 bpw.

Use Q4_K_M as the compact baseline and Q5_K_M/Q6_K for quality-sensitive coding/reasoning when measured headroom permits. Importance-matrix calibration is required for quality-sensitive IQ candidates.

Do not publish universal percentage-of-quality claims for quantization. Evaluate quality loss on the Yap Engine task set.

### MoE warning

MoE active parameters do not equal resident weight memory. Large-total-parameter candidates such as Qwen3-Coder-Next or Gemma 4 26B A4B remain experimental until the complete GGUF/runtime footprint is measured on the target host with KV-cache and pressure headroom.

### Vision policy

Vision is serialized with heavyweight text inference on the CPU-only baseline. Bound frame count and pixel budget, convert results into structured observations, release the vision model, then resume the next stage. Never create a second resident model lifecycle.

Promotion evidence must be local and reproducible; vendor benchmarks alone are insufficient.
