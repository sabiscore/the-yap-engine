# Creative Hub Release-Gate Checklist

Status: NOT CERTIFIED
Evidence mode: exact-head, source-backed, fail-closed

## Gate 1 — Exact-head CI
- [x] Final hardening SHA has a completed GitHub Actions CI run.
- [x] CI conclusion is `success`.
- [x] Every required quality gate is green.
- Evidence: PR #11 head `4ece05c4ad8c2430b95553c8e878f6b1eb860c29`; CI run `36284792657`.

## Gate 2 — Exact-head Vercel
- [ ] The Vercel production deployment points to the same final SHA.
- [ ] Deployment state is `READY`.
- Evidence: current-head production deployment still requires verification.

## Gate 3 — Local 8 GB validation
Run sequentially on the constrained Windows host:
```text
pnpm install --frozen-lockfile
pnpm --filter @swarmx/types typecheck
pnpm --filter @swarmx/api typecheck
pnpm --filter @swarmx/api test
pnpm --filter @swarmx/dashboard typecheck
pnpm --filter @swarmx/dashboard build
```
- [ ] All commands complete without OOM or unresolved-host failures.
- Evidence: captured stdout/stderr from the operator machine.

## Gate 4 — AWS Phase-D
- [x] AWS identity verified: account `806168460069`.
- [x] Exact-head CDK build+synth is green in CI run `36284792657`.
- [x] CDK source declares private isolated Fargate subnets with `assignPublicIp=DISABLED`.
- [x] S3, ECR API/Docker and CloudWatch Logs VPC endpoints are declared.
- [x] Dispatcher claims each manifest with an S3 conditional lock.
- [x] Dispatcher uses bounded jitter and emits a terminal unrecoverable marker.
- [x] Render worker produces FFprobe + SHA-256 evidence.
- [x] EventBridge observes terminal result evidence.
- [x] Callback authenticates and upserts `render_jobs` idempotently.
- [ ] CDK environment bootstrapped in `us-east-1`.
- [ ] Phase-D CloudFormation stack deployed.
- [ ] A real end-to-end render proves the complete path.
- [ ] `SWARMX_AWS_RENDER_ENABLED=0` remains in force until all evidence exists.

AWS execution evidence captured 2026-09-27:
- STS identity: account `806168460069`, ARN `arn:aws:iam::806168460069:root`.
- `DescribeStacks` in `us-east-1`: no stacks.
- `DescribeStacks(CDKToolkit)`: stack does not exist.
- `ListClusters`: zero ECS clusters.
- Therefore no AWS Phase-D deployment or E2E render has been performed.

Operator deployment sequence:
```powershell
cd infra/aws-render-cdk
pnpm install --no-frozen-lockfile
$env:AWS_REGION="us-east-1"
$env:AWS_ACCOUNT_ID="806168460069"
$env:SWARMX_AWS_RENDER_ENABLED="0"
$env:API_WEBHOOK_URL="<PUBLIC_FASTIFY_RENDER_CALLBACK_URL>"
$env:SWARMX_RENDER_CALLBACK_SECRET="<RANDOM_CALLBACK_SECRET>"

pnpm exec cdk bootstrap aws://806168460069/us-east-1
pnpm run build
pnpm exec cdk synth
pnpm exec cdk deploy --require-approval broadening
```

After deployment, record `RenderBucketName`, `RenderClusterArn`, `RenderTaskDefinitionArn`, and `RenderDispatcherName`. Do not enable `SWARMX_AWS_RENDER_ENABLED` until the manifest → S3 → dispatcher → Fargate → result evidence → EventBridge → callback → Neon `render_jobs` E2E test passes.

## Gate 5 — TikTok controlled verification
- [ ] Real operator developer app has `video.publish` approved.
- [ ] Real operator account completes OAuth callback.
- [ ] Durable `tiktok_accounts` row is `active`.
- [ ] Creator Info reports `SELF_ONLY` availability.
- [ ] Direct Post uses `is_aigc=true`.
- [ ] Upload succeeds.
- [ ] `status/fetch` reaches provider terminal `PUBLISH_COMPLETE`.
- [ ] The same durable row becomes `controlled_verified`.
- [ ] No secret/token appears in evidence.
- [ ] Public-post flag remains `0`.

## Gate 6 — Empirical monetization
- [x] Production schema contains observed engagement, attribution and cost fields.
- [x] No synthetic rows have been inserted in the audited baseline.
- [x] Production observation count is reported honestly.
- [ ] Real publish/performance/revenue sources populate observations when available.
- [x] No RPM constant is introduced.

Audited baseline: `tiktok_accounts = 0`; `monetization_observations = 0`.

## Gate 7 — UI compliance
- [x] Canonical Nocturne v2 tokens only.
- [x] No legacy palette values remain in the audited UI.
- [x] iPhone-class safe-area handling is present.
- [x] User zoom is not disabled solely for layout.
- [x] Publish blockers identify their actual source gate.
- [x] Monetization has explicit no-data state.
- [ ] A real iPhone 14 Pro Max viewport audit is captured.

## Merge rule

Do not merge the release branch until every checked item has attached evidence. "Implemented" never substitutes for "verified".

## Current blockers

1. Exact-head Vercel production READY evidence for `4ece05c4ad8c2430b95553c8e878f6b1eb860c29` is absent.
2. Local 8 GB Windows execution has not been observed from this environment.
3. AWS CDK environment is not bootstrapped; no Phase-D stack or E2E render exists.
4. TikTok controlled verification requires a human operator and a real account.
5. Production monetization observations are currently zero.
6. iPhone 14 Pro Max empirical browser evidence is not available in the current execution environment.

## Audit snapshot — 2026-09-27

- PR #11 exact head: `4ece05c4ad8c2430b95553c8e878f6b1eb860c29`.
- Exact-head canonical CI run: `36284792657`, completed `success`.
- AWS account: `806168460069`, region `us-east-1`.
- CloudFormation stacks: none.
- CDK bootstrap stack `CDKToolkit`: absent.
- ECS clusters: none.
- Production baseline: `tiktok_accounts = 0`, `monetization_observations = 0`.
- AWS and TikTok remain fail-closed.
