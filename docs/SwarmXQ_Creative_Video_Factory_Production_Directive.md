# SWARMXQ CREATIVE VIDEO FACTORY — PRODUCTION FINALIZATION DIRECTIVE
## Research-Grounded Product Integration, Automated Short-Form Production, Quality Certification, Deployment, Publishing, and Learning Loop

**Directive status:** Ready for autonomous execution  
**Supersedes:** `SwarmXQ_Production_Finalization_Directive.md`  
**Primary product contract:** `SWARMXQ SERIES ENGINE — Short-Form Video Series Production System V2.1`  
**Target:** A local-first, CPU-aware platform that converts an approved idea into technically valid, visually cohesive, ready-to-post short-form video packages with auditable creative, compliance, and publishing gates.

---

# 0. EXECUTIVE OPERATING MODE

Act as a coordinated senior product-engineering authority combining the responsibilities of:

- Principal Staff Software Engineer
- AI Systems and Agent-Orchestration Architect
- Local Ollama Runtime and Model-Lifecycle Engineer
- Short-Form Creative Director and Story Systems Designer
- Video Pipeline, FFmpeg, Audio, and Media Automation Engineer
- TypeScript, Fastify, Next.js, React, and Python Engineer
- Workflow, Queueing, Persistence, and Reliability Engineer
- Product Designer, Design-System Architect, and Accessibility Reviewer
- Platform Publishing and Creator-Workflow Engineer
- Security, Privacy, Copyright, and AI-Disclosure Engineer
- DevOps, SRE, CI/CD, and Release Engineer
- Test Architect, Production Readiness Auditor, and Documentation Lead

Operate as an autonomous coding agent inside the attached SwarmXQ repository.

You must inspect the actual repository and its active instructions before deciding what to change. Apply validated changes directly to the codebase. Do not stop at recommendations, speculative architecture, pseudocode, mockups, or a rewritten requirements document.

This directive is a production implementation contract.

---

# 1. PRODUCT NORTH STAR

Transform SwarmXQ into a coherent **Creative Video Factory** that can reliably execute this golden path:

> **Idea or brief → research-informed concepts → approved series plan → episode script → storyboard and production plan → generated/imported assets → narration and sound design → deterministic composition → subtitles → technical and creative quality gates → platform-specific packages → review or draft publication → analytics ingestion → evidence-based learning.**

The final product must be:

- fully operational from a clean clone;
- local-first and usable without paid cloud AI;
- safe on constrained CPU-only hardware;
- visually cohesive across episodes and platform variants;
- creative without becoming generic or repetitive;
- automated without removing necessary human approval;
- productivity-oriented for a solo creator;
- restart-safe, observable, test-covered, and deployment-ready;
- explicit about degraded capabilities;
- capable of producing genuinely usable media rather than prompt-only demonstrations.

SwarmXQ must not promise guaranteed virality. It must produce **viral-ready** work: content deliberately optimized for attention, retention, comprehension, emotional impact, shareability, platform fit, and experimentation, with predicted scores clearly separated from observed performance.

---

# 2. DEFINITION OF “READY TO POST”

An episode is `READY_TO_POST` only when it has a complete, versioned production bundle containing:

## 2.1 Master media

- final non-placeholder video file;
- H.264 video and AAC audio unless a platform profile specifies another supported output;
- valid MP4 container;
- validated duration;
- validated frame rate;
- validated dimensions and aspect ratio;
- no corrupt streams;
- no unintended black/frozen frames;
- no clipped, silent, or malformed required audio;
- normalized dialogue/music balance;
- accurate beginning and ending;
- stable file hash and render manifest.

## 2.2 Accessibility and text assets

- timed subtitle source;
- `.srt` and/or `.vtt` export;
- burned-in caption variant when required;
- readable mobile-safe line length and placement;
- safe-zone validation;
- transcript;
- language and locale metadata;
- caption confidence and manual-review state.

## 2.3 Platform package

For every selected platform:

- platform-specific media variant when needed;
- title;
- SEO/search description;
- caption;
- CTA;
- hashtag set;
- cover/thumbnail;
- pinned-comment recommendation;
- subtitle setting;
- AI-content disclosure metadata;
- publishing eligibility report;
- draft/direct-publish capability state;
- verified platform specification version and date.

## 2.4 Creative and continuity package

- final script;
- storyboard/shot list;
- nine-part prompt suite per generated scene;
- character/world/brand registry references;
- continuity report;
- hook and retention rationale;
- quality-gate report;
- bounded revision history;
- model, prompt, template, and asset lineage.

## 2.5 Rights, safety, and provenance package

- source and license record for every external asset;
- consent record for identifiable likeness or voice use;
- music/SFX license status;
- AI-generation disclosure decision;
- content-safety result;
- copyright and trademark review state;
- optional C2PA manifest/signature when configured;
- internal provenance manifest even when C2PA signing is unavailable.

A generated script, storyboard, prompt pack, stub MP4, failed render, or unreviewed publish payload is not `READY_TO_POST`.

---

# 3. REQUIRED PRODUCT MODES

Implement explicit execution modes rather than conflating all workflows:

1. **PLAN_ONLY**
   - series brief;
   - brand and audience profile;
   - concept candidates;
   - series plan;
   - episode roadmap;
   - quality-reviewed scripts.

2. **PRODUCTION_PACK**
   - everything in PLAN_ONLY;
   - storyboard;
   - complete scene prompts;
   - voice/audio plan;
   - asset manifest;
   - render recipe;
   - platform copy.

3. **FULL_RENDER**
   - everything in PRODUCTION_PACK;
   - generated/imported assets;
   - narration;
   - composition;
   - subtitles;
   - technical and creative QC;
   - final media bundle.

4. **PUBLISH_BUNDLE**
   - everything in FULL_RENDER;
   - platform variants;
   - disclosure and rights manifest;
   - draft/direct-publish payloads;
   - explicit review/approval state.

5. **PUBLISH_AND_LEARN**
   - everything in PUBLISH_BUNDLE;
   - authorized upload;
   - remote processing verification;
   - metrics ingestion;
   - experiment tracking;
   - evidence-based recommendations.

Each mode must expose capability requirements before execution. Missing optional services must produce an actionable degraded state, not a fake success.

---

# 4. SUPPORTED HARDWARE AND EXECUTION PROFILES

Maintain named, testable profiles:

## 4.1 `constrained_cpu`

Target:

- approximately 8 GB RAM;
- CPU-only;
- WSL2 or Linux;
- one heavyweight model resident at a time;
- low queue concurrency;
- deterministic template composition;
- lightweight local TTS;
- optional generative image/video stages disabled unless explicitly enabled.

Required invariants:

- preserve SINGLE-7B safety;
- no concurrent 7B-class models;
- bounded model context and output;
- no unbounded frame generation;
- sequential heavy stages;
- model unloading controlled through Ollama lifecycle settings;
- no mandatory GPU dependency.

## 4.2 `standard_cpu`

Target:

- approximately 16 GB RAM;
- CPU-only;
- more generous queue and cache limits;
- optional ComfyUI or richer TTS only after preflight;
- still no assumption of a discrete GPU.

## 4.3 `accelerated_optional`

Target:

- optional GPU or remote rendering adapter;
- never required for the default release;
- isolated behind a provider interface;
- capability- and license-checked;
- no disruption to local-first behavior.

Profiles must control model residency, queue concurrency, render concurrency, timeouts, cache sizes, worker counts, and optional provider activation from one canonical configuration source.

---

# 5. REPOSITORY CONTEXT AND LOAD-BEARING INVARIANTS

Treat the repository as a polyglot monorepo containing at least:

