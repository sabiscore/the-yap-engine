# Creative Hub v3

## What it is

The Creative Hub is the existing `apps/swarmx-dashboard` experience for creating, monitoring, reviewing and operating video jobs. It remains a thin operator UI over Fastify, BullMQ/Redis and the local render stack. No second dashboard or parallel design system is introduced.

## Quick start

1. Copy `env.example` to `env.local`.
2. Set `SWARMX_VIDEO_API_TOKEN` and `SWARMX_DASHBOARD_ACCESS_TOKEN` with random 32-byte hex values.
3. Run the 8 GB compose profile from the repository root.
4. Open the dashboard and sign in with the dashboard access token.

The production proxy rejects loopback targets, anonymous protected writes, disallowed paths and cross-origin writes. The PTY WebSocket rewrite exists only in non-production builds.

## Blueprint

Browser → Next proxy (auth, CSRF origin check, route allowlist, timeout, request ID) → Fastify 5 → BullMQ/Redis → worker → Ollama/Kokoro/FFmpeg. Durable job/evidence state is owned by the API/data layer. Per-job SSE owns stage progress; global SSE owns telemetry. Terminal access is development-only.

## ADRs

| ADR | Context | Decision | Options considered | Consequences |
|---|---|---|---|---|
| 001 | Certified evidence is SHA-specific and platforms have drifted | Work on `feat/creative-hub-v3`; preview/local only until release owner freezes a SHA | Direct main work; feature branch | New commits do not masquerade as certified evidence |
| 002 | Proxy previously injected a server token for anonymous browser writes | Require a server-configured dashboard access token in production, stored as an HttpOnly SameSite cookie; bind writes to configured origin and rate-limit by IP | Vercel Deployment Protection only; Neon Auth migration | Adds a small operator login gate without exposing the API token |
| 003 | Realtime updates must not create polling storms | Keep SSE; health remains bounded shallow/deep HTTP checks with client reconnect | WebSocket everywhere; polling | Simpler failure semantics and bounded resource use |
| 004 | Existing primitives were below 44 px | Enforce 44 px touch targets in primitives and coarse-pointer CSS | Per-call-site classes; width-only media query | One fix reaches existing call sites |
| 005 | Status colour alone is inaccessible | Use glyph + colour + text in a shared StateBadge contract | Colour-only badges | State remains understandable without colour |
| 006 | Certification labels cannot be inferred from static copy | Gate status must carry timestamp, SHA and evidence URL; stale/mismatched rows are not green | Static “certified” copy | The UI cannot manufacture release evidence |

## Design-system catalog

- **Button / TabsTrigger:** 44 px mobile baseline; 2 px focus ring with offset.
- **StateBadge:** canonical workflow state + glyph + text. No colour-only semantics.
- **Pipeline Pulse:** stage rail driven by `@swarmx/types`; no invented stages.
- **Resource Budget Ring:** literal host profile, queue depth and one-model/one-job constraint.
- **Provenance Strip:** source, provenance, `is_aigc: true`, privacy target.
- **Empirical Ledger:** observed cost/revenue/margin only; empty when unobserved.
- **Signal Estimate:** heuristic planning signal; always labelled “not measured”.
- **ConnectionBanner / RouteDegradedBanner:** distinguish offline, 503, 502 and 504 without blanking the shell.

## UX copy

Use sentence case, technical language and verb-led CTAs. Use **job**, **stage**, **render**, **signal estimate**, **provenance** and **queue** consistently. Never turn a heuristic into a measured outcome.

Required degraded messages:
- 503: service did not initialise; include request ID and System → Health guidance.
- 504: request timed out; explicitly warn that the operation may have completed and instruct the operator to check the queue.
- 502: upstream unreachable; preserve a usable shell.
- Offline: identify network loss without blaming the API.

## Accessibility

See `docs/accessibility/creative-hub-audit.md`. The audit is evidence-oriented: automated checks plus keyboard and VoiceOver procedures. Physical VoiceOver and iPhone execution remain operator evidence.

## Mobile QA

Test iPhone 14 Pro Max and a 320 px viewport. Verify:
- no horizontal page scroll;
- safe-area insets on all four sides;
- 44 px controls;
- 16 px minimum input text;
- bottom navigation remains reachable;
- sheets trap and restore focus;
- stage announcements are coalesced and polite;
- reduced-motion removes pulse/glow animation.

## Troubleshooting

| Symptom | Action |
|---|---|
| 503 / `api_not_configured` | Set a non-loopback `SWARMX_API_URL` in non-local deployment; check System → Health |
| 401 protected action | Sign in with `SWARMX_DASHBOARD_ACCESS_TOKEN` |
| 502 | Check Fastify health and container logs; use the request ID |
| 504 | Inspect queue before retrying |
| Ollama OOM | Use the 8 GB override; one model and one job only |
| SSE disconnect | Check proxy/serverless duration and reconnect state |
| Fonts falling back | Confirm self-hosted font assets are present; current branch still requires font-loading evidence |
| WSL2 ceiling | Apply `docs/WINDOWS-WSL-PROFILES.md`, then run the profiling runbook |

## Release evidence

`docs/release-gates.json` defines the evidence shape. The file is a schema/template, not a claim that gates passed. The release board must use the exact SHA and UTC timestamp supplied by the executor.
