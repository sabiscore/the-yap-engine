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