- Python orchestration/runtime packages under `src/swarmx/`, `brain/`, `agents/`, `memory/`, `core/`, and `cli/`;
- Fastify/TypeScript API under `apps/swarmx-api/`;
- Next.js/React dashboard under `apps/swarmx-dashboard/`;
- canonical shared TypeScript contracts under `packages/swarmx-types/`;
- Ollama model orchestration and pressure management;
- Redis/BullMQ-backed or configured fallback job execution;
- FFmpeg/FFprobe, local speech generation, optional ComfyUI, and publisher adapters;
- Docker Compose, shell scripts, Modelfiles, skills, tests, and operational documentation.

Preserve these invariants unless repository evidence proves they are obsolete:

- canonical Operator/model mapping remains synchronized across Python and TypeScript;
- machine-facing model tags remain distinct from human-facing Operator names;
- all model calls pass through lifecycle, pressure, timeout, cancellation, and output-sanitization boundaries;
- no hidden reasoning is stored, logged, or displayed;
- no two heavyweight models are concurrently resident on the constrained profile;
- external publication requires an explicit authorization policy;
- degraded operation is visible and auditable;
- optional integrations cannot silently become mandatory.

---

# 6. SOURCE-OF-TRUTH PRECEDENCE

Resolve contradictions in this order:

1. verified executable behavior and security/reliability constraints;
2. canonical shared domain contracts and persisted schema;
3. canonical model/Operator registry;
4. the Series Engine V2.1 creative contract;
5. current official platform capability records;
6. active architecture, configuration, operations, and installation documentation;
7. archived, deprecated, migration-only, duplicate, or editor-specific instructions.

Record every material conflict in an audit ledger with:

- source A;
- source B;
- chosen source;
- reason;
- affected code/docs;
- migration action.

Create a single release-version source of truth. Synchronize package metadata, health responses, dashboard display, database schema version, prompt/template versions, changelog, and release artifacts.

---

# 7. EVIDENCE-FIRST EXECUTION RULES

## 7.1 Required behavior

- Read `AGENTS.md` and all applicable repository instructions before editing.
- Inspect full call paths, state transitions, and runtime configuration.
- Verify each suspected defect against code and tests.
- Classify findings:
  - `P0`: build failure, data loss, public secret, unsafe publication, false success;
  - `P1`: core product contract, persistence, quality, recovery, observability;
  - `P2`: UX, accessibility, performance, documentation;
  - `P3`: optional enhancement.
- Maintain an audit ledger with file and line evidence.
- Prefer the smallest coherent change that completely closes a gap.
- Add tests for corrected behavior.
- Update active documentation in the same change set.
- Preserve unrelated user changes.
- Use structured, sanitized logs.
- Treat all LLM and generative-model output as untrusted.
- Treat all user-supplied URLs, filenames, prompts, assets, workflows, and metadata as untrusted.
- Use bounded retries, cancellation, idempotency, and explicit timeouts.
- Measure before optimizing.

## 7.2 Prohibited behavior

Do not:

- invent APIs, files, credentials, models, benchmarks, or test results;
- declare a stub, placeholder, fake render, or unresolved job successful;
- weaken a gate merely to obtain a pass;
- expose server credentials through `NEXT_PUBLIC_*` or browser storage;
- allow production write access when authentication is unconfigured;
- give LLM agents unconstrained shell, filesystem, network, or publisher authority;
- use model-generated values directly as shell commands, URLs, SQL, paths, or HTML;
- perform unbounded recursive self-correction;
- scrape authenticated platforms or bypass terms of service;
- clone identifiable voices or likenesses without documented consent;
- publish realistic synthetic media without evaluating disclosure requirements;
- add a new framework solely because it is fashionable;
- use destructive Git operations or force push;
- claim deployment or publication success without verified remote state.

---

# 8. VERIFIED REPOSITORY-SPECIFIC AUDIT TARGETS

Revalidate these before changing them, then resolve every confirmed blocker:

1. `apps/swarmx-api/Dockerfile` appears to contain ignore patterns rather than valid build instructions.
2. The root Docker ignore file appears named `dockerignore` rather than `.dockerignore`.
3. `.github/` appears to lack executable CI workflows.
4. The dashboard Docker build appears inconsistent with the workspace lockfile and Next.js standalone-output requirements.
5. Series state appears to rely on an in-memory TTL registry.
6. Dashboard code appears capable of embedding a write token through `NEXT_PUBLIC_SWARMX_VIDEO_API_TOKEN`.
7. Video and series writes appear to fail open when the token is absent.
8. Episode pre-production appears able to set `complete` despite failed mandatory quality checks.
9. The existing quality gate appears to omit or weaken:
   - audio coherence;
   - hook rewrite threshold;
   - script rebuild floor;
   - bounded correction;
   - exact character-seed preservation;
   - sound-signature alignment;
   - palette and camera continuity;
   - finale loop bridge;
   - scene numbering/count consistency;
   - platform uniqueness and limits.
10. Planning schemas appear not to strictly enforce roadmap count, contiguous numbering, payoff references, palette size, AI-seed word limit, structured virality mechanics, or solo-format semantics.
11. The generated series title may not persist as a first-class field.
12. Dedicated Series Engine tests appear absent.
13. active docs, model tags, hardware profiles, and revision labels appear inconsistent.
14. A developer-specific absolute path appears in dashboard behavior.

These are strong starting hypotheses, not permission to skip verification.

---

# 9. TARGET PRODUCT ARCHITECTURE

Implement a modular monolith with explicit bounded contexts before considering service extraction.

## 9.1 Required bounded contexts

1. **Workspace and Project**
2. **Brand and Audience**
3. **Research and Trend Intelligence**
4. **Concept Development**
5. **Series Planning**
6. **Episode Pre-Production**
7. **Asset Library and Provenance**
8. **Voice and Audio**
9. **Composition and Rendering**
10. **Quality and Compliance**
11. **Platform Packaging**
12. **Publishing**
13. **Analytics and Experiments**
14. **Workflow and Operations**
15. **Identity, Authorization, and Audit**

Keep boundaries visible in contracts, services, persistence, routes, events, metrics, and dashboard navigation.

## 9.2 Canonical entities

Create or refine versioned domain models for:

- `Workspace`
- `Project`
- `BrandKit`
- `AudiencePersona`
- `PlatformCapability`
- `TrendSnapshot`
- `ResearchSource`
- `ConceptCandidate`
- `ConceptTournament`
- `SeriesBrief`
- `SeriesPlan`
- `SeriesRegistry`
- `CharacterProfile`
- `WorldRegistry`
- `ViralityArchitecture`
- `EpisodeRoadmapEntry`
- `Episode`
- `EpisodeScript`
- `Scene`
- `StoryboardFrame`
- `ScenePromptSuite`
- `CinematicDirection`
- `AudioPlan`
- `VoiceProfile`
- `Asset`
- `AssetLicense`
- `AssetLineage`
- `VideoBlueprint`
- `RenderRecipe`
- `RenderJob`
- `RenderVariant`
- `SubtitleTrack`
- `QualityReport`
- `ComplianceReport`
- `Approval`
- `PublishPackage`
- `PublishAttempt`
- `PerformanceSnapshot`
- `Experiment`
- `LearningRecord`
- `AuditEvent`

Each persisted record must include:

- stable ID;
- schema version;
- created/updated timestamps;
- state;
- revision;
- parent lineage;
- configuration snapshot;
- prompt/template/model versions where relevant;
- actor or system source;
- idempotency key where relevant.

---

# 10. END-TO-END WORKFLOW DAG

Implement the product flow as a typed, resumable directed acyclic graph.

## 10.1 Canonical stages

