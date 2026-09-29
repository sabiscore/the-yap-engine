# TikTok Direct Post Release-Gate Test

Status: controlled verification required · public posting disabled by default

## Purpose

Verify that automated TikTok Direct Post cannot proceed unless the official API sequence, privacy, AI disclosure, durable account state and upload-transfer invariants are satisfied.

## Automated protocol test

Run:

```bash
pnpm --filter @swarmx/api test -- tiktok-protocol.test.ts
```

The regression suite must prove:

| Gate | Required behavior |
| --- | --- |
| Creator Info | queried before Direct Post initialization |
| Scope | Direct Post uses `video.publish`; `video.upload` is not substituted |
| Privacy | controlled verification requires `SELF_ONLY` and rejects accounts that do not expose it |
| AIGC | controlled initialization sends `is_aigc=true` |
| Transfer | `FILE_UPLOAD` is used with sequential `Content-Range` PUT requests |
| Chunk count | `total_chunk_count = floor(video_size / chunk_size)` for files at or above the minimum chunk size |
| Final chunk | trailing bytes are folded into the final sequential chunk |
| Status | `/status/fetch/` is POSTed until a terminal state or bounded timeout |
| Upload URL | missing `upload_url` fails closed |
| Retries | no brute-force retry of the six-init-requests/minute limit |

## Production publisher gate

Before the production publisher can enqueue a Direct Post:

1. `SWARMX_TIKTOK_API_APPROVED=1` must be explicitly enabled.
2. A durable `tiktok_accounts` row must be supplied.
3. The account must exist and have lifecycle state `controlled_verified`.
4. The account must retain the `video.publish` grant.
5. The artifact must exist and be non-empty.
6. Creator Info must still be queried at publish time.
7. The requested privacy level must be one returned by Creator Info.
8. Controlled verification must have succeeded with `SELF_ONLY` and `is_aigc=true`.
9. `SWARMX_TIKTOK_PUBLIC_POSTS_ENABLED` remains `0` until the separate public-post/audit gate is satisfied.

## Durable-account gate

OAuth success must persist the real TikTok `open_id`, encrypted access/refresh token ciphertext, expiry timestamps, scopes and lifecycle state in `public.tiktok_accounts`.

Never promote an account to `controlled_verified` by SQL or an administrative shortcut. Only the controlled verification command may make that transition after a real provider success.

## Manual controlled-account test

Use a real operator-controlled account and a known test MP4:

```text
Creator Info -> confirm SELF_ONLY
             -> Direct Post init
             -> is_aigc=true
             -> sequential FILE_UPLOAD
             -> status/fetch
             -> terminal success
             -> persist provider evidence
             -> promote exact durable row to controlled_verified
```

Capture the publish identifier, provider terminal status, selected privacy option, AIGC disclosure evidence, artifact checksum and account ID.

## Public-post gate

Public posting is not implied by `READY_TO_POST` in the Creative Hub. Keep:

```dotenv
SWARMX_TIKTOK_PUBLIC_POSTS_ENABLED=0
```

until the applicable TikTok audit/visibility requirements have been satisfied and the operator has separately approved the public distribution path.

TikTok states that unaudited Direct Post clients are restricted to private viewing and that the client must undergo audit to lift the restriction. See the official Direct Post and Content Sharing Guidelines references in `docs/TIKTOK_SETUP.md`.

## Release decision

**PASS** only when all automated tests pass and the real controlled-account evidence bundle is complete.

**HOLD** for any missing scope, missing durable account, unsupported privacy option, missing AIGC disclosure, upload contract failure, unbounded retry, absent provider terminal state, or absent audit/public-visibility evidence.

## References

- `apps/swarmx-api/src/services/publishers/tiktok.ts`
- `apps/swarmx-api/src/services/tiktok-protocol.ts`
- `apps/swarmx-api/src/services/tiktok-direct-post-queue.ts`
- `apps/swarmx-api/src/services/tiktok-accounts.ts`
- `apps/swarmx-api/__tests__/tiktok-protocol.test.ts`
- `docs/TIKTOK_SETUP.md`
- `docs/TIKTOK-CONTROLLED-VERIFICATION.md`