# TikTok Publishing Setup

The Yap Engine uses TikTok Login Kit / OAuth 2.0 and the official Content Posting API. TikTok is a downstream publishing integration; it is never a prerequisite for local video generation.

## 1. Developer application

1. Create/select the TikTok developer application.
2. Add the **Content Posting API** product.
3. Request/obtain the `video.publish` scope for Direct Post.
4. Register the exact web redirect URI used by the Yap Engine.
5. Keep client secrets server-side.

`video.upload` is a different draft-upload flow. It does not replace `video.publish` for Direct Post.

## 2. Server environment

```dotenv
SWARMX_TIKTOK_API_APPROVED=0
SWARMX_TIKTOK_PUBLIC_POSTS_ENABLED=0
SWARMX_TIKTOK_PRIVACY_LEVEL=SELF_ONLY
SWARMX_TIKTOK_CLIENT_KEY=<server-secret>
SWARMX_TIKTOK_CLIENT_SECRET=<server-secret>
SWARMX_TIKTOK_TOKEN_ENCRYPTION_KEY=<32-byte-base64-key>
SWARMX_TIKTOK_OAUTH_REDIRECT_URI=<registered-redirect-uri>
```

Never use `NEXT_PUBLIC_*` for TikTok credentials, tokens or encryption keys.

## 3. OAuth and durable multi-account state

The OAuth callback exchanges the authorization code server-side and persists the real TikTok identity in `public.tiktok_accounts`.

The durable row stores:

| Field | Purpose |
|---|---|
| `user_id` | Yap Engine owner |
| `open_id` | TikTok creator identity |
| `access_token_ciphertext` | Encrypted access token |
| `refresh_token_ciphertext` | Encrypted refresh token |
| `access_expires_at` | Access-token expiry |
| `refresh_expires_at` | Refresh-token expiry |
| `scopes` | Granted OAuth scopes |
| `status` | Account lifecycle state |

Supported status values are `active`, `controlled_verified`, `reauthorization_required`, `revoked` and `disabled`.

TikTok currently documents access tokens as valid for 24 hours and refresh tokens for 365 days. Refreshing may return a new refresh token; the server must persist the returned value. citeturn110339search0

Generate the token-encryption key locally:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 4. Exact Direct Post flow

```text
authorized account
  -> creator_info/query
  -> honor returned privacy options
  -> video/init using video.publish
  -> FILE_UPLOAD to returned upload_url
  -> bounded Content-Range chunks
  -> status/fetch
  -> persist terminal result
```

TikTok requires creator information before the export/post experience and the `video.publish` scope for Direct Post. The `privacy_level` sent to initialization must be one of the options returned for that creator. citeturn932929search1turn932929search5

Each Direct Post initialization request is limited to six requests per minute per user access token. The Yap Engine therefore uses a per-account queue lane and bounded retry behavior rather than brute-force retries. citeturn932929search1

For `FILE_UPLOAD`, TikTok documents 5 MB–64 MB chunks (with a larger final chunk allowed) and a maximum video size of 4 GB. citeturn932929search7

## 5. Controlled verification

Controlled verification is deliberately private and evidence-oriented:

```text
privacy_level = SELF_ONLY
is_aigc = true
SWARMX_TIKTOK_PUBLIC_POSTS_ENABLED = 0
```

The verification command must query creator info, confirm `SELF_ONLY`, initialize Direct Post, upload the media, poll `status/fetch`, and only then promote the real durable row from `active` to `controlled_verified`.

Do not manually insert or update `controlled_verified`.

Run:

```powershell
pnpm --filter @swarmx/api tiktok:verify -- `
  --account-id=<DURABLE_TIKTOK_ACCOUNT_ID> `
  --output=<PATH_TO_CONTROLLED_MP4> `
  --prompt="Controlled Yap Engine integration verification — SELF_ONLY" `
  --confirm-self-only=true
```

See [docs/TIKTOK-CONTROLLED-VERIFICATION.md](./TIKTOK-CONTROLLED-VERIFICATION.md) for the full operator evidence protocol.

## 6. Public-post gate

Public posting is a separate control:

```dotenv
SWARMX_TIKTOK_PUBLIC_POSTS_ENABLED=0
```

Keep it at `0` through controlled verification and until any applicable TikTok audit/visibility requirements have been satisfied. TikTok states that unaudited clients are restricted to private viewing. citeturn932929search1

`READY_TO_POST` in the Creative Hub means the Yap Engine package passed its internal gates. It does not mean that TikTok authorization or public publication is available.

## 7. Security and originality

Never expose client secrets or refresh tokens to browser code or logs.

Do not bypass TikTok controls through CAPTCHA circumvention, proxy rotation, identity rotation, fingerprint spoofing, hash manipulation or artificial engagement.

Generated content should retain substantive originality, rights-cleared assets, audio lineage and provenance evidence.

## Official references

- [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post)
- [Get Started — Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started)
- [Creator Info](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info)
- [Upload](https://developers.tiktok.com/docs/en/content-posting-api-reference-upload-video)
- [Media Transfer Guide](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)
- [Get Post Status](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status)
- [User Access Token Management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management)