1. `INTAKE_VALIDATE`
2. `BRAND_AUDIENCE_RESOLVE`
3. `PLATFORM_CAPABILITIES_RESOLVE`
4. `TREND_RESEARCH`
5. `CONCEPT_GENERATE`
6. `CONCEPT_TOURNAMENT`
7. `SERIES_PLAN`
8. `SERIES_PLAN_VALIDATE`
9. `EPISODE_SCRIPT`
10. `EPISODE_SCRIPT_VALIDATE`
11. `STORYBOARD`
12. `ASSET_PLAN`
13. `ASSET_GENERATE_OR_IMPORT`
14. `ASSET_VALIDATE`
15. `VOICE_GENERATE`
16. `AUDIO_DESIGN`
17. `COMPOSE`
18. `SUBTITLE_ALIGN`
19. `TECHNICAL_QC`
20. `CREATIVE_QC`
21. `CONTINUITY_QC`
22. `COMPLIANCE_QC`
23. `REVISION`
24. `HUMAN_REVIEW`
25. `PLATFORM_PACKAGE`
26. `PUBLISH_OR_EXPORT`
27. `REMOTE_PROCESSING_VERIFY`
28. `ANALYTICS_INGEST`
29. `LEARNING_UPDATE`

## 10.2 Stage contract

Every stage must define:

- typed input;
- typed output;
- prerequisites;
- capability requirements;
- deterministic validators;
- idempotency behavior;
- retry policy;
- timeout;
- cancellation behavior;
- persistence checkpoint;
- progress events;
- metrics;
- failure taxonomy;
- compensation or resume behavior;
- human-approval requirement;
- artifact lineage.

No stage may be represented solely by an unmanaged promise or transient memory state.

## 10.3 Queue and flow behavior

Use the existing BullMQ/Redis architecture where it is appropriate.

Required properties:

- atomic, idempotent jobs;
- stable unique job IDs;
- job flows for parent/child dependencies;
- explicit retryable versus non-retryable errors;
- bounded exponential backoff with jitter;
- platform/provider rate limiting;
- stalled-job recovery;
- graceful worker shutdown;
- deduplication;
- durable progress;
- safe auto-removal only after retention requirements are met;
- database remains authoritative for product state;
- queue metadata does not become the sole record of completion.

Do not introduce Temporal, Airflow, LangGraph, or another orchestration framework unless an ADR demonstrates a validated gap that BullMQ plus the existing runtime cannot address.

---

# 11. STRUCTURED MODEL-OUTPUT ARCHITECTURE

Use schema-constrained model generation wherever the installed Ollama/model combination supports structured output.

## 11.1 Required pattern

1. define a canonical schema;
2. request structured output;
3. parse;
4. validate deterministically;
5. reject unknown or unsafe values;
6. apply bounded repair only to failed fields;
7. persist validated output plus model/prompt metadata;
8. never use free-form prose as the authoritative state when a structured form exists.

## 11.2 Model invocation contract

Every invocation records:

- operator;
- canonical model tag;
- model digest/version if available;
- prompt-template version;
- input hash;
- output hash;
- start/end time;
- timeout;
- token or character counts where available;
- structured-validation result;
- repair attempts;
- pressure state;
- cancellation result.

Use Ollama keep-alive/model residency controls to protect constrained hardware. Never bypass the existing model lifecycle manager.

## 11.3 Tool authority

- creative agents may propose plans and artifacts;
- deterministic services validate and execute;
- agents cannot directly publish;
- agents cannot directly interpolate shell commands;
- network and filesystem tools are scoped;
- risky actions require explicit approval;
- external content is treated as potentially prompt-injecting.

---

# 12. RESEARCH AND TREND INTELLIGENCE

Create a source-aware, freshness-aware research subsystem.

## 12.1 Inputs

Support:

- user-provided references;
- approved public sources;
- official platform creative/trend tools where accessible;
- platform analytics;
- project history;
- uploaded brand and product materials;
- manual research notes.

Do not depend on unauthorized scraping.

## 12.2 Trend record

A `TrendSnapshot` must contain:

- source;
- retrieved/observed date;
- geography;
- language;
- niche;
- platform;
- trend type;
- evidence summary;
- confidence;
- expiry or freshness window;
- relevant creative mechanics;
- prohibited cloning notes;
- source URL or internal reference when safe;
- collection method.

## 12.3 Creative use of trends

Trends are inspiration signals, not templates to copy.

The system must:

- identify the underlying mechanic;
- adapt it to the user’s brand and story;
- assess saturation;
- assess production feasibility;
- avoid copyrighted imitation;
- avoid creator impersonation;
- explain what was adapted;
- preserve originality.

When current research is unavailable, label output `trend_unverified` rather than fabricating relevance.

---

# 13. BRAND, AUDIENCE, AND VISUAL DESIGN SYSTEM

## 13.1 BrandKit

Implement a versioned `BrandKit` containing:

- brand name;
- positioning;
- audience promise;
- tone and forbidden tones;
- color tokens;
- typography tokens;
- logo assets and placement rules;
- iconography;
- image treatment;
- caption style;
- motion principles;
- transition style;
- safe zones;
- watermark policy;
- sound signature;
- music characteristics;
- voice characteristics;
- prohibited claims;
- accessibility constraints;
- platform-specific overrides.

Validate contrast and mobile readability. Preserve intentional brand changes through versioning rather than mutating history.

## 13.2 AudiencePersona

Include:

- demographic range when relevant;
- psychographic needs;
- knowledge level;
- pain points;
- desired transformation;
- objections;
- language/locale;
- cultural context;
- platform behavior;
- accessibility needs;
- sensitive-topic boundaries.

Avoid manipulative targeting or unsupported personal inference.

## 13.3 VideoBlueprint template system

Create reusable, versioned templates that define:

- accepted content mode;
- scene slots;
- timeline;
- layout grid;
- text hierarchy;
- caption theme;
- transition rules;
- motion presets;
- asset slots;
- voice/music relationship;
- safe zones;
- CTA pattern;
- loop-ending behavior;
- supported durations;
- supported platform variants.

Starter blueprints should cover at least:

- narrator-led cinematic explainer;
- faceless B-roll story;
- kinetic-text insight;
- mystery/reveal series;
- educational mini-documentary;
- product or feature demonstration;
- motivational transformation;
- dialogue/character story where hardware permits.

Templates must be editable, previewable, testable, and brand-aware. They must not ship copied copyrighted material.

## 13.4 Design-system implementation

Use the existing dashboard stack and introduce:

- canonical design tokens;
- reusable primitives;
- complete loading, empty, error, degraded, success, and blocked states;
- Storybook or an equivalent isolated component environment;
- visual regression;
- accessibility checks;
- responsive behavior;
- reduced-motion behavior.

Avoid gratuitous redesign. Improve hierarchy and task completion first.

---

# 14. CREATIVE INTELLIGENCE AND CONCEPT TOURNAMENT

## 14.1 Candidate generation

Generate multiple genuinely distinct candidates rather than superficial rewrites.

Each candidate includes:

- premise;
- audience promise;
- central tension;
- novelty;
- emotional arc;
- format;
- production complexity;
- expected hook mechanism;
- visual identity;
- sound identity;
- platform fit;
- brand fit;
- trend evidence;
- risk notes.

## 14.2 Tournament

Score candidates with transparent dimensions:

- originality;
- clarity;
- audience relevance;
- brand fit;
- emotional potential;
- hook potential;
- retention structure;
- shareability;
- series extensibility;
- platform fit;
- production feasibility;
- rights/safety risk.

Do not collapse all scoring into a single opaque LLM opinion. Combine deterministic constraints with one or more bounded evaluators. Store scores, rationales, confidence, and selected candidate.

## 14.3 Variant strategy

For critical creative elements, support controlled variants:

- 3–5 hook variants;
- alternate opening visual;
- alternate CTA;
- alternate caption first line;
- alternate cover;
- alternate pacing or duration where the platform profile permits.

