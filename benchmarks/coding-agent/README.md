# SwarmXQ Local Coding-Agent Benchmark

A deterministic, repository-independent harness for comparing Ollama coding-agent models under the same tool contract.

## Goals

Measure **agent utility**, not just model generation quality:

- task pass rate;
- first-pass task completion;
- structured tool-call validity;
- tool errors/retries;
- validation failures;
- wall-clock latency;
- generated token count when Ollama reports it;
- minimum host `MemAvailable`;
- maximum resident model footprint reported by `/api/ps`;
- model/context/quantization metadata;
- patch size;
- reproducibility metadata.

The harness intentionally exposes a narrow coding-agent tool surface:

1. `list_files`
2. `read_file`
3. `search_repo`
4. `write_file`
5. `run_validation`

It does **not** expose arbitrary shell execution, network access, Git operations, secrets, or production SwarmX APIs.

## Why fixtures instead of production tasks?

The first gate needs a stable baseline. Production repository tasks change as the repository evolves and can mix model quality with repository churn. The fixture suite therefore measures the agent under controlled tasks first.

A later phase may add frozen real-repository tasks with pinned commit SHAs.

## Run

Start the existing Ollama daemon:

```bash
ollama serve
```

Then:

```python
python benchmarks/coding-agent/run.py \
  --model code-qwen25-pro-q5km-prod \
  --base-url http://127.0.0.1:11434 \
  --repeat 1 \
  --output benchmarks/coding-agent/results/latest.json
```

Run one case:

```bash
python benchmarks/coding-agent/run.py --model code-qwen25-pro-q5km-prod --case py-bug-01
```

Compare a candidate against the baseline:

```bash
python benchmarks/coding-agent/run.py --model candidate --output benchmarks/coding-agent/results/candidate.json
python benchmarks/coding-agent/compare.py \
  benchmarks/coding-agent/results/baseline.json \
  benchmarks/coding-agent/results/candidate.json
```

## Promotion gate

A candidate is **not** promoted because it wins one aggregate score.

Minimum gate:

- no invariant/tool-safety violation;
- all required cases pass;
- first-pass rate does not regress;
- malformed tool calls do not increase beyond the configured tolerance;
- minimum available RAM remains above the active SwarmX pressure floor;
- no validation command is bypassed;
- candidate metadata is captured.

The default comparison report is deliberately multi-dimensional. Do not collapse it into a single "model score".

## Reproducibility

Each result records:

- timestamp;
- git HEAD;
- model identifier;
- Ollama endpoint;
- Ollama model metadata from `/api/show`;
- `/api/ps` snapshots;
- host memory observations;
- case IDs;
- prompts;
- tool calls;
- validation output;
- final model response;
- timing.

Do not commit result files containing private repository content. The default results directory is ignored by repository policy when local-only benchmarking is used.

## Hardware profiles

### 8 GB

- one loaded model;
- one inference request at a time;
- short context;
- no persistent vision sidecar.

### 16 GB

- one active 7B-class inference;
- optional bounded residency only when the existing SwarmX governor permits it;
- no concurrent benchmark cases.

The harness itself never changes Ollama concurrency settings.
