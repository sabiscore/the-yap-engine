-- APEX-21 / TikTok durable OAuth account state
-- Apply with the direct/unpooled Neon connection.
CREATE TABLE IF NOT EXISTS public.tiktok_accounts (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  open_id text NOT NULL,
  access_token_ciphertext text NOT NULL,
  refresh_token_ciphertext text NOT NULL,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'controlled_verified', 'reauthorization_required', 'revoked', 'disabled')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, open_id)
);

CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_user
  ON public.tiktok_accounts (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_status
  ON public.tiktok_accounts (status, access_expires_at);

ALTER TABLE public.tiktok_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tiktok_accounts_owner_select ON public.tiktok_accounts;
CREATE POLICY tiktok_accounts_owner_select
  ON public.tiktok_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.user_id());

DROP POLICY IF EXISTS tiktok_accounts_owner_insert ON public.tiktok_accounts;
CREATE POLICY tiktok_accounts_owner_insert
  ON public.tiktok_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS tiktok_accounts_owner_update ON public.tiktok_accounts;
CREATE POLICY tiktok_accounts_owner_update
  ON public.tiktok_accounts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.user_id())
  WITH CHECK (user_id = auth.user_id());

DROP POLICY IF EXISTS tiktok_accounts_owner_delete ON public.tiktok_accounts;
CREATE POLICY tiktok_accounts_owner_delete
  ON public.tiktok_accounts
  FOR DELETE
  TO authenticated
  USING (user_id = auth.user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiktok_accounts TO authenticated;