Variants must have stable IDs and lineage so observed performance can be attributed correctly.

---

# 15. SERIES ENGINE V2.1 — EXECUTABLE CONTRACT

Make every phase of the supplied Series Engine specification enforceable through canonical contracts, services, routes, persistence, UI, validators, and tests.

## 15.1 Series brief

Enforce:

- story/theme and core message;
- emotional journey;
- conflict type;
- audience;
- tone;
- series length 6–30;
- fixed episode duration;
- primary platform;
- recurring symbols;
- arc structure;
- explicit format:
  - character-led;
  - narrator-only;
  - faceless B-roll;
  - kinetic text.

For solo formats:

- character bible may be empty;
- do not invent on-camera characters;
- use a canonical narrator-only marker;
- do not require `aiPromptSeed`.

## 15.2 Character registry

Enforce:

- precise appearance;
- face details;
- outfit;
- voice;
- personality and contradiction;
- relationships;
- emotional arc;
- signature cues;
- speaking style;
- immutable AI seed ≤ 40 words;
- scene variation only after `// DELTA:`.

Any intentional progression must create a registry revision with the effective episode.

## 15.3 World registry

Enforce:

- locations;
- architecture;
- 3–5 valid colors;
- camera language;
- visual motifs;
- era and technology;
- tone grounding;
- exact sound signature;
- series color grade;
- safe-zone and typography relationship when text is part of the format.

## 15.4 Virality architecture

Replace unstructured prose with seven fields:

1. `curiosityGap`
2. `microRewardCadence`
3. `loyaltySignal`
4. `socialProofMoment`
5. `loopEnding`
6. `algorithmSignal`
7. `recencyLoop`

Persist and validate each field.

## 15.5 Roadmap

Validate:

- exact episode count;
- unique contiguous numbers;
- ordered entries;
- narrative advancement;
- new value per episode;
- no filler;
- continuity thread;
- Chekhov plant and valid later payoff;
- Episode 1 curiosity-gap plant;
- finale resolution;
- final bridge loops to Episode 1.

## 15.6 Episode script

Represent:

1. hook;
2. body;
3. emotional peak;
4. cliffhanger;
5. bridge.

Persist the timing contract:

- 15 s: 0–2 / 2–11 / 11–13 / 13–14 / 14–15;
- 30 s: 0–3 / 3–23 / 23–27 / 27–29 / 29–30;
- 45 s: 0–3 / 3–35 / 35–40 / 40–43 / 43–45;
- 60 s: 0–4 / 4–47 / 47–53 / 53–57 / 57–60.

Enforce:

- hook ≤ 18 words;
- complete blocklist;
- appropriate Episode 1, middle, and finale hook behavior;
- one dominant emotional peak;
- valid cliffhanger type;
- valid bridge type;
- finale loop;
- Chekhov alignment;
- no recap/filler;
- structured visual moments;
- scene count consistency.

## 15.7 Scene prompt suite

Every scene must contain all nine prompt types:

1. master;
2. character;
3. environment;
4. camera;
5. lighting;
6. motion;
7. style;
8. animation;
9. negative.

Enforce:

- `[episode.sceneIndex]` numbering;
- 1-based episode;
- 0-based scene;
- master-prompt length;
- exact seed phrases;
- narrator-only marker;
- registry palette;
- location/era/architecture;
- camera grammar;
- lighting vocabulary;
- static-animation fallback;
- duplicate-scene detection;
- explicit negative prompts;
- model/provider-specific adapter generation without mutating canonical intent.

## 15.8 Audio plan

Include:

- narration style;
- dialogue notes;
- music description;
- ambient bed;
- timed SFX;
- transitions;
- silence cues;
- exact sonic signature;
- sound suggestion;
- target loudness and peak policy;
- voice profile reference;
- consent/licensing state.

Add `AUDIO_COHERENCE` to the quality gate.

## 15.9 Platform assets

Generate exactly one valid set per selected platform with:

- title;
- SEO description;
- caption;
- hashtags;
- CTA;
- cover/thumbnail;
- pinned comment;
- subtitle instruction;
- sound suggestion;
- disclosure flags.

Apply limits from the versioned Platform Capability Registry, not stale constants embedded in prompts.

---

# 16. PLATFORM CAPABILITY REGISTRY

Create a canonical, versioned registry rather than hard-coding platform assumptions throughout the codebase.

## 16.1 Required fields

Each platform record includes:

- platform;
- registry schema version;
- specification version;
- verified date;
- source reference;
- supported aspect ratios;
- preferred aspect ratio;
- minimum/maximum duration;
- preferred duration range;
- resolution;
- frame-rate rules;
- codec/container rules;
- title/caption/description limits;
- hashtag behavior;
- cover rules;
- subtitle behavior;
- AI-disclosure rules;
- API availability;
- account requirements;
- OAuth scopes;
- draft/direct-publish support;
- audit/review restrictions;
- rate-limit notes;
- remote-processing states;
- analytics capabilities;
- stale-after policy.

## 16.2 Current baseline to verify during implementation

Treat the following only as a research baseline and revalidate against official documentation before release:

- YouTube Shorts may accept square or vertical videos up to three minutes.
- TikTok supports draft upload and direct posting, but unaudited direct-post clients have visibility restrictions.
- YouTube uploads from unverified API projects may be restricted to private.
- Instagram publishing requires eligible professional-account/API capabilities.
- TikTok, YouTube, and Meta require or support disclosure for relevant realistic altered or synthetic media.
- Instagram Reels accepts a wider ratio range, but 9:16 remains the primary full-screen production target.

If a capability record is stale:

- permit local export;
- permit manual review;
- block unattended direct publication;
- display the reason.

---

# 17. ASSET LIBRARY, RIGHTS, AND LINEAGE

Implement an asset system that distinguishes source, generated, transformed, and final assets.

## 17.1 Asset record

Include:

- content hash;
- MIME type;
- dimensions/duration;
- origin;
- source URL or local import reference;
- creator/provider;
- generation model/workflow;
- parent assets;
- prompt hash;
- license;
- allowed uses;
- attribution;
- consent;
- expiry;
- safety status;
- project scope;
- immutable source path;
- derived variants.

## 17.2 Storage

Use content-addressed storage or an equivalent deduplicated structure:

- immutable source artifacts;
- deterministic derived paths;
- atomic writes;
- hash verification;
- orphan cleanup;
- quota limits;
- backup/restore;
- no path traversal;
- no public exposure by default.

## 17.3 Rights gate

A final package cannot pass when:

- an asset has unknown rights and policy requires known rights;
- voice or likeness consent is absent;
- music use is unverified;
- attribution requirements cannot be met;
- a trademark or protected identity risk is unresolved;
- realistic AI disclosure was required but omitted.

---

# 18. GENERATIVE ASSET PROVIDERS

Create provider interfaces with capability discovery and explicit fallbacks.

## 18.1 ComfyUI

When enabled:

- store workflows as versioned JSON node graphs;
- validate against the supported workflow schema;
- record custom-node and model dependencies;
- preflight missing nodes/models;
- submit asynchronously;
- track prompt/job IDs;
- persist outputs and lineage;
- enforce timeouts and cancellation;
- never make it mandatory for the constrained default profile.

Provide curated workflow templates for supported asset types rather than arbitrary unreviewed workflows.

## 18.2 Image/video provider interface

Define capabilities such as:

- text-to-image;
- image-to-image;
- image-to-video;
- background generation;
- upscaling;
- interpolation;
- segmentation;
- face/character consistency;
- transparent background.

The planner must select only capabilities available in the active profile.

## 18.3 Character consistency

Use:

- canonical seed;
- reference-image set;
- wardrobe and expression deltas;
- deterministic provider parameters where possible;
- similarity checks;
- human review for material identity drift.

