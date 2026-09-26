# APEX-21 External State & Burst Rendering Setup

## NEXUS APEX-21

**Purpose:** connect the local-first Yap Engine to managed state and an asynchronous cloud render boundary without moving production authority out of SwarmXQ.

### 1. Neon Postgres

Target project: `orange-shape-10519833`  
Target branch: `production`

Run from the repository root after authenticating the Neon CLI:

```bash
npm i -g neon@latest
neon auth
neon skills -y
neon mcp -y
neon link --project-id orange-shape-10519833 --branch production -y
neon config init
neon deploy
neon env pull --service postgres
```

The repository intentionally does **not** commit credentials. `.neon`, `.env`, and `.env.local` remain local-only.

Use the pooled Neon connection for application traffic. Neon exposes PgBouncer-backed pooled endpoints; use the unpooled endpoint only for operations that explicitly require a direct connection. citeturn0search6turn0search9

Required application variable:

```dotenv
DATABASE_URL=postgres://...-pooler....neon.tech/...
```

Optional direct/admin variable:

```dotenv
DATABASE_URL_UNPOOLED=postgres://....neon.tech/...
```

Do not paste either value into GitHub, frontend code, browser-visible environment variables, or job payloads.

### 2. Upstash Redis / BullMQ

For external testing, provision one Upstash Redis database and set:

```dotenv
REDIS_URL=rediss://:<password>@<endpoint>:6379
SWARMX_REDIS_PROVIDER=upstash
SWARMX_VIDEO_USE_BULLMQ=1
```

The existing BullMQ implementation already accepts a Redis URL and keeps Queue/Worker connections separate. Upstash documents direct BullMQ compatibility over TLS. citeturn0search13

The current Upstash Free tier is suitable for low-volume external testing, not an unbounded production workload: 256 MB data, 500K commands/month and 10 GB monthly bandwidth. citeturn0search8

### 3. Vercel

The dashboard is a thin client. It should call the Fastify API through its existing proxy surface and never execute video composition, Ollama, FFmpeg or GPU inference.

Current Vercel documentation no longer describes a 10-second Hobby ceiling. Hobby Functions have a documented 300-second default/max duration; longer Fluid Compute limits are available on higher plans. The architecture still deliberately keeps rendering asynchronous. citeturn0search3turn0search0

Set only server-side variables in Vercel:

```dotenv
SWARMX_API_URL=https://<api-host>
NEXT_PUBLIC_SWARMX_VERSION=2026.6.0
```

Never expose `DATABASE_URL`, `REDIS_URL`, `FAL_KEY`, AWS credentials, Modal tokens or publisher secrets through `NEXT_PUBLIC_*`.

### 4. AWS Phase-D handoff

The CDK app under `infra/aws-render-cdk/` provisions:

```
S3 jobs/ object
      │
      ▼
S3 notification
      │
      ▼
Lambda dispatcher
      │
      ▼
ECS RunTask
      │
      ▼
Fargate render worker
      │
      ▼
S3 results/
```

The Lambda never renders media. It only validates the event and starts an isolated Fargate task. Fargate is configured as 1 vCPU / 4 GiB by default, a valid Fargate size, and can be increased only after measured workload evidence. citeturn3search0

Deploy:

```bash
cd infra/aws-render-cdk
npm install
npx cdk bootstrap
npx cdk synth
npx cdk deploy --require-approval broadening
```

The stack outputs the input bucket and ECS cluster/task identifiers.

Upload a render manifest to:

```
s3://<input-bucket>/jobs/<job-id>.json
```

The manifest contract is deliberately explicit:

```json
{
  "version": 1,
  "jobId": "job-123",
  "outputKey": "results/job-123/final.mp4",
  "inputs": [
    { "key": "assets/job-123/scene-01.mp4", "name": "scene-01.mp4" }
  ],
  "ffmpegArgs": [
    "-hide_banner",
    "-y",
    "-i",
    "{{input:scene-01.mp4}}",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "{{output}}"
  ]
}
```

The worker does not execute a shell command. It resolves only declared S3 inputs and the fixed output placeholder, then invokes FFmpeg as an argument vector. Invalid manifests fail closed.

### 5. External AI providers

External generation remains opt-in and budgeted.

- `fal.ai`: server-side API key only; use queued/asynchronous endpoints for long-running generation. Current fal documentation uses `@fal-ai/client` and recommends queue/webhook patterns for long-running jobs. citeturn4search0turn4search1
- Pollinations: treat current public/community availability as opportunistic, not as a guaranteed free production dependency.
- Hugging Face: use hosted inference/Spaces only when the current model/license/quota is explicitly recorded.
- Local Ollama + Kokoro remain the default path.

No provider may silently convert a free/local job into paid cloud inference.

### 6. Rollout order

1. Local 8 GB certification.
2. Neon `production` branch link + env pull.
3. Upstash BullMQ connectivity test.
4. Vercel preview deployment.
5. AWS CDK synth.
6. AWS deployment with a dedicated test account/budget.
7. Upload one render manifest.
8. Validate Fargate artifact checksum + FFprobe contract.
9. Enable remote Phase-D handoff only after the above evidence exists.

### 7. Fail-closed conditions

Block the handoff when:

- `DATABASE_URL` is missing or malformed;
- Redis TLS/authentication fails;
- S3 manifest checksum/schema is invalid;
- AWS task definition is unavailable;
- render manifest contains undeclared file paths;
- Fargate exits non-zero;
- output checksum or FFprobe validation fails;
- external AI provider budget/credentials are unavailable.

Missing credentials are a blocked capability, never a successful test.

## EXECUTION STATUS

The repository contains the declarative Neon entrypoint, external-state runbook and AWS CDK boundary. Actual account linking/deployment requires authenticated Neon/AWS/Vercel credentials in the operator environment.
