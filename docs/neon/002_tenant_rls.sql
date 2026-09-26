-- APEX-21 tenant isolation for Neon Auth + Data API.
-- Idempotent: safe to re-run after 001_apex21_state.sql.
-- Apply to the Neon production branch only after reviewing policy semantics.

ALTER TABLE public.creative_runs ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.creative_runs ADD COLUMN IF NOT EXISTS scene_spec jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.creative_artifacts ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.render_jobs ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.asset_provenance ADD COLUMN IF NOT EXISTS user_id text;

CREATE INDEX IF NOT EXISTS creative_runs_user_idx
  ON public.creative_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS creative_artifacts_user_idx
  ON public.creative_artifacts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS render_jobs_user_idx
  ON public.render_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS asset_provenance_user_idx
  ON public.asset_provenance(user_id, retrieved_at DESC);

ALTER TABLE public.creative_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_provenance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creative_runs_owner_select ON public.creative_runs;
CREATE POLICY creative_runs_owner_select
  ON public.creative_runs FOR SELECT TO authenticated
  USING (user_id = auth.user_id());

DROP POLICY IF EXISTS creative_artifacts_owner_select ON public.creative_artifacts;
CREATE POLICY creative_artifacts_owner_select
  ON public.creative_artifacts FOR SELECT TO authenticated
  USING (user_id = auth.user_id());

DROP POLICY IF EXISTS render_jobs_owner_select ON public.render_jobs;
CREATE POLICY render_jobs_owner_select
  ON public.render_jobs FOR SELECT TO authenticated
  USING (user_id = auth.user_id());

DROP POLICY IF EXISTS asset_provenance_owner_select ON public.asset_provenance;
CREATE POLICY asset_provenance_owner_select
  ON public.asset_provenance FOR SELECT TO authenticated
  USING (user_id = auth.user_id());

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.creative_runs, public.creative_artifacts,
  public.render_jobs, public.asset_provenance TO authenticated;