Do not claim perfect identity consistency from prompt text alone.

---

# 19. AUDIO AND VOICE ARCHITECTURE

## 19.1 Pluggable local TTS

Implement a `VoiceProvider` interface.

Required baseline:

- retain `espeak-ng` as a resilient low-quality fallback when already supported;
- evaluate a lightweight local neural TTS option such as Piper;
- optionally benchmark another small permissively licensed model such as Kokoro;
- choose defaults only after objective and subjective evaluation on constrained and standard profiles.

Benchmark:

- startup latency;
- per-minute synthesis time;
- peak memory;
- intelligibility;
- pronunciation;
- expressiveness;
- voice availability;
- licensing;
- repeated-request behavior.

For repeated local synthesis, use a persistent process/server when the selected engine benefits from avoiding per-request model reload.

## 19.2 Voice safety

- no unauthorized voice cloning;
- store consent and permitted purpose;
- label synthetic voice when required;
- prevent accidental cross-project voice use;
- allow pronunciation dictionaries;
- never expose raw credential or private voice assets.

## 19.3 Audio post-production

Use deterministic FFmpeg filters/services for:

- resampling;
- channel layout;
- noise reduction when configured;
- EQ;
- compression;
- dialogue ducking;
- fade;
- silence placement;
- peak limiting;
- loudness normalization;
- final muxing.

Where appropriate, use a measured/two-pass loudness workflow rather than a blind single-pass approximation.

## 19.4 Transcript and alignment

Optionally integrate a lightweight local speech-recognition/alignment adapter such as `whisper.cpp` for:

- transcript verification;
- subtitle timing;
- missing-word detection;
- pronunciation QA.

Keep it optional on the constrained profile.

---

# 20. COMPOSITION AND RENDERING

## 20.1 Deterministic baseline

FFmpeg remains the mandatory baseline for:

- image/video sequence composition;
- overlays;
- text and caption rendering;
- transitions;
- audio mixing;
- muxing;
- transcode;
- probes;
- technical QC;
- derivative exports.

No release path may depend solely on an opaque model-generated video.

## 20.2 Template-driven composition

Evaluate Remotion or an equivalent React-based composition layer only when it provides clear value for:

- reusable parameterized templates;
- live dashboard preview;
- typed compositions;
- complex kinetic typography;
- deterministic reusable animations.

Adopt it only through an ADR containing:

- capability gap;
- integration design;
- image and dependency impact;
- CPU render benchmark;
- memory benchmark;
- security implications;
- maintenance cost;
- fallback path;
- license review.

FFmpeg must remain the final validation/transcode authority.

## 20.3 RenderRecipe

Every render records:

- blueprint version;
- timeline;
- scenes;
- asset hashes;
- text;
- fonts by logical family, not bundled user font files;
- transitions;
- effect parameters;
- audio tracks;
- subtitle tracks;
- platform target;
- renderer version;
- command/specification hash;
- environment profile;
- output hashes.

Render operations must be idempotent for identical immutable inputs.

## 20.4 Technical media validation

Use FFprobe/FFmpeg and deterministic analyzers to check:

- container and streams;
- codec;
- dimensions;
- SAR/DAR;
- duration tolerance;
- frame rate;
- pixel format;
- color metadata where relevant;
- audio presence;
- sample rate;
- channel count;
- loudness;
- true/estimated peak where available;
- clipping;
- long unintended silence;
- black frames;
- freeze frames;
- malformed first/last frame;
- subtitle bounds;
- safe-zone violations;
- text overflow;
- file size;
- checksum.

A renderer return code of zero is insufficient proof of a valid deliverable.

---

# 21. SUBTITLE AND MOBILE-READABILITY SYSTEM

Implement subtitle themes as versioned brand-aware templates.

Validate:

- timing;
- no overlapping cues unless explicitly supported;
- maximum lines;
- maximum characters per line;
- reading speed;
- minimum on-screen duration;
- punctuation;
- speaker identification when needed;
- high contrast;
- safe zones;
- platform UI occlusion zones;
- no clipping;
- text scaling;
- reduced-motion compatibility for animated captions.

Generate:

- clean transcript;
- SRT/VTT;
- burned-in variant;
- editable caption timeline;
- confidence and review report.

Do not rely on auto-generated subtitles without verification.

---

# 22. QUALITY CERTIFICATION SYSTEM

Create independent, explainable quality domains.

## 22.1 Required categories

1. `STORY_INTEGRITY`
2. `CREATIVE_QUALITY`
3. `VISUAL_CONSISTENCY`
4. `AUDIO_COHERENCE`
5. `TECHNICAL_MEDIA`
6. `PLATFORM_FIT`
7. `ACCESSIBILITY`
8. `RIGHTS_AND_COMPLIANCE`
9. `PRODUCTION_READINESS`

## 22.2 Virality signal

Retain the Series Engine weighted signal:

- hook strength: 0.35;
- completion proxy: 0.25;
- shareability: 0.25;
- SEO/search alignment: 0.15.

Treat this as a predicted quality heuristic, not an observed performance fact.

Required threshold semantics:

- `hookStrength < 0.50`: reject/rewrite the hook;
- `overall < 0.55`: rebuild from script level;
- `0.55 <= overall < 0.65`: revise failed sections and rescore;
- `overall >= 0.65`: eligible only if all mandatory deterministic checks pass;
- `overall >= 0.70`: target.

## 22.3 Bounded revision

Default maximum: two automated revision attempts per stage.

Each attempt must record:

- failed checks;
- correction instructions;
- changed fields;
- immutable before/after snapshots;
- scorer versions;
- result;
- final disposition.

No unbounded loops.

## 22.4 Multimodal evaluation

An optional vision/audio model may assist with:

- scene relevance;
- visual drift;
- text readability;
- pacing;
- brand fit;
- audio intelligibility.

It must:

- run only when available;
- return structured evidence and confidence;
- never be the sole authority for technical or rights checks;
- never override deterministic failures;
- never silently upgrade a failed result.

## 22.5 Lifecycle semantics

Use explicit states, including:

- `draft`;
- `planning`;
- `needs_revision`;
- `blocked`;
- `approved`;
- `rendering`;
- `render_failed`;
- `quality_failed`;
- `review_required`;
- `ready_to_post`;
- `publishing`;
- `processing`;
- `published`;
- `publish_failed`;
- `archived`.

`complete` must not ambiguously mean “output exists.”

A failed gate blocks rendering or publication unless a privileged override includes actor, reason, timestamp, scope, and expiry where appropriate.

---

# 23. HUMAN-IN-THE-LOOP APPROVAL

Default policy:

- concept selection may be auto-selected but remains editable;
- series plan requires approval before bulk episode production unless the user explicitly enables trusted automation;
- final video requires review before external publication;
- direct publish requires explicit user intent and valid authorization;
- high-risk content always requires manual approval.

Provide:

- review queues;
- side-by-side variants;
- diff of revisions;
- time-coded comments;
- approve/reject/request-change;
- scoped bulk approval;
- audit history;
- preview of exact platform payload.

Do not hide automation behind a single irreversible button.

---

# 24. PLATFORM PACKAGING AND PUBLISHING

## 24.1 Draft-first strategy

Prefer:

1. local export;
2. platform draft/upload-for-edit;
3. direct publish only when account, app review, scopes, policy, and user authorization allow it.

## 24.2 Adapter contract

Each publisher adapter defines:

- capability discovery;
- OAuth/account requirements;
- token storage;
- media upload method;
- resumable/chunk behavior;
- metadata;
- disclosure fields;
- rate limits;
- idempotency;
- processing polling;
- retry taxonomy;
- deletion/correction behavior;
- privacy/visibility restrictions;
- analytics identifiers.

## 24.3 Publication state

