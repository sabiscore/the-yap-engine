# CI Release-Risk Register

## Scope

This register records the remaining release risks observed during the PR #10 production-readiness audit at commit `b9d41c314bc2004f72a1411d3750975b83b1d168`.

## Evidence

| Surface | Evidence | State |
|---|---|---|
| Vercel exact-head build | Deployment `dpl_8FLiHCCLjaC2u3wJM5Zowk2KdDhx` for the exact head | READY |
| GitHub combined status | Exact head reports Vercel `success` | PASS |
| GitHub Actions exact-head lookup | Connector returned no workflow runs for the exact SHA | **VERIFICATION GAP** |
| Vercel runtime errors | No runtime error clusters in the selected 7-day window | PASS |
| TikTok external verification | No live controlled-account run has been executed from this environment | **PENDING OPERATOR** |

The GitHub Actions connector currently filters commit workflow results to pull-request-triggered runs. An empty result is therefore not evidence that Actions did not execute; it is an evidence-availability gap.

## CI coverage audit

The canonical CI workflow covers:

- frozen-lockfile installation;
- shared types build/typecheck;
- API and dashboard typecheck;
- dashboard and API Vitest suites;
- real BullMQ + Redis integration;
- API regression and Creative Factory invariants;
- console/process-environment/public-token invariants;
- Next.js build and route-count assertion.

### Remaining gap addressed by this audit

The dashboard exposes an ESLint script, but the CI workflow did not execute it. A dedicated dashboard lint gate is now required before release so TypeScript/build success cannot mask static-analysis regressions.

### Deliberate non-CI boundary

Live TikTok publication is not a CI test. It requires real TikTok developer approval, OAuth authorization, a controlled creator account, real media, and provider-side processing. The repository therefore keeps a deterministic protocol test suite and a separate operator runbook.

## Release evidence standard

A production promotion record should include:

1. exact commit SHA;
2. GitHub Actions run URL/number, when available;
3. Vercel deployment ID and READY state;
4. production benchmark result;
5. TikTok controlled-verification result, if Direct Post is being promoted;
6. Neon migration/schema verification;
7. operator approval for any public-post enablement.

Never infer an external provider success from unit tests, mocks, or a successful Vercel build.
