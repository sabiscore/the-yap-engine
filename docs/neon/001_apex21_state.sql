-- APEX-21 durable state plane.
-- Apply with: neon psql < docs/neon/001_apex21_state.sql
-- The schema is additive and intentionally independent from local JSON snapshots.

CREATE TABLE IF NOT EXISTS creative_runs (
  id text PRIMARY KEY,
  status text NOT NULL,
  creative_dna_id text,
  renderer_version text,
  cache_key text,
  input_hash text,
  output_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS creative_artifacts (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES creative_runs(id) ON DELETE CASCADE,
  scene_id text,
  kind text NOT NULL,
  content_hash text NOT NULL,
  uri text,
  provider text,
  license text,
  attribution_required boolean NOT NULL DEFAULT false,
  rights_state text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS render_jobs (
  id text PRIMARY KEY,
  run_id text REFERENCES creative_runs(id) ON DELETE SET NULL,
  provider text NOT NULL,
  status text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  manifest_key text,
  output_key text,
  checksum text,
  duration_ms integer,
  peak_rss_kb integer,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  error jsonb
);

CREATE TABLE IF NOT EXISTS asset_provenance (
  content_hash text PRIMARY KEY,
  provider text NOT NULL,
  provider_asset_id text,
  source_url text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  media_type text NOT NULL,
  license text NOT NULL,
  attribution_required boolean NOT NULL DEFAULT false,
  allowed_use_state text NOT NULL DEFAULT 'unknown',
  lineage jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS creative_artifacts_run_idx
  ON creative_artifacts(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS render_jobs_run_idx
  ON render_jobs(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS asset_provenance_provider_idx
  ON asset_provenance(provider, retrieved_at DESC);