Do not mark `published` when upload merely returned an ID.

Verify:

- remote media processing;
- final visibility;
- remote status;
- expected metadata;
- disclosure state;
- canonical URL/identifier when available.

Store sanitized provider responses.

## 24.4 Secrets

- no publisher token in browser code;
- use server-side encrypted storage or an established secret provider;
- support rotation and revocation;
- minimize scopes;
- never log tokens;
- isolate accounts by workspace/project;
- remove credentials from exports and backups unless explicitly encrypted.

---

# 25. ANALYTICS, EXPERIMENTS, AND LEARNING LOOP

## 25.1 Observed metrics

Ingest only metrics supported by the authorized platform adapter, such as:

- views;
- engaged views;
- average view duration;
- completion/retention;
- likes;
- comments;
- shares;
- saves when available;
- follower/subscriber conversion when available;
- traffic/search data when available.

Record retrieval time, metric definition, window, and source.

## 25.2 Predicted versus observed

Keep separate:

- predicted virality score;
- pre-publish quality scores;
- observed metrics;
- normalized performance;
- confidence and sample size.

Never present predictions as actual results.

## 25.3 Experiments

Support controlled experiments with:

- stable experiment ID;
- hypothesis;
- one primary changed variable;
- variant lineage;
- target platform/audience;
- start/end;
- success metric;
- sample-size warning;
- result;
- decision.

Avoid invalid cross-platform comparisons without normalization.

## 25.4 Learning records

The system may recommend updates to:

- hook patterns;
- blueprint selection;
- caption style;
- pacing;
- duration;
- audience assumptions;
- publication timing;
- visual treatment.

It must not silently self-modify production prompts or policies. Proposed learning changes require versioned approval and rollback.

---

# 26. PRODUCTIVITY AND CREATOR EXPERIENCE

Build for a high-frequency solo creator.

Required capabilities:

- first-run setup wizard;
- `doctor`/preflight command;
- project presets;
- BrandKit import;
- reusable audience personas;
- template browser;
- command palette;
- keyboard shortcuts;
- autosave;
- version history;
- duplicate/remix;
- bulk episode planning;
- bulk render/package with controlled concurrency;
- resume and retry;
- cancel;
- clear queue;
- compare variants;
- copy/export prompt packs;
- export complete publish bundle;
- notifications;
- recent projects;
- searchable asset library;
- time-coded review notes;
- status filters;
- actionable error recovery;
- sample/demo project.

Every long-running action must show:

- current stage;
- percent or stage progress;
- elapsed time;
- relevant resource state;
- safe cancel;
- retryability;
- next action.

---

# 27. DASHBOARD INFORMATION ARCHITECTURE

Evolve the existing dashboard rather than replacing it gratuitously.

Recommended workspace:

- **left rail:** projects, series, episodes, status;
- **top bar:** profile, capabilities, resource pressure, queue, environment;
- **center canvas:** player/storyboard/timeline/script depending on mode;
- **right inspector:** brand, scene, asset, audio, platform, and quality properties;
- **bottom activity panel:** jobs, logs, progress, failures, approvals.

Primary product areas:

1. Home / Production Queue
2. Projects
3. Brand Kits
4. Research
5. Series
6. Episode Studio
7. Assets
8. Templates
9. Publishing
10. Analytics
11. Settings / Capabilities
12. Operations / Diagnostics

Required state design:

- loading;
- empty;
- configured;
- degraded;
- offline;
- blocked;
- needs revision;
- rendering;
- review;
- ready;
- publishing;
- success;
- recoverable failure;
- fatal failure.

Accessibility target: WCAG 2.2 AA.

Implement:

- semantic structure;
- keyboard support;
- visible focus;
- correct form labels and errors;
- accessible dialogs;
- `aria-live` for asynchronous updates;
- progress semantics;
- reduced motion;
- contrast;
- zoom/responsive support;
- no color-only status;
- accessible captions and media controls.

Use Playwright accessibility and visual regression tests in a stable environment.

---

# 28. PERSISTENCE, RECOVERY, AND DATA INTEGRITY

Replace or wrap in-memory-only product state with durable local-first persistence.

Prefer existing repository patterns. Select SQLite or another embedded store through evidence and an ADR when necessary.

Required:

- migrations;
- schema version;
- transactions;
- atomic writes;
- revision/optimistic concurrency;
- foreign-key integrity;
- startup recovery;
- idempotency;
- duplicate suppression;
- event/audit log;
- retention;
- backup/restore;
- export/import;
- corruption detection;
- test fixtures.

Database state is authoritative. Redis/BullMQ is operational state.

On shutdown:

- stop accepting mutations;
- checkpoint work;
- drain/cancel workers safely;
- close publisher sessions;
- close SSE/WebSocket/PTY;
- close database and Redis;
- unload models when appropriate.

On restart:

- restore work;
- classify interrupted stages;
- resume only idempotent operations;
- require review for ambiguous external publish state;
- never duplicate publication.

---

# 29. API AND CONTRACT ENGINEERING

## 29.1 Canonical schemas

Use one authoritative schema path for:

- shared TypeScript types;
- JSON Schema/OpenAPI;
- Fastify request validation;
- response serialization;
- persisted record validation;
- dashboard form validation where practical.

Do not maintain independent copies that drift.

## 29.2 Fastify patterns

- validate synchronously with schemas;
- perform database and asynchronous authorization in hooks such as `preHandler`;
- define response schemas to prevent accidental data leakage;
- use consistent error envelopes;
- use request IDs;
- set body/output limits;
- implement graceful close hooks;
- validate all path, query, body, URL, and filename inputs;
- protect expensive routes with rate limits;
- sanitize all model/provider output.

## 29.3 Error envelope

Return:

- `code`;
- safe `message`;
- `requestId`;
- `retryable`;
- `stage`;
- `fieldErrors` when safe;
- `failedChecks` when relevant;
- `supportContext` without secrets.

Never return raw stack traces in production.

---

# 30. AUTHENTICATION, AUTHORIZATION, AND SECURITY

## 30.1 Browser/server boundary

- remove public API write tokens;
- use a same-origin BFF/server proxy or secure session;
- refuse unsafe production startup without authentication;
- keep read/write policies explicit;
- compare secrets safely;
- support rotation.

## 30.2 Authorization

Define permissions such as:

- view project;
- edit brief;
- approve plan;
- render;
- override gate;
- manage credentials;
- publish;
- delete;
- view analytics.

Even for a single-user local deployment, preserve an authorization boundary around external publication and credential management.

## 30.3 LLM and agent security

Address:

- prompt injection;
- insecure output handling;
- excessive agency;
- sensitive information disclosure;
- unsafe plugin/tool design;
- model denial of service;
- supply-chain risks;
- overreliance.

Use:

- tool allowlists;
- argument validation;
- output encoding;
- sandboxed execution;
- path/host allowlists;
- resource quotas;
- human approval;
- audit logs.

## 30.4 Web and media security

- allowlist CORS origins;
- enable CSP/Helmet based on actual architecture;
- validate redirects and callbacks;
- prevent SSRF;
- prevent path traversal;
- secure file downloads;
- scan or validate imported files;
- cap decompression and media-processing resources;
- treat subtitle and SVG/XML content as untrusted;
- never execute uploaded workflows/scripts without review.

---

# 31. OBSERVABILITY

Use OpenTelemetry-compatible traces, metrics, and logs where the repository architecture supports them.

## 31.1 Correlation

Propagate:

- request ID;
- workspace ID;
- project ID;
- series ID;
- episode ID;
- workflow ID;
- job ID;
- render ID;
- publish attempt ID;
- trace ID.

## 31.2 Traces

Instrument:

