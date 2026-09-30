# Creative Hub v3

## What it is

The Creative Hub is the existing apps/swarmx-dashboard experience for creating, monitoring, reviewing and operating video jobs. It remains a thin operator UI over Fastify, BullMQ/Redis and the local render stack. No second dashboard or parallel design system is introduced.

## Quick start

1. Copy env.example to env.local.
2. Set SWARMX_VIDEO_API_TOKEN and SWARMX_DASHBOARD_ACCESS_TOKEN with random 32-byte hex values.
3. Run the 8 GB compose profile from the repository root.
4. Open the dashboard and sign in with the dashboard access token.

The production proxy rejects loopback targets, anonymous protected writes, disallowed paths and cross-origin writes. The PTY WebSocket rewrite exists only in non-production builds.

## Blueprint

Browser → Next proxy (auth, CSRF origin check, route allowlist, timeout, request ID) → Fastify 5 → BullMQ/Redis → worker → Ollama/Kokoro/FFmpeg. Durable job/evidence state is owned by the API/data layer. Per-job SSE owns stage progress; global SSE owns telemetry. Terminal access is development-only.

## ADRs

| ADR | Context | Decision | Options considered | Consequences |
|---|---|---|---|---|
| 001 | Certified evidence is SHA-specific and platforms have drifted | Work on feat/creative-hub-v3; preview/local only until release owner freezes a SHA | Direct main work; feature branch | New commits do not masquerade as certified evidence |
| 002 | Proxy previously injected a server token for anonymous browser writes | Require a server-configured dashboard access token in production, stored as an HttpOnly SameSite cookie; bind writes to configured origin and rate-limit by IP | Vercel Deployment Protection only; Neon Auth migration | Adds a small operator login gate without exposing the API token |
| 003 | Realtime updates must not create polling storms | Keep SSE; health remains bounded shallow/deep HTTP checks with client reconnect | WebSocket everywhere; polling | Simpler failure semantics and bounded resource use |
| 004 | Existing primitives were below 44 px | Enforce 44 px touch targets in primitives and coarse-pointer CSS | Per-call-site classes; width-only media query | One fix reaches existing call sites |
| 005 | Status colour alone is inaccessible | Use glyph + colour + text in a shared StateBadge contract | Colour-only badges | State remains understandable without colour |
| 006 | Certification labels cannot be inferred from static copy | Gate status must carry timestamp, SHA and evidence URL; stale/mismatched rows are not green | Static certified copy | The UI cannot manufacture release evidence |

## Design-system catalog

- Button / TabsTrigger: 44 px mobile baseline; 2 px focus ring with offset.
- StateBadge: canonical workflow state + glyph + text. No colour-only semantics.
- Pipeline Pulse: stage rail driven by the package workflow types; no invented stages.
- Resource Budget Ring: literal host profile, queue depth and one-model/one-job constraint.
- Provenance Strip: source, provenance, is_aigc: true, privacy target.
- Empirical Ledger: observed cost/revenue/margin only; empty when unobserved.
- Signal Estimate: heuristic planning signal; always labelled not measured.
- ConnectionBanner / RouteDegradedBanner: distinguish offline, 503, 502 and 504 without blanking the shell.

## UX copy

Use sentence case, technical language and verb-led CTAs. Use job, stage, render, signal estimate, provenance and queue consistently. Never turn a heuristic into a measured outcome.

## Accessibility and mobile QA

See docs/accessibility/creative-hub-audit.md. Test iPhone 14 Pro Max and a 320 px viewport. Verify no horizontal page scroll, four-sided safe areas, 44 px controls, 16 px minimum input text, sheet focus management, coalesced stage announcements and reduced-motion behaviour.

## Troubleshooting

| Symptom | Action |
|---|---|
| 503 / api_not_configured | Set a non-loopback SWARMX_API_URL in non-local deployment; check System → Health |
| 401 protected action | Sign in with SWARMX_DASHBOARD_ACCESS_TOKEN |
| 502 | Check Fastify health and container logs; use the request ID |
| 504 | Inspect queue before retrying |
| Ollama OOM | Use the 8 GB override; one model and one job only |
| SSE disconnect | Check proxy/serverless duration and reconnect state |
| Fonts falling back | Confirm self-hosted font assets are present; font evidence remains open |
| WSL2 ceiling | Apply docs/WINDOWS-WSL-PROFILES.md, then run the profiling runbook |

## Release evidence

docs/release-gates.json defines the evidence shape. It is not a claim that any gate passed. The release board must use the exact SHA and UTC timestamp supplied by the executor.


## Accessibility audit matrix

