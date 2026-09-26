import { randomUUID } from "node:crypto";
import { getNeonSql } from "../lib/neon-db.js";
import { loadEnv } from "../lib/env.js";
import { decryptTikTokToken, encryptTikTokToken } from "./tiktok-crypto.js";

export type TikTokAccountStatus =
  | "active"
  | "controlled_verified"
  | "reauthorization_required"
  | "revoked"
  | "disabled";

export interface TikTokAccount {
  id: string;
  userId: string;
  openId: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  scopes: string[];
  status: TikTokAccountStatus;
  updatedAt: string;
}

interface TikTokAccountSecretRow extends TikTokAccount {
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
}

interface TikTokOAuthTokenResponse {
  access_token?: string;
  expires_in?: number;
  open_id?: string;
  refresh_expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  log_id?: string;
}

const ACCESS_REFRESH_MARGIN_MS = 15 * 60 * 1000;
const TIKTOK_OAUTH_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

function mapRow(row: Record<string, unknown>): TikTokAccount {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    openId: String(row.open_id),
    accessExpiresAt: new Date(String(row.access_expires_at)).toISOString(),
    refreshExpiresAt: new Date(String(row.refresh_expires_at)).toISOString(),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    status: String(row.status) as TikTokAccountStatus,
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapSecretRow(row: Record<string, unknown>): TikTokAccountSecretRow {
  return {
    ...mapRow(row),
    accessTokenCiphertext: String(row.access_token_ciphertext),
    refreshTokenCiphertext: String(row.refresh_token_ciphertext),
  };
}

function csvScopes(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export async function upsertTikTokAccount(input: {
  id?: string;
  userId: string;
  openId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  scopes: string[];
  status?: TikTokAccountStatus;
}): Promise<TikTokAccount> {
  const sql = getNeonSql();
  const id = input.id ?? randomUUID();
  const accessTokenCiphertext = encryptTikTokToken(input.accessToken);
  const refreshTokenCiphertext = encryptTikTokToken(input.refreshToken);
  const status = input.status ?? "active";

  const rows = await sql`
    INSERT INTO public.tiktok_accounts (
      id, user_id, open_id, access_token_ciphertext, refresh_token_ciphertext,
      access_expires_at, refresh_expires_at, scopes, status, updated_at
    )
    VALUES (
      ${id}, ${input.userId}, ${input.openId}, ${accessTokenCiphertext}, ${refreshTokenCiphertext},
      ${input.accessExpiresAt}, ${input.refreshExpiresAt}, ${input.scopes}, ${status}, now()
    )
    ON CONFLICT (user_id, open_id)
    DO UPDATE SET
      access_token_ciphertext = EXCLUDED.access_token_ciphertext,
      refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
      access_expires_at = EXCLUDED.access_expires_at,
      refresh_expires_at = EXCLUDED.refresh_expires_at,
      scopes = EXCLUDED.scopes,
      status = EXCLUDED.status,
      updated_at = now()
    RETURNING id, user_id, open_id, access_expires_at, refresh_expires_at, scopes, status, updated_at
  `;
  if (!rows[0]) throw new Error("Failed to persist TikTok account");
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function getTikTokAccount(id: string): Promise<TikTokAccount | null> {
  const sql = getNeonSql();
  const rows = await sql`
    SELECT id, user_id, open_id, access_expires_at, refresh_expires_at, scopes, status, updated_at
    FROM public.tiktok_accounts
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

async function getTikTokAccountSecrets(id: string): Promise<TikTokAccountSecretRow | null> {
  const sql = getNeonSql();
  const rows = await sql`
    SELECT id, user_id, open_id, access_token_ciphertext, refresh_token_ciphertext,
           access_expires_at, refresh_expires_at, scopes, status, updated_at
    FROM public.tiktok_accounts
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ? mapSecretRow(rows[0] as Record<string, unknown>) : null;
}

async function persistRefreshedTokens(
  account: TikTokAccountSecretRow,
  response: TikTokOAuthTokenResponse,
): Promise<TikTokAccount> {
  const accessToken = response.access_token;
  const refreshToken = response.refresh_token;
  const expiresIn = response.expires_in;
  const refreshExpiresIn = response.refresh_expires_in;
  if (!accessToken || !refreshToken || !expiresIn || !refreshExpiresIn) {
    throw new Error("TikTok refresh response is missing token expiry fields");
  }

  return upsertTikTokAccount({
    id: account.id,
    userId: account.userId,
    openId: response.open_id ?? account.openId,
    accessToken,
    refreshToken,
    accessExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    refreshExpiresAt: new Date(Date.now() + refreshExpiresIn * 1000).toISOString(),
    scopes: response.scope ? csvScopes(response.scope) : account.scopes,
    status: account.status,
  });
}

async function refreshTikTokAccount(account: TikTokAccountSecretRow): Promise<{ account: TikTokAccount; accessToken: string }> {
  const clientKey = process.env["SWARMX_TIKTOK_CLIENT_KEY"]?.trim() ?? "";
  const clientSecret = process.env["SWARMX_TIKTOK_CLIENT_SECRET"]?.trim() ?? "";
  if (!clientKey || !clientSecret) {
    throw new Error("TikTok client key and secret are required for token refresh");
  }

  if (Date.parse(account.refreshExpiresAt) <= Date.now()) {
    await setTikTokAccountStatus(account.id, "reauthorization_required");
    throw new Error("TikTok refresh token has expired; reauthorization required");
  }

  const refreshToken = decryptTikTokToken(account.refreshTokenCiphertext);
  const form = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(TIKTOK_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: form,
  });
  const payload = (await response.json().catch(() => ({}))) as TikTokOAuthTokenResponse;
  if (!response.ok || payload.error) {
    if (payload.error === "invalid_grant") {
      await setTikTokAccountStatus(account.id, "reauthorization_required");
    }
    throw new Error(
      `TikTok token refresh failed (${response.status}): ${payload.error_description ?? payload.error ?? "unknown"}`,
    );
  }

  const updated = await persistRefreshedTokens(account, payload);
  return {
    account: updated,
    accessToken: payload.access_token!,
  };
}

export async function getTikTokAccessToken(accountId: string): Promise<{ account: TikTokAccount; accessToken: string }> {
  const account = await getTikTokAccountSecrets(accountId);
  if (!account) throw new Error("TikTok account not found");
  if (account.status === "reauthorization_required" || account.status === "revoked" || account.status === "disabled") {
    throw new Error(`TikTok account is ${account.status}`);
  }

  if (Date.parse(account.accessExpiresAt) > Date.now() + ACCESS_REFRESH_MARGIN_MS) {
    return {
      account: mapRow(account as unknown as Record<string, unknown>),
      accessToken: decryptTikTokToken(account.accessTokenCiphertext),
    };
  }

  return refreshTikTokAccount(account);
}

export async function setTikTokAccountStatus(id: string, status: TikTokAccountStatus): Promise<TikTokAccount | null> {
  const sql = getNeonSql();
  const rows = await sql`
    UPDATE public.tiktok_accounts
    SET status = ${status}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, user_id, open_id, access_expires_at, refresh_expires_at, scopes, status, updated_at
  `;
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function assertControlledVerifiedTikTokAccount(id: string): Promise<TikTokAccount> {
  const account = await getTikTokAccount(id);
  if (!account) throw new Error("TikTok account not found");
  if (account.status !== "controlled_verified") {
    throw new Error("TikTok controlled-account verification has not succeeded for this account");
  }
  return account;
}
