# ADR: Neon Auth runs in parallel with Fastify auth

## Decision

Keep the existing Fastify `SWARMX_VIDEO_API_TOKEN` authentication middleware authoritative for API mutations and introduce Neon Auth as the identity/JWT layer for the Neon Data API read plane.

## Why

- The current API has a tested, fail-closed write-auth boundary.
- The repository does not currently use Prisma, so introducing Prisma + `@prisma/adapter-neon` solely for this migration would add an ORM and connection lifecycle without an immediate application need.
- Neon production already has Better Auth and an active Data API.
- RLS can enforce tenant isolation for Data API reads without changing existing Fastify write contracts.
- A later full auth migration can be isolated and certified as its own change.

## Boundary

| Surface | Authority |
|---|---|
| Browser dashboard | Next.js server proxy |
| Existing Fastify mutations | `SWARMX_VIDEO_API_TOKEN` |
| Neon Data API reads | Neon Auth JWT + PostgreSQL RLS |
| Durable state | Neon Postgres |
| Job orchestration | BullMQ / Upstash |
| Phase A-C | Local-only |
| Phase D | Local FFmpeg or asynchronous AWS Fargate |

## Non-goals

- No replacement of Fastify auth in this release.
- No Prisma introduction without a separate schema/ORM migration.
- No client-side database credentials.
- No authenticated write policies through Data API until mutation semantics and identity propagation are independently certified.

## Exit criteria for a future auth migration

1. Neon Auth session is available in the dashboard for every protected user flow.
2. Fastify receives a verified identity claim rather than relying solely on the shared write token.
3. Existing API authorization tests are reproduced against the new identity model.
4. RLS policies cover SELECT/INSERT/UPDATE/DELETE as required.
5. Cross-tenant adversarial tests prove denial.
6. Rollback to the current token boundary is tested.
