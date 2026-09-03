# The Yap Engine — Brand Migration

## Status

Phase 1 of the product-name transition is active on the feature branch `feat/phase1-2-viral-engine-20260903`.

## Naming contract

**Customer-facing product:** The Yap Engine

**Descriptor during transition:** SwarmXQ Creative Video Factory

**Internal platform/runtime:** SwarmXQ

The migration is intentionally gradual. Runtime package names, environment variables, service identifiers, repository paths, model tags, and API route contracts remain unchanged until a compatibility-preserving migration is separately verified.

## Rules

1. Use **The Yap Engine** for dashboard titles, product copy, onboarding, marketing surfaces, and creator-facing documentation.
2. Use **SwarmXQ** for internal runtime identifiers and compatibility-sensitive infrastructure until a dedicated migration gate passes.
3. During the transition, describe the relationship as **The Yap Engine — powered by SwarmXQ** where technical context is useful.
4. Do not rename environment variables, package names, API routes, model tags, or persisted identifiers as part of a visual-only brand change.
5. Every future migration batch must include a repository search, compatibility assessment, focused tests, and a rollback path.

## Product language

Prefer creator language such as:

- Make a Yap
- Yap ideas
- Build a short
- Hook
- Script
- Visual plan
- Voice
- Captions
- Review
- Export

Avoid exposing infrastructure terminology such as swarm, agents, orchestration, or model routing in primary creator workflows unless the user opens technical diagnostics.

## Phase plan

- **Brand Phase A:** metadata and product identity.
- **Brand Phase B:** primary dashboard chrome and creator workflow labels.
- **Brand Phase C:** documentation and onboarding.
- **Brand Phase D:** API/display aliases where compatibility permits.
- **Brand Phase E:** repository rename only after dependency and deployment verification.

The current branch implements Brand Phase A without changing runtime contracts.
