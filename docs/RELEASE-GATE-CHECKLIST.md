# Creative Hub Release-Gate Checklist

Status: NOT CERTIFIED
Evidence mode: exact-head, source-backed, fail-closed

## Gate 1 — Exact-head CI
- [ ] Final hardening SHA has a completed GitHub Actions CI run.
- [ ] CI conclusion is `success`.
- [ ] Every required quality gate is green.
- Evidence: populate with the exact Actions run URL and SHA.

## Gate 2 — Exact-head Vercel
- [ ] The Vercel production deployment points to the same final SHA.
- [ ] Deployment state is `READY`.
- Evidence: populate with deployment ID, URL and exact SHA.

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
- [ ] AWS identity verified.
- [ ] `cdk synth` succeeds for the final SHA.
- [ ] Render Fargate tasks are private and have no public IP.
- [ ] S3/ECR/CloudWatch connectivity is via service endpoints.
- [ ] Dispatcher claims each manifest idempotently.
- [ ] Dispatcher uses bounded jitter and emits a terminal unrecoverable marker.
- [ ] Render worker produces FFprobe + SHA-256 evidence.
- [ ] EventBridge observes terminal result evidence.
- [ ] Callback authenticates and upserts `render_jobs` idempotently.
- [ ] A real end-to-end render proves the complete path.
- [ ] `SWARMX_AWS_RENDER_ENABLED=0` remains in force until all evidence exists.

## Gate 5 — TikTok controlled verification
- [ ] Real operator developer app has `video.publish` approved.
- [ ] Real operator account completes OAuth callback.
- [ ] Durable `tiktok_accounts` row is `active`.
- [ ] Creator Info reports `SELF_ONLY` availability.
- [ ] Direct Post uses `is_aigc=true`.
- [ ] Upload succeeds.
- [ ] `status/fetch` reaches a terminal published state.
- [ ] The same durable row becomes `controlled_verified`.
- [ ] No secret/token appears in evidence.
- [ ] Public-post flag remains `0`.

## Gate 6 — Empirical monetization
- [ ] Production schema contains observed engagement, attribution and cost fields.
- [ ] No synthetic rows have been inserted.
- [ ] Production observation count is reported honestly.
- [ ] Real publish/performance/revenue sources populate observations when available.
- [ ] No RPM constant is introduced.

## Gate 7 — UI compliance
- [ ] Canonical Nocturne v2 tokens only.
- [ ] No legacy palette values remain.
- [ ] iPhone-class safe-area handling is present.
- [ ] User zoom is not disabled solely for layout.
- [ ] RUNNING / QC_FAILED / NEEDS_REVISION / REVIEW_REQUIRED / READY_TO_POST are visually distinct.
- [ ] Publish blockers identify their actual source gate.
- [ ] Monetization has explicit no-data state.
- [ ] A real iPhone 14 Pro Max viewport audit is captured.

## Merge rule

Do not merge the release branch until every checked item has attached evidence. "Implemented" never substitutes for "verified".

## Current known blockers

1. Exact-head CI is currently failing; no green run has been recorded for the final hardening SHA.
2. Exact-head Vercel production READY evidence for the final hardening SHA is absent.
3. Local 8 GB Windows execution has not been observed from this environment.
4. AWS full E2E render evidence is absent.
5. TikTok controlled verification requires a human operator and a real account; production currently has no `controlled_verified` account.
6. Production monetization observations are currently zero.
7. iPhone 14 Pro Max empirical browser evidence is not available in the current execution environment.