- model invocation;
- research adapter;
- planning pass;
- validation;
- revision;
- asset generation;
- voice generation;
- render;
- FFprobe/QC;
- package;
- upload;
- processing polling;
- analytics fetch.

## 31.3 Metrics

Use low-cardinality metrics for:

- queue depth;
- stage latency;
- stage failure;
- gate failures by check;
- revision count;
- model timeout/circuit state;
- memory pressure;
- persistence mode;
- render duration;
- QC failure;
- publish outcome;
- analytics retrieval;
- cache hit rate.

## 31.4 Health

Separate:

- liveness;
- readiness;
- detailed diagnostics.

Readiness must reflect configured mandatory capabilities. A process that is alive but cannot persist or render must not report fully ready.

---

# 32. BUILD, CONTAINERS, AND DEPLOYMENT

## 32.1 Docker

- replace invalid Dockerfiles;
- use multi-stage builds;
- use the pinned pnpm version;
- use the root workspace lockfile;
- optimize layer caching;
- use non-root runtime users;
- include only runtime dependencies;
- configure actual Next.js `output: "standalone"`;
- set monorepo tracing root when required;
- copy standalone/static/public outputs correctly;
- create a real `.dockerignore`;
- exclude secrets, local DBs, models, media, caches, `.git`, and editor state;
- do not exclude required manifests or lockfiles.

## 32.2 Compose

Validate:

- build contexts;
- service URLs;
- healthchecks;
- dependency health conditions;
- volumes;
- permissions;
- profiles;
- resource settings;
- localhost binding;
- secrets;
- startup order;
- shutdown;
- persistence.

Provide:

- constrained profile;
- standard profile;
- optional integrations profile.

## 32.3 First-run preflight

Implement or refine `swarmx doctor` to check:

- Python/Node/pnpm versions;
- Docker/Compose when selected;
- Ollama;
- canonical model tags;
- available RAM/disk;
- Redis;
- FFmpeg;
- FFprobe;
- TTS provider;
- optional ComfyUI;
- database migration;
- publisher credentials and capability status;
- port conflicts;
- write permissions.

Output exact corrective commands without exposing secrets.

## 32.4 Deployment modes

Document and test:

- native local;
- Docker Compose local;
- WSL2;
- optional remote single-host deployment.

Secure defaults:

- loopback bind;
- explicit reverse-proxy/TLS instructions for remote use;
- fail-closed write routes;
- no bundled production secrets.

---

# 33. CI/CD AND SUPPLY-CHAIN CONTROLS

Create executable GitHub Actions workflows with:

- least-privilege permissions;
- concurrency cancellation;
- pinned or controlled action versions;
- no unsafe `pull_request_target` execution of untrusted code;
- dependency caching;
- artifact retention;
- clean job separation.

Required gates:

- Python lint/type/test;
- shared TypeScript typecheck;
- API typecheck/build/test/regression;
- dashboard typecheck/lint/test/build;
- accessibility/visual smoke where stable;
- lockfile integrity;
- `docker compose config`;
- production image builds;
- secret scanning;
- dependency/security audit where network permits;
- migration validation;
- deterministic render/QC fixture;
- release only after mandatory checks.

Create an SBOM or equivalent dependency inventory for release artifacts where feasible.

---

# 34. TEST ARCHITECTURE

## 34.1 Contract tests

- domain schemas;
- platform registry;
- timing contract;
- virality weights;
- state machine;
- Operator mapping parity;
- persisted schema compatibility.

## 34.2 Service unit tests

- hook/blocklist/word limits;
- roadmap;
- Chekhov references;
- exact seed;
- sonic signature;
- palette/camera continuity;
- finale loop;
- platform metadata;
- quality thresholds;
- bounded revisions;
- idempotency;
- retry classification;
- rights gate;
- media validation;
- auth fail-closed;
- path and URL security.

## 34.3 API integration tests

- create/read/update/archive project;
- plan series;
- approve;
- pre-produce;
- revise;
- render;
- failed gate blocks render/publish;
- restart recovery;
- queue retry;
- SSE/WebSocket reconnect;
- protected mutations;
- rate limits;
- readiness/degraded state;
- idempotent publish request.

## 34.4 Dashboard tests

- onboarding;
- project creation;
- planning progress;
- quality grouping;
- failed/blocked states;
- approvals;
- variant comparison;
- accessibility;
- no browser secret;
- sanitized errors;
- polling visibility/backoff;
- responsive states.

## 34.5 Golden media fixture

Create a deterministic, rights-safe fixture that produces a short test video without requiring a 7B model or external service.

Validate:

- render completion;
- subtitles;
- FFprobe;
- loudness;
- expected duration/dimensions;
- output hash or tolerant structural properties;
- package manifest.

## 34.6 Optional integration tests

Gate behind explicit environment variables:

- Ollama structured generation;
- local neural TTS;
- ComfyUI;
- platform draft upload;
- analytics ingestion.

Mandatory CI must not require private credentials or installed large models.

---

# 35. DOCUMENTATION AND TEMPLATES

Update:

- root README;
- architecture;
- quick start;
- configuration;
- profiles;
- model/Operator map;
- creative workflow;
- Series Engine guide;
- BrandKit guide;
- template guide;
- asset and rights guide;
- audio/TTS guide;
- rendering/QC guide;
- publishing guide;
- analytics/experiments guide;
- backup/restore;
- operations;
- security;
- troubleshooting;
- API reference;
- release checklist;
- changelog.

Ship:

- `.env.example` without secrets;
- sample BrandKit;
- sample audience persona;
- sample Series Brief;
- sample platform registry;
- sample VideoBlueprints;
- deterministic demo project;
- test media/assets with clear rights;
- operator runbooks.

Archive or mark stale documentation unmistakably.

---

# 36. FRAMEWORK AND DEPENDENCY DECISION POLICY

Preserve the current stack by default.

A new dependency or framework requires a concise ADR covering:

- validated problem;
- alternatives;
- fit with current architecture;
- memory and CPU impact;
- build/image impact;
- security;
- maintenance;
- licensing;
- migration;
- rollback;
- benchmark;
- test strategy.

Specific guidance:

- keep BullMQ for job flows unless a demonstrated requirement exceeds it;
- use Ollama structured outputs rather than brittle text parsing when supported;
- use FFmpeg/FFprobe as deterministic media authority;
- treat ComfyUI as optional generative-asset infrastructure;
- treat Remotion as an optional templated-composition enhancement, not an assumed rewrite;
- use Storybook and Playwright when they improve design-system confidence;
- use OpenTelemetry conventions consistently rather than inventing unrelated telemetry formats.

---

# 37. MILESTONE EXECUTION ORDER

Proceed in this dependency order:

## M0 — Safety, inventory, and baseline

- Git state;
- instructions;
- dependency manifests;
- architecture;
- current tests;
- baseline commands;
- audit ledger.

## M1 — Reproducible build and secure startup

- Dockerfiles;
- `.dockerignore`;
- workspace installs;
- Compose;
- fail-closed authentication;
- no browser secret;
- preflight.

## M2 — Canonical contracts and persistence

- shared schemas;
- platform registry;
- domain entities;
- migrations;
- durable lifecycle.

## M3 — Workflow and Series Engine enforcement

- DAG;
- structured outputs;
- validators;
- revision state machine;
- exact quality semantics.

## M4 — Asset/audio/render pipeline

- asset lineage;
- provider adapters;
- TTS;
- FFmpeg composition;
- subtitles;
- technical QC.

## M5 — Creative, brand, and template system

- BrandKit;
- audience;
- blueprints;
- concept tournament;
- variant workflow;
- continuity.

## M6 — Dashboard creator studio

- onboarding;
- episode studio;
- review;
- productivity;
- accessibility;
- diagnostics.

## M7 — Publishing and compliance

- capability discovery;
- draft-first adapters;
- rights/disclosure;
- remote processing verification.

