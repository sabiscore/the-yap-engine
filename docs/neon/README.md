# Neon state plane

The local JSON/snapshot stores remain the source of truth during local certification. Neon becomes the durable external-testing state plane after the operator links the target project.

## Apply

```bash
neon link --project-id orange-shape-10519833 --branch production -y
neon env pull --service postgres
neon psql < docs/neon/001_apex21_state.sql
```

Use the pooled `DATABASE_URL` for application traffic. Keep the direct connection only for administrative/migration operations that explicitly require it.

Do not run destructive SQL automatically. Schema changes must be additive, reviewed, and tested against a Neon branch before production.


## Tenant isolation

Neon production is provisioned with Better Auth and the Data API. The additive tenant migration is `docs/neon/002_tenant_rls.sql`.

The current policy deliberately grants **authenticated SELECT only** to the four APEX-21 state tables. Existing Fastify mutations remain protected by `SWARMX_VIDEO_API_TOKEN` until a separate auth migration is certified. This avoids splitting write authorization between two systems.

The Data API URL and Neon Auth URL are server-side configuration values. Browser clients must obtain a session through the approved auth client and query the Data API through a controlled server boundary; database URLs never enter client bundles.
