-- APEX-21 / Empirical monetization telemetry
-- Every revenue/cost value is an observed accounting fact, not an RPM estimate.
CREATE TABLE IF NOT EXISTS public.monetization_observations (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  package_id text NOT NULL,
  platform text NOT NULL,
  observed_at timestamptz NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  platform_rewards_cents bigint NOT NULL DEFAULT 0 CHECK (platform_rewards_cents >= 0),
  affiliate_clicks integer NOT NULL DEFAULT 0 CHECK (affiliate_clicks >= 0),
  affiliate_conversions integer NOT NULL DEFAULT 0 CHECK (affiliate_conversions >= 0),
  affiliate_revenue_cents bigint NOT NULL DEFAULT 0 CHECK (affiliate_revenue_cents >= 0),
  landing_page_visits integer NOT NULL DEFAULT 0 CHECK (landing_page_visits >= 0),
  checkout_starts integer NOT NULL DEFAULT 0 CHECK (checkout_starts >= 0),
  owned_product_conversions integer NOT NULL DEFAULT 0 CHECK (owned_product_conversions >= 0),
  owned_product_revenue_cents bigint NOT NULL DEFAULT 0 CHECK (owned_product_revenue_cents >= 0),
  sponsor_revenue_cents bigint NOT NULL DEFAULT 0 CHECK (sponsor_revenue_cents >= 0),
  llm_cost_cents bigint NOT NULL DEFAULT 0 CHECK (llm_cost_cents >= 0),
  tts_cost_cents bigint NOT NULL DEFAULT 0 CHECK (tts_cost_cents >= 0),
  render_cost_cents bigint NOT NULL DEFAULT 0 CHECK (render_cost_cents >= 0),
  storage_cost_cents bigint NOT NULL DEFAULT 0 CHECK (storage_cost_cents >= 0),
  egress_cost_cents bigint NOT NULL DEFAULT 0 CHECK (egress_cost_cents >= 0),
  source text NOT NULL,
  attribution_window_days integer CHECK (attribution_window_days IS NULL OR attribution_window_days >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monetization_observations_user_time
  ON public.monetization_observations (user_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_monetization_observations_package
  ON public.monetization_observations (package_id, observed_at DESC);

ALTER TABLE public.monetization_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monetization_observations_owner_select ON public.monetization_observations;
CREATE POLICY monetization_observations_owner_select
  ON public.monetization_observations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.user_id());

DROP POLICY IF EXISTS monetization_observations_owner_insert ON public.monetization_observations;
CREATE POLICY monetization_observations_owner_insert
  ON public.monetization_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS monetization_observations_owner_update ON public.monetization_observations;
CREATE POLICY monetization_observations_owner_update
  ON public.monetization_observations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS monetization_observations_owner_delete ON public.monetization_observations;
CREATE POLICY monetization_observations_owner_delete
  ON public.monetization_observations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monetization_observations TO authenticated;
