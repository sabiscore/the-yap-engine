# Creative Hub — Monetization & Platform Integrity
Status: APEX-21 additive integration
Mode: evidence-gated · compliance-first · local-first

## Product contract
The Creative Hub produces READY_TO_POST, PENDING_REVIEW or BLOCKED. Never label content viral, guaranteed, algorithm-approved or revenue-positive without measured evidence.

## Hybrid execution
Phases A-C remain local: Creative Architecture, asset sourcing/provenance orchestration, and Audio Timing Spine. Cloud execution begins only at the asynchronous rendering/QC boundary. Neon and Upstash are state services, not creative executors.

## TikTok publishing
Use the official TikTok Content Posting API.
Direct Post sequence: OAuth authorization with video.publish → creator-info query → honor creator privacy options → video init → upload to returned upload_url → status fetch → persist terminal state.
Unaudited clients can be restricted to private viewing; production visibility requires the applicable TikTok approval/audit path.
Provider rate limits are enforced with bounded retries and backoff. Never brute-force retries.

## OAuth lifecycle
Current TikTok documentation states access tokens are valid for 24 hours and refresh tokens for 365 days. Refresh proactively 10–30 minutes before expiry, persist rotated refresh tokens server-side, and require reauthorization after invalid_grant.
Never expose client secrets or refresh tokens to browser code or logs.

## AI-generated content
Mark AI-generated videos using TikTok's documented is_aigc field. Do not conceal AI generation or manipulate metadata to evade platform review.
Legitimate metadata hygiene may remove local paths and secrets while preserving rights/provenance evidence and internal checksums.

## Originality
Do not attempt to pass originality audits through superficial perturbations. Require genuine transformation: original script, Creative DNA, scene graph, substantive editing, original or licensed audio, rights-cleared assets and provenance.
Reject content whose only transformation is speed changes, filters, static overlays, stickers, watermarks or concatenation of third-party clips.

## Retention production model
For Creator Rewards-targeted content, design comfortably over one minute rather than exactly 60 seconds.
Suggested 75–90 second structure: 0–3s tension; 3–10s context + micro-payoff; 10–25s escalation; 25–45s evidence/reveal; 45–65s highest-value insight; 65–80s resolution; 80–90s CTA/loop bridge.
These are production heuristics, not platform guarantees. Optimize observed first-3-second hold, average watch time, completion, rewatches, shares, comments and search discovery.

## Monetization
Treat platform rewards, affiliate commerce, owned SaaS/products, sponsorships and services as separate revenue surfaces.
Record generation cost, TTS cost, render cost, storage/egress, platform results, qualified views, watch time, engagement and attributed revenue.
Use measured P25/P50/P75 cost and revenue distributions once sufficient observations exist. Never hard-code RPM assumptions as facts.

## Funnel instrumentation
Each package should carry content_id, campaign_id, platform, publish_id, landing_page_id, UTM campaign/content, offer_id, attribution window, cost snapshot and revenue snapshot.

## Creative Hub UX
Expose Create, Concept Tournament, Scene Graph, Audio Timeline, Render, QC, Rights, Publish, Learn and Monetization.
Publish state must be visibly READY, REVIEW or BLOCKED with platform capability, authorization, AI disclosure, rights, QC and checksum state.

## Anti-abuse boundary
Do not automate fake engagement, buy or inflate views/followers, rotate identities to evade enforcement, spoof fingerprints, rotate proxies for evasion, manipulate hashes to defeat originality systems, bypass rate limits or automate CAPTCHA/account-verification circumvention.
Official APIs, documented OAuth, explicit user consent and human review are the supported publication path.

## Learning loop
Use observed retention, completion, search discovery, engagement, conversion and cost data to update creative hypotheses. Policy-changing recommendations require approval and must never weaken rights, OAuth, compliance or 8 GB execution gates.