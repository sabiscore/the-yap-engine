# TikTok Publishing Setup

The Yap Engine uses TikTok's official OAuth 2.0 and Content Posting API.

## Direct Post prerequisites
1. Register a TikTok developer application.
2. Add the Content Posting API product.
3. Obtain approval for the video.publish scope.
4. Configure the application's web redirect URI.
5. Authorize the target creator account.
6. Store tokens only on the server.
7. Complete TikTok's applicable audit/review before expecting public Direct Posts from an unaudited client.

TikTok documents the current Direct Post flow as creator-info query → video init → upload to the returned upload URL → status fetch.

## Environment
Set server-side secrets:

SWARMX_TIKTOK_ACCESS_TOKEN=
SWARMX_TIKTOK_CLIENT_KEY=
SWARMX_TIKTOK_CLIENT_SECRET=
SWARMX_TIKTOK_API_APPROVED=0
SWARMX_TIKTOK_PRIVACY_LEVEL=SELF_ONLY

SWARMX_TIKTOK_PRIVACY_LEVEL must match an option returned by TikTok's creator-info endpoint. SELF_ONLY is the safe default.
Never use NEXT_PUBLIC_* for TikTok credentials.

## OAuth lifecycle
TikTok's current OAuth documentation states access tokens are valid for 24 hours and refresh tokens for 365 days. Refresh proactively 10–30 minutes before access-token expiry and persist any rotated refresh token.
The production implementation should persist the token set by creator/account identity in durable server-side state rather than relying on a static environment access token for multi-account operation.

## Direct Post
The publisher implementation lives at apps/swarmx-api/src/services/publishers/tiktok.ts.
It must:
1. query creator information;
2. honor available privacy choices;
3. initialize /v2/post/publish/video/init/;
4. upload using the returned upload_url;
5. query /v2/post/publish/status/fetch/ with POST;
6. persist/return the publish identifier and terminal state;
7. mark AI-generated content with the documented AIGC field.
The adapter intentionally falls back to pending_review when approval or authorization is unavailable.

## Upload limits and reliability
TikTok currently documents six requests per minute per user access token for Direct Post initialization. Use provider-scoped rate limiting, bounded retries and exponential backoff.
Do not retry indefinitely and do not bypass rate limits.

## AI and originality
The Yap Engine must not conceal AI generation or attempt to evade originality systems.
Use genuine creative authorship: original script, original Creative DNA, substantive scene composition, rights-cleared assets, original or authorized audio, and documented provenance.
Do not use fingerprint spoofing, hash manipulation, proxy rotation, browser stealth or artificial engagement.

## Review checklist
- [ ] TikTok app approved for required scope
- [ ] creator authorization completed
- [ ] creator privacy options queried
- [ ] token expiry/refresh lifecycle implemented
- [ ] AI disclosure handled
- [ ] rights/QC gates pass
- [ ] artifact checksum verified
- [ ] production publish tested with a controlled account
- [ ] audit/public-visibility requirements satisfied

## Official references
- TikTok Content Posting API — Direct Post
- TikTok Content Posting API — Upload
- TikTok OAuth User Access Token Management