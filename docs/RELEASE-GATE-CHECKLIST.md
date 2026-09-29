# Creative Hub Release-Gate Checklist

Status: **HOLD — awaiting external evidence gates**
Evidence mode: exact-head, source-backed, fail-closed

## Gate 1 — Exact-head CI
- [x] Current PR #11 head has a completed GitHub Actions run.
- [x] `Quality Gates` completed `success`.
- [x] `Windows 8GB Compatibility` completed `success`.
- [x] AWS Phase-D CDK build/synth gate passed in the certified CI sequence.

Latest completed CI evidence before the final documentation/UI polish: run `36315946735`.
The final documentation/UI commit has a newer SHA and therefore requires its own completed CI result. Historical green runs must not be treated as exact-head evidence.

## Historical CI / Vercel finding — PR #10 `f45042b`

PR #10 is already merged. Its commit `f45042b287e5c684983bfdf1d8e1aa7253c1d35b` is historical evidence, not an actionable branch head.

- GitHub Actions run `36256308914`: failed during `Setup pnpm`.
- Production video benchmark run `36256308907`: failed during `Setup pnpm`.
- Vercel deployment `dpl_3KNTLPcPVwMR9cckfU7sAdTTbr1G`: `ERROR`, code `lint_or_type_error`.
- Vercel reported the API build command exited with code `2`.

Do not rewrite or retest the merged commit as though it were the current release head. The certification target is the open PR #11 branch.

## Gate 2 — Exact-head Vercel

Verified deployment baseline currently on `main`: Vercel deployment `dpl_FczEzdqMHVyyRzQCpMjRYkgCu9aw`, state `READY`, SHA `25e38a342f8fc94bd67fc2400a5f6d26893c3489`. This is deployment evidence for that SHA only; every new commit requires a new exact-head deployment.
- [ ] Current PR #11 head has a Vercel deployment.
- [ ] Current deployment state is `READY`.
- [ ] Deployment commit SHA exactly matches the release SHA.

Current evidence: rapid successive commits on the hardening branch have caused superseded Vercel builds to be canceled. Only a `READY` deployment whose commit SHA exactly matches the final branch HEAD counts for this gate.

## Gate 3 — Local 8 GB Windows / WSL2

Required operator evidence:

```text
pnpm install --frozen-lockfile
pnpm --filter @swarmx/types typecheck
pnpm --filter @swarmx/api typecheck
pnpm --filter @swarmx/api test
pnpm --filter @swarmx/dashboard typecheck
pnpm --filter @swarmx/dashboard build
pnpm --filter @swarmx/api run test:video:smoke
```

Also capture effective runtime controls:

```text
SWARMX_HOST_PROFILE=constrained_cpu_8gb
SWARMX_PHASE_ABC_EXECUTION=local
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
SWARMX_VIDEO_MAX_CONCURRENT_JOBS=1
```

- [ ] Commands complete without OOM.
- [ ] FFmpeg and FFprobe resolve inside WSL2.
- [ ] At least one real local MP4 is produced and FFprobe-valid.
- [ ] No TikTok credentials or approval are required by the generation path.

Repository-level audit confirms single-job/single-model safeguards and low-RAM model selection. Physical-machine memory/OOM evidence is still operator-owned.

## Gate 4 — Hybrid stack

```text
Next.js dashboard -> Fastify API -> BullMQ worker -> local/optional render backend
                                  |-> Neon PostgreSQL
                                  |-> Redis / Upstash
                                  |-> optional TikTok publisher
                                  |-> optional AWS Phase-D
```

The repository has no `apps/scraper` or Crawlee ingestion service. The relevant Node worker is the BullMQ video worker.

FastAPI is auxiliary: local Kokoro TTS and the optional Modal renderer. Fastify is the primary API server.

## Gate 5 — AWS Phase-D
- [x] AWS identity previously verified: account `806168460069`.
- [x] CDK source and synthesis gate covered in CI.
- [ ] AWS CDK environment bootstrapped.
- [ ] Phase-D CloudFormation/ECS resources deployed.
- [ ] Real manifest -> object store -> dispatcher -> worker -> evidence -> callback -> Neon render job E2E tested.
- [ ] `SWARMX_AWS_RENDER_ENABLED=0` remains in force until the E2E gate passes.

No AWS deployment evidence is currently asserted.

## Gate 6 — TikTok controlled verification

Required before production Direct Post promotion:

- [ ] Application approved for `video.publish`.
- [ ] Real OAuth callback creates a durable `tiktok_accounts` row in `active` state.
- [ ] Creator Info returns `SELF_ONLY` as an available privacy option.
- [ ] Controlled Direct Post initialization uses `video.publish`.
- [ ] `is_aigc=true` is sent for the controlled test.
- [x] FILE_UPLOAD uses sequential bounded `Content-Range` chunks; regression coverage locks TikTok's floor-count/final-chunk rule.
- [ ] Terminal provider status is successful.
- [ ] Only the real verified row is promoted to `controlled_verified`.
- [ ] `SWARMX_TIKTOK_PUBLIC_POSTS_ENABLED=0` remains set during controlled verification.

TikTok's current documentation states that Direct Post uses `video.publish`; creator information must be queried first; Direct Post initialization is limited to six requests/minute per user access token; and unaudited clients are restricted to private viewing.

## Gate 7 — Empirical monetization
- [x] Observation schema includes cost/revenue/engagement/attribution fields.
- [x] Contribution margin is based on observed revenue minus recorded direct costs.
- [x] No RPM/CPM constant is used as observed performance.
- [ ] Real publish/analytics/revenue observations exist.

Current audited baseline remains zero observed monetization data until real sources populate the table.

## Gate 8 — UI / mobile
- [x] Obsidian Nocturne v2 tokens are centralized.
- [x] Safe-area handling exists.
- [x] User zoom is not disabled solely for layout.
- [x] Creative Hub exposes distinct state badges.
- [x] Run-row interaction has a mobile-friendly touch target.
- [ ] Real iPhone-class viewport evidence captured.

## Gate 9 — Automated release-gate tests

- [x] TikTok protocol regression covers `SELF_ONLY`, `is_aigc=true`, sequential FILE_UPLOAD and terminal status polling.
- [x] 8 GB operator profiling runbook added.
- [ ] Final readiness branch has fresh exact-head CI and Vercel evidence.

## Local-generation independence invariant

The generation route must never gate on:

```text
SWARMX_TIKTOK_API_APPROVED
getTikTokPublishingReadiness
getVideoPublisher
enqueueTikTokDirectPost
tiktokAccountId
```

The video regression suite now checks this boundary structurally.

## Merge rule

Do not merge the release branch until every checked item has attached evidence. Implemented, tested or synthesized infrastructure is not equivalent to deployed or verified production behavior.

## Current blockers

1. Exact-head Vercel `READY` evidence is pending for the final readiness branch SHA.
2. Local 8 GB physical-machine render evidence is pending.
3. AWS Phase-D deployment/E2E evidence is pending.
4. TikTok controlled verification requires a human-operated real account.
5. Production monetization observations remain zero until real data arrives.
6. Physical iPhone viewport evidence is pending.
7. Final readiness branch requires a fresh exact-head CI + Vercel certification after these changes.