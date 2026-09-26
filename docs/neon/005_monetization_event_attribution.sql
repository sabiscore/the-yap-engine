-- APEX-21 / Creative Hub observed publish + engagement attribution extension
-- 005 is the next migration after the existing monetization contract.
-- All new fields are observed-event fields; no RPM or synthetic performance values are introduced.

ALTER TABLE public.monetization_observations
  ADD COLUMN IF NOT EXISTS content_id text,
  ADD COLUMN IF NOT EXISTS campaign_id text,
  ADD COLUMN IF NOT EXISTS publish_id text,
  ADD COLUMN IF NOT EXISTS view_count bigint NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  ADD COLUMN IF NOT EXISTS qualified_views bigint NOT NULL DEFAULT 0 CHECK (qualified_views >= 0),
  ADD COLUMN IF NOT EXISTS watch_time_seconds double precision NOT NULL DEFAULT 0 CHECK (watch_time_seconds >= 0),
  ADD COLUMN IF NOT EXISTS completion_rate double precision CHECK (completion_rate IS NULL OR (completion_rate >= 0 AND completion_rate <= 1)),
  ADD COLUMN IF NOT EXISTS shares bigint NOT NULL DEFAULT 0 CHECK (shares >= 0),
  ADD COLUMN IF NOT EXISTS comments bigint NOT NULL DEFAULT 0 CHECK (comments >= 0),
  ADD COLUMN IF NOT EXISTS funnel_sessions bigint NOT NULL DEFAULT 0 CHECK (funnel_sessions >= 0);

ALTER TABLE public.monetization_observations
  ADD COLUMN IF NOT EXISTS generation_cost_cents bigint
    GENERATED ALWAYS AS (llm_cost_cents + tts_cost_cents) STORED,
  ADD COLUMN IF NOT EXISTS distribution_cost_cents bigint
    GENERATED ALWAYS AS (egress_cost_cents) STORED,
  ADD COLUMN IF NOT EXISTS revenue_cents bigint
    GENERATED ALWAYS AS (
      platform_rewards_cents + affiliate_revenue_cents + owned_product_revenue_cents + sponsor_revenue_cents
    ) STORED,
  ADD COLUMN IF NOT EXISTS contribution_margin_cents bigint
    GENERATED ALWAYS AS (
      platform_rewards_cents + affiliate_revenue_cents + owned_product_revenue_cents + sponsor_revenue_cents
      - llm_cost_cents - tts_cost_cents - render_cost_cents - storage_cost_cents - egress_cost_cents
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_monetization_observations_content_time
  ON public.monetization_observations (content_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_monetization_observations_publish
  ON public.monetization_observations (publish_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_monetization_observations_campaign_time
  ON public.monetization_observations (campaign_id, observed_at DESC);