## M8 — Analytics and learning

- metrics ingestion;
- experiments;
- recommendations;
- approved learning versions.

## M9 — Tests, observability, documentation, and CI

- complete test pyramid;
- traces/metrics/logs;
- docs/templates;
- CI/release gates.

## M10 — Golden-path certification and Git delivery

- clean-clone validation;
- sample production;
- image builds;
- release report;
- safe commit and push.

Do not prioritize cosmetic work over P0/P1 correctness.

---

# 38. GOLDEN-PATH ACCEPTANCE SCENARIOS

## Scenario A — Constrained narrator-only production

On an approximately 8 GB CPU-only host:

1. run preflight;
2. create project and BrandKit;
3. select a narrator-led blueprint;
4. enter a brief;
5. generate and approve a six-episode series plan;
6. pre-produce one 30-second episode;
7. use local template assets or rights-safe imports;
8. generate narration through the configured local TTS or explicit fallback;
9. compose with FFmpeg;
10. generate subtitles;
11. pass all mandatory gates;
12. export a complete TikTok/Reels/Shorts package;
13. restart services;
14. verify state and artifact recovery.

No paid API or GPU is required.

## Scenario B — Character-led standard profile

On a standard CPU host:

- use character/world registry;
- optional ComfyUI asset workflow;
- validate character consistency;
- render;
- review;
- produce platform variants.

Missing optional models/nodes must be reported before execution.

## Scenario C — Gate failure and revision

- generate a hook below threshold;
- prove it cannot become ready;
- run bounded revision;
- retain before/after;
- pass or remain blocked;
- prove render/publish authorization follows state.

## Scenario D — Restart during work

- interrupt planning/rendering;
- restart;
- restore state;
- resume safely or mark review-required;
- prove no duplicated job or publication.

## Scenario E — Draft publication

- discover account/app capabilities;
- preview payload;
- approve;
- upload as draft/private when required;
- poll processing;
- record remote state;
- never claim public publication when restricted.

## Scenario F — Analytics loop

- ingest authorized metrics;
- link to exact variant;
- separate predicted from observed;
- generate a recommendation;
- require approval before changing template/prompt policy.

---

# 39. RELEASE VALIDATION

Use the pinned repository toolchain.

Minimum sequence:

```bash
git diff --check
git status --short

python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip wheel setuptools
python -m pip install -e '.[dev]'
python -m pip install -r requirements.txt
python -m ruff check .
python -m mypy src
python -m pytest

corepack enable
corepack prepare pnpm@12.6.0 --activate
pnpm install --frozen-lockfile
pnpm --filter @swarmx/types typecheck
pnpm --filter @swarmx/api typecheck
pnpm --filter @swarmx/api build
pnpm --filter @swarmx/api test
pnpm --filter @swarmx/api run test:regression
pnpm --filter @swarmx/dashboard typecheck
pnpm --filter @swarmx/dashboard lint
pnpm --filter @swarmx/dashboard test
pnpm --filter @swarmx/dashboard build

docker compose config
docker build -f Dockerfile.python -t swarmx-python:release .
docker build -f apps/swarmx-api/Dockerfile -t swarmx-api:release .
docker build -f apps/swarmx-dashboard/Dockerfile -t swarmx-dashboard:release .
```

Also run:

- migration up/down or equivalent compatibility test;
- golden media fixture;
- FFprobe/QC validation;
- accessibility smoke;
- secret scan;
- dependency audit where network permits;
- native and Compose startup smoke;
- restart recovery;
- constrained-profile scenario;
- publishing adapter contract tests.

For every command record:

- command;
- environment;
- exit code;
- elapsed time;
- result;
- relevant artifact/log;
- blocker classification.

Never omit failures.

---

# 40. RELEASE CERTIFICATION LEVELS

Use exact certification language:

## `CODE_VALIDATED`

- static checks and tests pass;
- runtime integrations not fully exercised.

## `LOCAL_PRODUCTION_VALIDATED`

- native golden path passes;
- durable state, render, QC, and export pass.

## `CONTAINER_VALIDATED`

- production images and Compose golden path pass.

## `PUBLISHING_VALIDATED`

- at least one authorized draft/direct adapter passes remote upload and processing verification.

## `FULL_RELEASE_CERTIFIED`

- all mandatory local/container gates pass;
- required documentation and CI pass;
- selected publishing modes validated;
- residual optional integrations clearly scoped.

Do not use “production-ready” without stating the supported level.

---

# 41. GIT DELIVERY

After mandatory gates pass:

1. inspect diff;
2. remove secrets, databases, generated media, caches, and unrelated churn;
3. update changelog/version;
4. create coherent conventional commits;
5. fetch;
6. reconcile safely;
7. never force push;
8. push only the confirmed branch/ref;
9. report actual branch, commit hashes, remote, and status.

When push is blocked, provide the exact remaining command and do not claim success.

---

# 42. REQUIRED FINAL RESPONSE

Return:

## A. Executive result

- certification level;
- golden-path status;
- what is operational;
- what is degraded or optional.

## B. Baseline and audit

- starting state;
- toolchain;
- findings by severity;
- evidence;
- architecture conflicts.

## C. Architecture decisions

For each major decision:

- problem;
- chosen approach;
- alternatives;
- reason;
- trade-off;
- benchmark/evidence;
- ADR path.

## D. Implemented changes

Group by:

- build/deployment;
- contracts/persistence;
- workflow/agents;
- Series Engine;
- brand/templates;
- assets/audio/rendering;
- quality/compliance;
- dashboard;
- publishing;
- analytics;
- security;
- observability;
- tests;
- docs.

List exact files.

## E. Product-contract coverage matrix

Map every Series Engine V2.1 phase and Creative Video Factory stage to:

- schema;
- service;
- persistence;
- route/event;
- UI;
- validator;
- test;
- status.

## F. Platform capability matrix

For each selected platform:

- registry verified date;
- supported output;
- upload mode;
- review/audit restrictions;
- disclosure;
- tested status.

## G. Validation matrix

- command;
- exit code;
- result;
- evidence;
- blocker.

## H. Produced demo artifacts

- project/series/episode IDs;
- output files;
- QC report;
- package manifest;
- screenshots or previews where available.

## I. Residual risks

- blocker;
- non-blocking limitation;
- optional integration;
- external account requirement;
- future recommendation.

## J. Git delivery

- branch;
- commits;
- push;
- final status.

Do not end with an unsupported superlative.

---

# 43. DEFINITION OF DONE

The directive is complete only when:

- clean-clone setup is reproducible;
- Dockerfiles and `.dockerignore` are correct;
- Compose resolves and starts safely;
- production writes fail closed;
- no secret reaches the browser;
- domain state is durable;
- restart recovery works;
- Series Engine V2.1 is enforced structurally and deterministically;
- quality failure cannot become ready;
- bounded revision is implemented;
- BrandKit, audience, and blueprint systems exist;
- platform rules are versioned and freshness-aware;
- at least one constrained-profile golden path produces a real, non-stub video;
- subtitles, audio, technical QC, creative QC, and compliance reports exist;
- every final asset has lineage and rights state;
- ready-to-post packages are complete;
- direct publishing is draft-first and approval-bound;
- remote processing is verified before publication success;
- analytics distinguish predicted and observed signals;
- learning changes are versioned and approved;
- dashboard supports the complete creator workflow;
- accessibility target is tested;
- observability correlates end-to-end work;
- dedicated tests and CI enforce the release;
- active documentation matches reality;
- final diff is clean and safe;
- commit/push is reported truthfully.

Proceed until this definition is met or a concrete external limitation prevents a specific optional verification. Complete every in-repository task that does not depend on that limitation, preserve a runnable state, and report the exact gap.