| Surface | Automated axe gate | Keyboard/manual | VoiceOver/manual | Evidence |
|---|---|---|---|---|
| Buttons / links | Run axe; no critical/serious target-name violations | Tab order, visible 2 px focus ring, Enter/Space activation | Control name, role and state announced | **OPEN — operator run** |
| Tabs | Run axe; no critical/serious violations | Arrow/Home/End follow Radix Tabs behavior; focus remains visible | Tab name + selected state announced | **OPEN — operator run** |
| StateBadge | No color-only status violation | Glyph + text visible at focus/zoom | Glyph is decorative; label is announced | Source contract implemented; **OPEN — operator run** |
| Forms | Label/name/description checks | Error recovery and submit reachable without pointer | Labels, required/error state and validation message announced | **OPEN — operator run** |
| Degraded shell | No empty landmark/heading violations | Offline/503/504 banner reachable and actionable | Error message announced once; recovery action exposed | Source review PASS; **OPEN — operator run** |
| Mobile layout | Axe + viewport smoke | No keyboard trap; sheet/dialog focus returns correctly | Safe-area content remains discoverable | **OPEN — iPhone operator run** |
| Motion | Axe does not certify motion preferences | Reduced-motion disables decorative loops/transitions | No critical information depends on animation | Source review PASS; **OPEN — operator run** |
| Typography | Automated font-family assertion where browser harness exists | 200% zoom without clipping | Font fallback does not change semantic reading order | **OPEN — operator run** |
| Contrast | axe color-contrast rule | Focus ring remains visible against both base and raised surfaces | Same information is available without color | Tokens updated; **OPEN — axe/manual run** |

Required manual evidence: Playwright/WebKit at iPhone 14 Pro Max dimensions, 320 px narrow viewport, keyboard traversal, VoiceOver pass, document.fonts.check() for Space Grotesk and JetBrains Mono, and a captured axe result with timestamp + exact branch SHA.

## Operator release gates

These gates are intentionally not automated or simulated by the coding agent.

### Gate 1 — BullMQ synthetic execution

1. Authenticate to the operator-only dashboard/API.
2. Submit exactly one synthetic render job to the swarmx-video queue with a unique test job ID.
3. Record UTC timestamps for WAITING, ACTIVE, and COMPLETED.
4. Inspect the BullMQ job record and worker telemetry.
5. Required terminal evidence: state sequence is exactly WAITING → ACTIVE → COMPLETED; attemptsMade = 1; configured retries = 0; no duplicate worker execution; output checksum/job ID matches the submitted job.
6. If any retry, duplicate execution, or missing telemetry occurs, leave the release gate OPEN.

### Gate 2 — Pixel-perfect mobile QA

1. Use Playwright with WebKit and an iPhone 14 Pro Max emulation profile.
2. Exercise /, /video, /video/studio, /video/[id], and the primary settings/system surfaces.
3. Repeat at a 320 px wide viewport.
4. Verify document.documentElement.scrollWidth <= document.documentElement.clientWidth; all four safe-area insets; controls at least 44 × 44 CSS px; no keyboard/bottom-nav obstruction; both required fonts pass document.fonts.check(); no horizontal scroll or clipped primary actions; degraded/offline states retain the shell and actionable messaging.
5. Attach screenshots plus test output to the release evidence record.

### Gate 3 — TikTok safety gate

1. Use a dedicated operator-controlled TikTok account and a non-public test asset.
2. Confirm OAuth scopes and account lifecycle are valid for controlled verification.
3. Submit only with privacy_level=SELF_ONLY.
4. Require is_aigc=true.
5. Verify the provider result, post status, and durable evidence record.
6. Confirm no public publication occurred.
7. Any public visibility, missing AI disclosure, or mismatched privacy level is an immediate gate failure.

## Vercel verification note

The live deployment record for `dpl_EeDUdCShry7pjhNbNUuVT3GFRaDd` is READY and is tied to commit `411e34a2dad2e75d73a6046a00087f833615ac20`. The Vercel project is the Fastify API project, not a separate Next.js dashboard project. Direct unauthenticated requests to the deployment currently receive Vercel Authentication HTTP 302 responses, so this verification does not establish application-level 200 responses for `/`, `/health`, or `/api/health`. Vercel runtime-error inspection for the selected 24-hour window returned no runtime errors. Treat dashboard deployment topology and authenticated endpoint smoke tests as separate release evidence.

## Release declaration

Creative Hub v3 remains **HOLD / NOT CERTIFIED** until all three operator gates above have timestamped evidence for the exact release SHA. A READY Vercel deployment or green automated CI does not substitute for BullMQ telemetry, physical-device QA, or TikTok controlled verification.
