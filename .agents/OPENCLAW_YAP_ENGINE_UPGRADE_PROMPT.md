# OpenClaw × The Yap Engine — APEX-21 r1 Production Mission
Revision: 2026-09-26
Canonical directive: docs/OPENCLAW-SWARMXQ-APEX21-DIRECTIVE.md
Authority: live repository contracts > APEX-21 directive > external assumptions
Mode: local-first · fail-closed · evidence-gated · surgical · incremental · cinematic
Hardware: 8 GB CPU-only certification baseline; 16 GB measured profile; Modal GPU burst

## Mission
Execute the canonical APEX-21 Creative Compiler and Production Automation Directive against the live repository. Do not treat this file as a competing architecture; it is the agent entrypoint and must remain synchronized with the canonical directive.

## Non-negotiable invariants
- OpenClaw is the bounded control plane.
- SwarmXQ owns production inference, model lifecycle, RAM pressure, queues, rendering and publishing.
- 8 GB: OLLAMA_NUM_PARALLEL=1, OLLAMA_MAX_LOADED_MODELS=1, OpenClaw maxConcurrent=1, zero keep-alive by default.
- Never create a second ModelOrchestrator or Ollama daemon.
- Never bypass production gates or fabricate evidence.
- Creative DNA → Concept Tournament → SceneSpecV2 → Asset Graph → Audio Timing Spine → Background Budget → Incremental Render Graph → Technical/Visual/Creative QC → bounded revision is the canonical production path.
- Every expensive artifact is content-addressed and invalidated by dependency, not by blanket rerender.
- Modal is remote execution only; current worker target is Wan2.2 5B on L4, min_containers=0, max_containers<=4, with validation and checksum gates.
- External media requires provenance and rights evidence.
- Deterministic FFmpeg/FFprobe checks are authoritative; vision review is advisory.
- One bounded automated revision is the default; persistent failure becomes NEEDS_REVISION/BLOCKED.
- Neon Postgres is the durable external-testing state plane; use the pooled PgBouncer endpoint and never commit credentials.
- Upstash Redis is the remote BullMQ state plane; use TLS and preserve separate Queue/Worker connections.
- Vercel is a thin client only. Do not execute media rendering or local inference in dashboard/serverless request paths.
- AWS Phase-D is S3 jobs/ → asynchronous Lambda dispatcher → isolated Fargate FFmpeg worker → S3 results/. Validate checksum and FFprobe output before acceptance.
- External AI providers are optional, budgeted adapters. Never silently convert a local/free path into paid inference.

## Agent loop
DISCOVER → CONTRACT MAP → PLAN → SURGICAL PATCH → TARGETED TEST → ADVERSARIAL REVIEW → FIX → VERIFY → REPORT.

Use the minimum specialist set needed. Never self-chain indefinitely. Never fabricate test, runtime, benchmark or deployment results.

## Required response header
NEXUS APEX-21
Mission: [current task]
Phase: [Audit | DNA | ConceptTournament | SceneGraph | AssetGraph | TimingSpine | Compose | Render | QC | Revision | Package | Publish | Learn]
Selected specialists: [minimum required]
Resource profile: 8GB CPU-only strict mutex | 16GB measured serialized | Modal burst GPU
Active gates: [Contract | Resource | Provenance | Creative | Technical | Visual | Compliance | Packaging]
Cache/invalidation evidence: [status]
Stop conditions: [blockers]

## Required completion output
### NEXUS
### EXECUTION STATUS
### DECISION LEDGER
### NEXT ACTION

For the complete production rules, workflow, Modal contract, asset-rights policy, BullMQ graph, dashboard requirements, benchmark gate and definition of done, follow docs/OPENCLAW-SWARMXQ-APEX21-DIRECTIVE.md.
