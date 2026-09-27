# Creative Hub — Monetization, Attribution & Platform Integrity

Status: evidence-gated · compliance-first · local-first

## Product contract

The Creative Hub produces explicit workflow states such as `READY_TO_POST`, `PENDING_REVIEW` and `BLOCKED`. It must never label content viral, guaranteed, algorithm-approved or revenue-positive without measured evidence.

## Execution boundary

Phases A-C are local: creative architecture, asset sourcing/provenance orchestration and the Audio Timing Spine. Heavy asynchronous rendering may be remote only when an explicit render backend is enabled and its release gate has passed. Neon and Upstash are state/coordination services; they are not creative executors.

Local video generation is independent of TikTok. Social credentials, OAuth approval and publication state belong only to the explicit publishing path.

## TikTok publishing contract

The implementation follows TikTok's official Content Posting API Direct Post sequence:

1. authorize a durable creator account with `video.publish`;
2. query current creator information and available privacy levels;
3. initialize Direct Post;
4. upload FILE_UPLOAD media to the returned upload URL in bounded chunks;
5. fetch terminal post status;
6. persist the provider result and durable account state.

Controlled verification is deliberately `SELF_ONLY` and sends `is_aigc=true`. Public visibility remains a separate gate and must not be inferred from a successful controlled test.

## Durable OAuth

`public.tiktok_accounts` is the server-authoritative account store. It keeps the TikTok `open_id`, the application/user association, encrypted access and refresh token ciphertext, expiry timestamps, granted scopes and lifecycle state.

Supported lifecycle states are:

```text
active
controlled_verified
reauthorization_required
revoked
disabled
```

Never manually promote an account to `controlled_verified`. The application performs that transition only after the controlled verification command observes a real successful provider result.

Client secrets, access tokens, refresh tokens and token-encryption keys must never be exposed to browser code, `NEXT_PUBLIC_*` variables or logs.

## AI-generated content

AI-generated video is disclosed through the platform's documented mechanism. The TikTok Direct Post protocol uses `is_aigc=true` for the controlled verification path and must not manipulate metadata to conceal AI generation.

## Originality

Originality is substantive rather than cosmetic. A publishable package should contain:

- an original narrative and Creative DNA;
- a deliberate scene graph and meaningful visual composition;
- original or authorized audio;
- rights-cleared assets;
- provenance and checksums.

Do not attempt to defeat originality systems with speed shifts, filters, watermarks, stickers, hash manipulation, duplicate clips, fingerprint spoofing or other superficial transformations.

## Empirical monetization model

The monetization system records observed accounting events. It does not forecast revenue from assumed RPM or CPM constants.

### Revenue surfaces

Track each surface independently:

| Surface | Observed field |
|---|---|
| Platform rewards | `platform_rewards_cents` |
| Affiliate commerce | `affiliate_revenue_cents` |
| Owned products | `owned_product_revenue_cents` |
| Sponsorships | `sponsor_revenue_cents` |

### Direct content costs

Track:

`llm_cost_cents`, `tts_cost_cents`, `render_cost_cents`, `storage_cost_cents`, `egress_cost_cents`.

### Contribution margin

```text
observed revenue
  = platform rewards
  + affiliate revenue
  + owned-product revenue
  + sponsorship revenue

contribution margin
  = observed revenue
  - LLM cost
  - TTS cost
  - render cost
  - storage cost
  - egress cost
```

The database schema represents these values as generated accounting fields so the dashboard cannot silently substitute a presumed RPM.

### Attribution identity

Persist deterministic identifiers wherever available:

`content_id`, `campaign_id`, `package_id`, `publish_id`, `platform`, `landing_page_id`, `offer_id`, attribution-window metadata and campaign/content UTM identifiers.

### Observation discipline

`observationCount=0` means there is no observed performance evidence. Do not manufacture views, watch time, completion, revenue, costs or conversions to make the dashboard look healthy.

P25/P50/P75 summaries are appropriate only after a sufficient set of real observations exists. Until then, show an explicit no-data state.

## Creative Hub UX contract

Expose the evidence state instead of hiding it behind a generic success indicator:

```text
RUNNING
QC_FAILED
NEEDS_REVISION
REVIEW_REQUIRED
READY_TO_POST
```

`READY_TO_POST` means the package passed its internal workflow checkpoints. It does not mean TikTok authorization or public publication is available.

Publishing blockers should identify the actual blocking gate: authorization, creator privacy support, AI disclosure, rights, QC, checksum or provider availability.

## Anti-abuse boundary

Do not automate fake engagement, inflate views/followers, rotate identities to evade enforcement, spoof fingerprints, rotate proxies for evasion, bypass CAPTCHAs, manipulate hashes to defeat originality systems or brute-force provider rate limits.

Supported distribution is the documented API + OAuth + explicit user consent + controlled verification + evidence-backed release path.

## Learning loop

Learning inputs are measured retention, completion, search discovery, engagement, conversion and cost evidence. Recommendations must preserve the rights, OAuth, AI-disclosure and memory-safety gates.

## Source of truth

Implementation references:

- `apps/swarmx-api/src/services/monetization-analytics.ts` — aggregation and contribution-margin calculation
- `docs/neon/004_monetization_observations.sql` — base observation table
- `docs/neon/005_monetization_event_attribution.sql` — attribution and accounting extensions
- `apps/swarmx-dashboard/src/components/series/CreativeFactoryPanel.tsx` — observed economics UI
- `docs/TIKTOK-CONTROLLED-VERIFICATION.md` — real-account controlled publishing evidence
- `docs/RELEASE-GATE-CHECKLIST.md` — release certification state