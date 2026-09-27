# SWARMXQ CREATIVE VIDEO FACTORY — CODEX PRODUCTION CLOSEOUT DIRECTIVE V3

## Evidence-Driven Integration, Local Voice Upgrade, Visual Production Quality, Hardware Safety, Release Certification, and Safe Delivery

**Execution mode:** autonomous repository implementation  
**Primary repository:** `Scardubu/SwarmXQ`  
**Target:** convert the current partially completed Creative Video Factory into a reproducible, hardware-safe system that produces genuinely usable short-form video packages rather than technically valid demo renders.

---

# 0. ROLE AND OPERATING CONTRACT

You are operating inside the SwarmXQ repository as a coordinated senior engineering authority combining:

- Principal Staff Software Engineer;
- AI systems and autonomous-agent architect;
- local Ollama runtime and model-lifecycle engineer;
- Fastify, TypeScript, Next.js, React, and Python engineer;
- video pipeline, FFmpeg, FFprobe, audio, subtitle, and media-QC engineer;
- local neural TTS and speech-processing engineer;
- product designer, motion-system architect, and accessibility reviewer;
- workflow, persistence, queueing, recovery, and observability engineer;
- security, rights, provenance, and release engineer;
- short-form creative director and creator-workflow designer.

This is an implementation session, not a prompt-writing exercise inside the repository.

Inspect the actual worktree, current instructions, code, tests, runtime, attached baseline video, and active documentation. Apply only evidence-backed changes. Do not stop at recommendations, mockups, pseudocode, or architecture prose.

## 0.1 Core behavior

You must:

1. establish the verified current baseline;
2. preserve all systems already proven complete;
3. identify the smallest remaining production blockers;
4. implement those blockers in dependency order;
5. validate each milestone before continuing;
6. generate and certify an improved real video artifact;
7. update active documentation to match executable reality;
8. commit and push only after applicable release gates pass.

## 0.2 Stop conditions

Request explicit confirmation only before:

- destructive data deletion;
- schema or persisted-state migration that cannot be safely reversed;
- force push or history rewrite;
- external publication;
- use of paid, quota-consuming, or credentialed third-party services beyond a bounded approved test;
- voice or likeness cloning;
- installation requiring interactive administrator credentials;
- changing a license model or distribution strategy.

Do not request confirmation for normal inspection, reversible edits, local tests, local builds, bounded public documentation lookup, or generation of local test artifacts.

## 0.3 Truthfulness

Never claim:

- a test passed when it was not executed successfully;
- a render is production-ready merely because FFmpeg returned exit code zero;
- a generated placeholder or smoke-test file is `READY_TO_POST`;
- a provider is available merely because configuration exists;
- publication succeeded before remote processing and visibility are verified;
- a model, library, platform capability, or license is current without checking its authoritative source;
- predicted virality is observed performance.

---

# 1. INSTRUCTION DISCOVERY AND CONFLICT HANDLING

## 1.1 Mandatory discovery

Before editing:

```bash
git status --short
git branch --show-current
git remote -v
git log --oneline --decorate -12
git diff --stat
git diff --check
find .. -name AGENTS.md -o -name CLAUDE.md -o -name NEXUS.md
```

Read every `AGENTS.md` applicable to a file before modifying that file.

Read, when present:

- root `AGENTS.md`;
- root `CLAUDE.md`;
- root `NEXUS.md`;
- relevant nested `AGENTS.md` files;
- `.agents/skills/*/SKILL.md`;
- applicable files under `skills/`;
- active architecture, release, video, startup, model, and operator documentation.

## 1.2 Missing-instruction rule

Do not invent or pretend to read a missing file.

The supplied archive must be checked for a known instruction-path contradiction:

- root guidance may reference `NEXUS.md` even when it is absent;
- root guidance may reference `.ai/skills/` while the actual repository uses `.agents/skills/` and `skills/`.

When confirmed:

1. record the conflict in the audit ledger;
2. use the instruction files that actually exist;
3. correct the stale path references;
4. create a new routing document only when it adds durable value and does not duplicate existing guidance.

## 1.3 Source-of-truth precedence

Resolve contradictions in this order:

1. security, data integrity, and hardware safety;
2. verified executable behavior;
3. passing contract and regression tests;
4. canonical shared schemas and persisted-state contracts;
5. canonical model/operator registry;
6. active runtime and deployment configuration;
7. current official dependency and platform documentation;
8. active repository instructions;
9. release-status documents;
10. historical prompts, comments, and archived documentation.

Record each material conflict with:

- source A;
- source B;
- chosen authority;
- evidence;
- affected paths;
- migration or documentation action.

---

# 2. VERIFIED BASELINE TO REVALIDATE

Treat the following as high-confidence observations from the supplied archive, not as permission to skip inspection.

## 2.1 Current stack

Revalidate from lockfiles and package manifests:

- root package version around `2026.6.0`;
- `pnpm@12.6.0`;
- Node.js requirement of at least 22 for the API;
- Fastify 5 in `apps/swarmx-api`;
- Next.js 16.2.x and React 19.2.x in `apps/swarmx-dashboard`;
- shared contracts in `packages/swarmx-types`;
- Python runtime and orchestration packages under the existing Python tree.

Do not downgrade the current frontend or rewrite it to an older Next.js/React stack merely because older prompts mention one.

## 2.2 Systems already substantially implemented

Revalidate and preserve when working:

- server-side dashboard proxy for protected video writes;
- fail-closed production mutations;
- local durable snapshots and append-only event journals;
- API startup hydration;
- typed Creative Factory contracts and workflow definitions;
- series and workflow routes;
- explicit failed quality-gate lifecycle states;
- `READY_TO_POST` bundle certification;
- separated predicted and observed analytics;
- dashboard Creative Factory surfaces;
- executable CI workflow;
- API, dashboard, Python, series, video, and factory tests;
- current model lifecycle, pressure, timeout, and reasoning-sanitization boundaries.

Do not rebuild these systems unless current execution proves a defect.

## 2.3 Known contradictions to verify

Verify and close the following:

1. The supplied host description in root guidance may claim `16 GB RAM` and `WSL2`, while the actual target host may be an approximately `8 GB`, CPU-only Linux system.
2. Compose may default `OLLAMA_MAX_LOADED_MODELS=2`, which is not safe as a universal default for an 8 GB profile.
3. Root and app ignore files may be named `dockerignore` instead of `.dockerignore`, despite release documentation claiming the issue is fixed.
4. Release documentation may claim a corrected state that does not match archive filenames or executable configuration.
5. The Makefile may lack one canonical complete release-verification target.
6. The baseline FFmpeg renderer may still be a static text-card smoke renderer with `espeak-ng`, not a production creative renderer.
7. Voice choices may map only to speech rate rather than real provider and voice identities.

A documentation claim does not close an executable defect.

---

# 3. HARDWARE-FIRST RUNTIME POLICY

## 3.1 Probe before configuration

Before changing Ollama or worker settings, capture:

```bash
uname -a
cat /etc/os-release
free -h
swapon --show
nproc
lscpu
lsblk
ollama --version
curl -fsS http://127.0.0.1:11434/api/version
curl -fsS http://127.0.0.1:11434/api/ps
ollama list
```

Record:

- physical RAM;
- currently available RAM;
- swap and zram;
- CPU cores and instruction set;
- operating system and whether WSL is actually in use;
- Ollama version;
- model sizes;
- loaded-model residency;
- idle and active memory pressure.

Do not copy a previous machine profile into current production configuration.

## 3.2 Canonical profiles

Create one typed canonical source for runtime profiles. At minimum:

### `constrained_cpu_8gb`

- approximately 8 GB physical RAM;
- CPU-only Linux or WSL;
- `OLLAMA_NUM_PARALLEL=1`;
- `OLLAMA_MAX_LOADED_MODELS=1` by default;
- `OLLAMA_KEEP_ALIVE=0` unless a measured stage-specific exception is justified;
- one heavyweight model resident at a time;
- no startup preloading of a heavyweight model;
- one heavy queue stage at a time;
- deterministic FFmpeg composition as the baseline;
- local TTS must not overlap heavyweight LLM inference when pressure is unsafe;
- optional image/video generation disabled by default;
- bounded contexts, output, retries, and subprocess memory;
- explicit pressure-based admission and cancellation.

### `standard_cpu_16gb`

- approximately 16 GB physical RAM;
- `OLLAMA_NUM_PARALLEL=1` by default;
- at most one 7B-class model actively inferring;
- a second lightweight resident model permitted only after measured proof;
- optional richer TTS and asset tooling after preflight;
- conservative queue and renderer concurrency.

### `accelerated_optional`

- optional GPU or remote adapters;
- never required for the default release;
- isolated behind capabilities and explicit configuration;
- complete local fallback preserved.

## 3.3 KV cache and attention policy

Do not blindly enable flash attention or change the KV cache type.

Benchmark the current safe `f16` policy against `q8_0` only when the installed Ollama version and active models support it. Compare:

- startup success;
- crash or corruption behavior;
- peak RSS and available memory;
- prompt-processing latency;
- generation latency;
- output correctness and structured-output validity;
- repeated-run stability.

Adopt `q8_0` only when it materially improves constrained-host safety without a reliability regression. Preserve `f16` when it is the verified stable choice.

Speculative decoding, continuous batching, and extra loaded models are optional optimizations. Do not enable them without repository support, version support, and measured benefit on the actual host.

## 3.4 Pressure invariants

Preserve the repository’s canonical pressure controls unless measurements justify a tested migration:

- SINGLE-7B safety;
- `OLLAMA_NUM_PARALLEL=1` on constrained CPU;
- bounded active jobs;
- critical-memory cutoff;
- abortable model calls;
- explicit model unload;
- no overlapping heavy LLM, neural TTS, and high-cost render stages when memory is unsafe.

Add tests proving profile resolution and unsafe-setting rejection.

---

# 4. BASELINE VIDEO AUDIT CONTRACT

Treat the supplied `video_first-video-final.mp4` as a required regression input.

Do not commit the user-provided video unless repository policy, rights, and size explicitly permit it. It may be copied to a temporary test workspace.

## 4.1 Required inspection

Run and persist a sanitized QC report using:

- FFprobe stream/container inspection;
- FFmpeg `ebur128` or equivalent loudness measurement;
- silence detection;
- black-frame analysis;
- freeze/static-frame analysis;
- contact sheet or sampled-frame montage;
- first/last-frame extraction;
- subtitle-stream and burned-caption inspection;
- aspect ratio, dimensions, frame rate, pixel format, duration, and bitrate;
- transcript/script comparison when source text exists;
- render-manifest and lineage comparison when available.

## 4.2 Current baseline finding to revalidate

The supplied video appears technically decodable and platform-shaped, but visually behaves like a smoke render:

- 15 seconds;
- 720×1280, 9:16, 30 fps;
- H.264 plus AAC;
- low-complexity dark background;
- centered static text cards;
- long static intervals;
- minimal motion beyond fades and a progress bar;
- synthetic narration at low sample rate;
- very limited audio dynamics;
- visible quote and sentence-boundary artifacts in card copy;
- no meaningful B-roll, branded illustration, visual storytelling, or scene-level composition.

The baseline must be classified as:

```text
TECHNICALLY_VALID
CREATIVE_REVIEW_REQUIRED
NOT_READY_TO_POST
```

Do not mark it `READY_TO_POST` merely because it has valid streams.

## 4.3 Template-aware QC

Naive `blackdetect` and `freezedetect` can misclassify an intentional dark, static text template. Correct this without weakening quality gates.

Implement template-aware analysis:

- distinguish a planned dark background from a blank or missing foreground;
- distinguish a deliberate static hold from an accidental frozen render;
- calculate foreground/text/graphic presence from known render geometry where possible;
- validate planned motion events against the blueprint timeline;
- enforce template-specific maximum static intervals;
- enforce minimum visual-change cadence for kinetic or cinematic templates;
- record raw detector output and interpreted result separately;
- never let an LLM override a deterministic corrupt-stream or missing-audio failure.

---

# 5. PRODUCTION CERTIFICATION TIERS

Replace binary “render succeeded” thinking with explicit certification levels:

1. `RENDER_FAILED`
   - no valid output or invalid mandatory stream.

2. `TECHNICALLY_VALID`
   - valid container, streams, duration, dimensions, and basic audio;
   - may still be visually generic, static, inaccessible, unlicensed, or creatively weak.

3. `CREATIVE_REVIEW_REQUIRED`
   - technical validation passes;
   - one or more creative, visual, audio, continuity, accessibility, or rights requirements remain unresolved.

4. `PRODUCTION_PACK_VALID`
   - script, storyboard, assets, voice, subtitles, manifest, and platform package exist;
   - human review or publication authorization may remain.

5. `READY_TO_POST`
   - all mandatory deterministic, creative, accessibility, rights, provenance, and platform gates pass;
   - no placeholders;
   - exact package is approved for manual upload or authorized draft publication.

6. `PUBLISHED_VERIFIED`
   - remote processing, final metadata, visibility, disclosure, and canonical identifier are verified.

All lifecycle state transitions must be typed, persisted, observable, and tested.

---

# 6. VOICE AND AUDIO UPGRADE

## 6.1 `VoiceProvider` architecture

Replace direct renderer ownership of `espeak-ng` with a provider interface.

Minimum contract:

```ts
interface VoiceProvider {
  id: string;
  probe(): Promise<VoiceCapability>;
  listVoices(locale?: string): Promise<VoiceDescriptor[]>;
  synthesize(request: VoiceSynthesisRequest, signal: AbortSignal): Promise<VoiceArtifact>;
  health(): Promise<ProviderHealth>;
}
```

The request and artifact must include:

- provider and version;
- voice ID and display name;
- locale;
- voice/model source and license metadata;
- consent requirement and status;
- text hash;
- normalized text;
- pronunciation dictionary version;
- speaking-rate/prosody controls;
- sentence-pause controls;
- requested and actual sample rate;
- channels;
- duration;
- peak and loudness measurements;
- output hash;
- generation latency;
- peak process memory when measurable;
- fallback reason;
- lineage.

## 6.2 Provider order

Implement capability-based selection, not silent substitution:

1. **Local neural provider selected by benchmark**
   - evaluate Piper as a constrained-profile candidate;
   - evaluate Kokoro as an optional candidate when its runtime fits the host;
   - run each as an isolated local adapter or service when that improves lifecycle, licensing separation, and repeat-request performance.

2. **`espeak-ng` fallback**
   - retain as a reliable emergency and test fallback;
   - label its quality tier honestly;
   - do not present rate presets as distinct neural voices.

3. **silent-audio fallback**
   - permitted only for explicit technical fixtures;
   - never eligible for `PRODUCTION_PACK_VALID` or `READY_TO_POST` when narration is required.

## 6.3 Selection benchmark

Create a deterministic benchmark corpus containing:

- short hook;
- numbers and abbreviations;
- punctuation and multi-sentence pacing;
- project and product names;
- difficult pronunciation entries;
- selected English locale variants;
- one 15-second and one 30-second narration target.

Measure:

- cold-start time;
- warm repeated-request time;
- real-time factor;
- peak RSS;
- output sample rate;
- intelligibility;
- pronunciation accuracy;
- naturalness;
- expressiveness;
- timing consistency;
- failure recovery;
- installation size;
- dependency and voice-model licenses.

The default provider must be selected from measured evidence, not popularity.

## 6.4 Persistent local service

When a provider reloads its model on every CLI call, prefer a supervised local service or persistent worker with:

- loopback-only binding;
- health and readiness endpoints;
- bounded request size;
- one synthesis job at a time on constrained hardware;
- idle unload or process shutdown;
- cancellation and timeout;
- startup memory preflight;
- no browser access;
- no arbitrary local file paths;
- structured logs without source text unless debug mode is explicitly enabled.

## 6.5 Script-to-speech preparation

Before synthesis:

- remove stray unmatched quotation marks;
- reject malformed script fragments;
- preserve deliberate punctuation;
- split by semantic sentence boundaries;
- generate pronunciation hints from an approved dictionary;
- prevent raw LLM markup from reaching TTS;
- preserve the approved script as source of truth;
- store normalized text as a derived artifact;
- prohibit unauthorized voice cloning.

## 6.6 Audio post-production

Create a deterministic audio-mastering pipeline using FFmpeg:

- resample to the project master sample rate;
- normalize channel layout;
- remove unwanted DC offset or noise only when measured and configured;
- corrective EQ where justified;
- gentle speech compression;
- de-essing only when supported and measured;
- explicit silence placement;
- music and ambience ducking;
- fades and scene transitions;
- true-peak limiting;
- measured loudness normalization;
- final muxing;
- post-mux measurement.

Keep target loudness, peak, sample rate, and channel policy in a versioned audio profile rather than scattering constants through render code.

## 6.7 Transcript verification

Add an optional local ASR/alignment adapter, such as `whisper.cpp`, for:

- synthesized narration transcription;
- expected-versus-observed word comparison;
- missing or substituted word detection;
- subtitle alignment assistance;
- pronunciation QA.

It must remain optional on the constrained profile and may not become a mandatory CI dependency.

---

# 7. FREE AND LOCAL ASSET INTEGRATION

## 7.1 Provider abstraction

Implement a server-side `AssetSourceProvider` contract with capability discovery, rate limits, caching, license metadata, and explicit degraded states.

Minimum providers:

### A. bundled rights-safe local fixtures

- mandatory and network-free;
- usable in CI and the deterministic golden path;
- include gradients, patterns, icons, sample illustrations, and short media fixtures with clear rights;
- no copied commercial branding or copyrighted character assets.

### B. Pexels adapter

- optional;
- server-side key only;
- bounded search and download;
- response caching;
- author and platform attribution retained;
- original landing URL retained;
- API errors and quota exhaustion exposed as degraded state;
- no direct browser key or provider call.

### C. Openverse adapter

- optional;
- retain creator, source, license, license version, license URL, attribution, and landing URL;
- independently verify license and source terms before production certification;
- block unresolved or incompatible rights;
- do not scrape underlying hosts.

### D. manual import

- support local user-selected assets;
- require declared source and rights state;
- hash and inspect files;
- validate media and prevent path traversal;
- mark unknown rights as review-required.

Do not make Freesound, Pixabay music, or another source a default production dependency without reviewing API and commercial-use terms, attribution, and Content ID risk.

## 7.2 Rights and provenance

Every external or generated asset must record:

- content hash;
- source provider;
- creator;
- source and landing URLs;
- retrieved date;
- license and version;
- license URL;
- attribution text;
- permitted transformations and uses;
- project scope;
- consent state where applicable;
- parent asset;
- transformation history;
- review status;
- expiry or revalidation date where relevant.

Unknown rights block `READY_TO_POST` when the asset is required.

## 7.3 Caching and quota safety

- cache search metadata and downloaded files according to provider terms;
- use deterministic content-addressed paths;
- deduplicate downloads;
- cap file size and duration;
- verify MIME type from bytes;
- use bounded redirects and host allowlists;
- do not bypass rate limits;
- never require external providers for mandatory CI.

---

# 8. VISUAL BLUEPRINT AND RENDERING UPGRADE

The current FFmpeg renderer must remain as a deterministic smoke fallback, but it must not be the only production renderer.

## 8.1 Separate smoke and production renderers

Create explicit renderer capability tiers:

- `ffmpeg_text_smoke` — fast deterministic technical fixture;
- `ffmpeg_kinetic_text` — production-capable kinetic typography;
- `ffmpeg_faceless_broll` — stock/local-asset narrator-led composition;
- `ffmpeg_cinematic_explainer` — layered image/video, titles, diagrams, and brand motion;
- optional renderer adapters only after ADR and benchmark.

The system must never certify `ffmpeg_text_smoke` as production-ready unless a deliberately minimal template contract explicitly permits it and all creative gates still pass.

## 8.2 Typed `VideoBlueprint`

Each blueprint must define:

- accepted content format;
- supported durations and platform variants;
- scene count range;
- timeline slots;
- layer stack;
- asset requirements;
- fallback assets;
- layout grid;
- title, body, and caption hierarchy;
- font families by logical name;
- color and contrast tokens;
- motion presets;
- transition rules;
- camera or Ken Burns behavior;
- maximum static interval;
- minimum meaningful visual-event cadence;
- safe zones and platform occlusion zones;
- subtitle style;
- CTA treatment;
- audio relationship;
- loop-ending behavior;
- performance cost tier;
- accessibility constraints;
- certification eligibility.

## 8.3 Minimum starter templates

Ship at least four rights-safe, editable, deterministic templates:

1. `kinetic_text_insight`
   - animated text hierarchy;
   - keyword emphasis;
   - background motion or texture;
   - scene transitions;
   - no 2–3 second fully static card holds unless intentionally specified.

2. `faceless_broll_story`
   - local or licensed B-roll;
   - crop/pan/zoom rules;
   - coherent color treatment;
   - captions and narration;
   - fallback to illustrated or abstract assets.

3. `educational_micro_documentary`
   - title, evidence, visual examples, simple diagrams, and summary;
   - clear provenance for sourced assets.

4. `narrator_cinematic_explainer`
   - layered images or clips;
   - controlled motion;
   - branded transitions;
   - emotional visual progression.

## 8.4 FFmpeg render construction

Prefer typed render recipes over interpolated shell strings.

Required:

- spawn/exec argument arrays;
- no shell interpolation of untrusted values;
- escaped text files or pre-rendered text layers;
- path allowlists;
- bounded input count, resolution, and duration;
- timeout and cancellation;
- atomic temporary output then rename;
- deterministic seed and recipe hash;
- explicit renderer version;
- safe cleanup;
- post-render FFprobe validation;
- reproducible manifest.

## 8.5 Copy and text hygiene

Before render:

- validate balanced quotation marks;
- prohibit raw JSON, markdown, prompt tags, or reasoning markers;
- remove duplicate punctuation;
- enforce complete sentences where required;
- prevent awkward card splitting;
- enforce maximum line count and characters per line;
- preserve intentional emphasis through structured spans rather than literal quote debris;
- compare visible text, narration, and approved script.

---

# 9. SUBTITLES AND MOBILE READABILITY

Generate:

- clean transcript;
- editable caption timeline;
- SRT;
- VTT where supported;
- burned-in caption variant when selected;
- subtitle QC report.

Validate:

- cue timing;
- no accidental overlap;
- reading speed;
- minimum and maximum cue duration;
- line count and width;
- semantic sentence breaks;
- high contrast;
- platform-safe bottom and side zones;
- no clipping at 100%, 125%, and 200% UI scaling where applicable;
- no color-only emphasis;
- consistent text with narration;
- user-selectable caption theme;
- reduced-motion behavior for animated captions.

Use known render layout data for safe-zone validation instead of OCR where possible.

---

# 10. QUALITY CERTIFICATION

## 10.1 Independent quality domains

Keep separate results for:

1. `STORY_INTEGRITY`;
2. `SCRIPT_HYGIENE`;
3. `CREATIVE_QUALITY`;
4. `VISUAL_CONSISTENCY`;
5. `MOTION_AND_PACING`;
6. `AUDIO_COHERENCE`;
7. `VOICE_QUALITY`;
8. `SUBTITLE_ACCESSIBILITY`;
9. `TECHNICAL_MEDIA`;
10. `PLATFORM_FIT`;
11. `RIGHTS_AND_COMPLIANCE`;
12. `PRODUCTION_READINESS`.

Each result must include:

- status;
- score when meaningful;
- deterministic findings;
- model-assisted findings separately;
- evidence;
- failed checks;
- remediation;
- validator version;
- timestamp.

## 10.2 Deterministic media gate

Validate with FFprobe, FFmpeg, and deterministic logic:

- valid container and required streams;
- codec and pixel format;
- dimensions and aspect ratio;
- duration tolerance;
- frame rate;
- audio sample rate and channels;
- integrated loudness and true peak;
- clipping;
- unintended silence;
- blank or missing foreground;
- unplanned static/freeze intervals;
- first and final frame correctness;
- subtitle bounds;
- safe zones;
- text overflow;
- file size;
- checksum;
- manifest consistency.

## 10.3 Creative gate

Reject or require review when:

- the output is only a generic static card sequence but the selected template promises visual storytelling;
- there is no meaningful visual change over the configured cadence;
- visible text contains malformed quotes or fragments;
- script, narration, and captions diverge;
- the opening fails to establish the approved hook;
- the CTA appears abruptly or is unsupported;
- visual assets are irrelevant, repetitive, or unlicensed;
- the final frame is truncated or lacks the intended loop/ending;
- an automated quality score passes while a mandatory deterministic check fails.

## 10.4 Bounded revision

- maximum two automated revisions per stage by default;
- repair only failed fields or artifacts;
- preserve immutable before/after snapshots;
- rerun all dependent validators;
- no recursive unbounded self-correction;
- unresolved failure becomes `review_required` or `blocked`, never fake success.

---

# 11. MODEL AND AGENT EXECUTION SAFETY

Preserve the canonical Operator/model mapping across TypeScript and Python.

All model calls must pass through:

- capability selection;
- memory-pressure admission;
- lifecycle manager;
- timeout;
- cancellation;
- retry classification;
- structured-output schema;
- output sanitization;
- reasoning-tag removal;
- provenance and prompt-template versioning.

Agents may propose scripts, plans, repair instructions, and asset queries. Deterministic services must validate and execute.

Agents may not directly:

- interpolate shell commands;
- choose arbitrary filesystem paths;
- fetch arbitrary URLs;
- publish externally;
- weaken quality or rights gates;
- modify production prompts or policies without a versioned approved change;
- store hidden reasoning.

---

# 12. TARGETED IMPLEMENTATION PRIORITIES

Use this order.

## P0 — Safety and false-success blockers

- unsafe hardware profile or incorrect universal Ollama defaults;
- browser/server secret boundary regression;
- missing fail-closed auth;
- `complete` or `ready` despite failed mandatory gates;
- arbitrary command/path/URL injection;
- unlicensed required assets;
- unauthorized voice cloning;
- fabricated provider or publication success.

## P1 — Production-quality blockers

- static smoke renderer masquerading as production renderer;
- no true `VoiceProvider` abstraction;
- no neural local TTS benchmark and selection;
- no typed visual blueprint implementation;
- no template-aware motion/blank/freeze QC;
- script-to-card quote artifacts;
- inconsistent audio master policy;
- no improved golden-path media artifact;
- stale Docker ignore filenames;
- no canonical complete release command;
- docs claiming fixes not present in the worktree.

## P2 — Creator experience and maintainability

- dashboard capability visibility;
- voice preview and benchmark UI;
- template browser and preview;
- asset license/attribution inspector;
- actionable degraded states;
- accessibility;
- visual polish;
- progress and cancellation;
- run comparison and QC diff.

## P3 — Optional enhancements

- optional Kokoro adapter after benchmark;
- optional whisper.cpp alignment;
- optional Pexels/Openverse search;
- optional richer composition framework after ADR;
- optional generative asset provider;
- publishing and analytics adapters requiring credentials.

Do not prioritize P3 over unresolved P0/P1 work.

---

# 13. MILESTONE EXECUTION PLAN

## M0 — Baseline, instructions, and audit ledger

- inspect Git and preserve user changes;
- identify applicable instructions;
- reconcile missing/stale instruction paths;
- inventory architecture and existing completion state;
- inspect the attached video;
- run baseline tests without modifying code;
- create a concise evidence ledger;
- define the minimum patch plan.

## M1 — Hardware profile and startup correction

- probe actual target hardware;
- add or correct typed profiles;
- make 8 GB and 16 GB policies distinct;
- validate environment overrides;
- prevent unsafe max-loaded-model combinations;
- update doctor/preflight output;
- add tests;
- correct stale hardware documentation.

## M2 — Build and release reproducibility

- fix `dockerignore` versus `.dockerignore` when confirmed;
- validate build contexts and required files;
- preserve root lockfile installation;
- validate Next standalone output;
- add a canonical non-destructive release verifier, for example `make verify-release` or `scripts/verify-release.sh`;
- keep optional environment-dependent gates explicit rather than silently skipped.

## M3 — Voice provider and audio master

- extract direct `espeak-ng` execution from the renderer;
- implement provider contract and capability probing;
- retain espeak fallback;
- implement Piper adapter or a measured equivalent;
- optionally implement Kokoro behind an explicit capability flag after benchmark;
- add pronunciation dictionary and script normalization;
- add audio post-processing and QC;
- add deterministic tests and optional live-provider tests.

## M4 — Production visual blueprint and renderer

- keep current smoke renderer;
- implement at least one production-capable kinetic template and one asset-backed narrator template;
- introduce typed render recipes;
- add meaningful motion, scene progression, brand tokens, and captions;
- eliminate quote artifacts and awkward card splits;
- implement template-aware static/blank-frame validation;
- add tests and golden fixtures.

## M5 — Free asset adapters and rights workflow

- implement local rights-safe fixtures first;
- add optional server-side Pexels and Openverse adapters;
- cache and deduplicate;
- persist attribution and license data;
- block unresolved rights from final certification;
- keep CI offline.

## M6 — Dashboard creator workflow

- expose active profile, resource pressure, and capabilities;
- show voice provider and selected voice;
- provide voice preview with cancellation;
- expose template selection and preview;
- show license/provenance state;
- display certification tier and failed checks;
- support retry, revise, and compare;
- validate responsive and accessible states.

## M7 — Improved real-video golden path

Run one constrained-profile narrator-only production through the actual API and dashboard path when possible.

Requirements:

- no paid API;
- no GPU requirement;
- one approved short brief;
- validated script with no quote artifacts;
- local neural narration when the selected provider passes preflight, otherwise an explicitly labeled fallback;
- production-capable template;
- local or rights-safe visual assets;
- captions;
- audio master;
- full QC report;
- manifest and hashes;
- platform package;
- restart and recovery verification.

Generate an improved artifact distinct from the original baseline, for example:

```text
artifacts/golden-path/first-video-v2.mp4
```

Do not overwrite the user’s original video.

## M8 — Full validation, documentation, and delivery

- run complete code and media gates;
- inspect the final diff;
- update active docs and changelog;
- create an accurate release/certification report;
- commit only task-related changes;
- push safely when authenticated and authorized.

---

# 14. IMPROVED VIDEO ACCEPTANCE CRITERIA

The improved video must satisfy all applicable conditions:

## Technical

- valid MP4;
- H.264 video and AAC audio unless the platform profile explicitly allows another format;
- 9:16 portrait;
- configured minimum dimensions;
- stable frame rate;
- valid pixel format;
- production audio sample rate from the active profile;
- no corrupt stream;
- no accidental missing audio;
- post-mux loudness and peak within the active audio profile;
- stable output hash and render manifest.

## Script and narration

- no unmatched or decorative quote debris;
- no reasoning tags or prompt markup;
- complete, natural sentences;
- narration and visible copy agree;
- voice identity is real and traceable, not only a speed alias;
- pronunciation review passes or is explicitly flagged;
- synthesized output is not clipped or truncated.

## Visual

- selected production template, not the smoke-only template;
- meaningful visual progression;
- no unexplained multi-second blank state;
- static intervals comply with the template;
- captions and CTA stay in safe zones;
- readable on a 390×844 viewport;
- brand palette and typography are coherent;
- no accidental text clipping;
- first frame communicates the hook quickly;
- ending is intentional and complete.

## Rights and provenance

- every external asset has source and license state;
- attribution package is generated when required;
- voice/model license metadata is recorded;
- no unauthorized voice or likeness;
- AI disclosure decision is recorded.

## Certification

- raw technical detector findings are retained;
- interpreted template-aware findings are retained;
- all mandatory deterministic checks pass;
- creative review outcome is explicit;
- output reaches at least `PRODUCTION_PACK_VALID`;
- `READY_TO_POST` is used only when all final conditions are satisfied.

---

# 15. TESTING STRATEGY

## 15.1 TypeScript and dashboard

Run each command independently:

```bash
pnpm --filter @swarmx/types typecheck
pnpm --filter @swarmx/api typecheck
pnpm --filter @swarmx/api test
pnpm --filter @swarmx/api build
pnpm --filter @swarmx/api run test:regression
pnpm --filter @swarmx/api run test:video
pnpm --filter @swarmx/api run test:video:smoke
pnpm --filter @swarmx/api run test:factory
pnpm --filter @swarmx/dashboard lint
pnpm --filter @swarmx/dashboard typecheck
pnpm --filter @swarmx/dashboard test
pnpm --filter @swarmx/dashboard build
```

Add tests for:

- profile resolution and unsafe Ollama configuration;
- provider capability discovery;
- neural TTS unavailable and fallback states;
- no silent fallback in production certification;
- script normalization and quote repair/rejection;
- TTS timeout and cancellation;
- voice artifact lineage;
- render recipe validation;
- safe FFmpeg argument handling;
- static/blank interpretation by template;
- certification tier transitions;
- rights gate;
- server-only external provider credentials;
- dashboard degraded states and accessibility.

## 15.2 Python

Use the pinned repository environment:

```bash
.venv/bin/python -m pytest -q
.venv/bin/python -m ruff check .
.venv/bin/python -m mypy src/swarmx brain --ignore-missing-imports
```

Do not automatically rewrite unrelated pre-existing lint findings. Fix touched-file findings and report legacy debt separately when a full gate remains red.

## 15.3 Media regression

For deterministic media fixtures, validate:

- expected duration range;
- dimensions and frame rate;
- required streams;
- sample rate and channels;
- subtitle output;
- manifest;
- no placeholder certification;
- template-aware motion and foreground checks;
- audio loudness/peak profile;
- reproducible structural properties.

Do not use a brittle exact MP4 binary hash when codec metadata makes byte-for-byte identity unstable. Hash immutable inputs and recipe; assert tolerant output structure where appropriate.

## 15.4 Optional integration tests

Gate behind explicit environment variables:

- real Ollama model invocation;
- Piper or selected neural TTS;
- Kokoro candidate;
- whisper.cpp;
- Pexels;
- Openverse;
- Docker/Compose;
- publication adapters.

Mandatory CI must not require private credentials, large models, GPU hardware, or external network access.

---

# 16. RELEASE VERIFICATION

Create or use one canonical release command. It must report each gate independently and preserve exit status.

Minimum release sequence:

```bash
git diff --check
git status --short
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm --filter @swarmx/api run test:regression
pnpm --filter @swarmx/api run test:video
pnpm --filter @swarmx/api run test:factory
.venv/bin/python -m pytest -q
.venv/bin/python -m ruff check .
docker compose config
```

Then, when the environment supports it:

- build production images;
- start Compose;
- run liveness, readiness, and detailed diagnostics;
- execute golden path;
- validate generated media;
- restart services;
- prove state and artifact recovery;
- shut down cleanly without deleting volumes.

Do not mark unavailable Docker or credentialed publishing gates as passed. Use:

```text
PASS
FAIL
BLOCKED_BY_ENVIRONMENT
NOT_APPLICABLE
NOT_REQUESTED
```

For every blocked gate include the exact corrective command or operator action.

---

# 17. SECURITY, PRIVACY, AND SUPPLY CHAIN

Verify:

- no token under `NEXT_PUBLIC_*`;
- no provider or publisher credential in browser bundles;
- production write routes fail closed;
- constant-time secret comparison where applicable;
- CORS and origin allowlists;
- Helmet/CSP appropriate to the actual architecture;
- no raw stack trace in production;
- bounded request and media sizes;
- SSRF protection for asset fetches;
- redirect and host allowlists;
- path traversal prevention;
- MIME sniffing from bytes;
- no untrusted shell interpolation;
- no execution of uploaded scripts or ComfyUI workflows without validation;
- secret scan;
- dependency vulnerability review;
- license inventory for TTS engines, voice models, assets, and optional tools.

When a copyleft tool is selected, document whether it is linked, invoked as a separate executable, or run as a separate local service, and obtain an explicit packaging/licensing decision before distribution.

---

# 18. OBSERVABILITY

Propagate stable identifiers through:

- request;
- project;
- series;
- episode;
- workflow;
- stage;
- job;
- voice synthesis;
- render;
- QC;
- package;
- publish attempt.

Instrument:

- stage latency and failures;
- queue depth;
- model residency and pressure;
- TTS cold/warm latency;
- TTS peak memory;
- render duration;
- audio-QC findings;
- visual-QC findings;
- revision count;
- capability degradation;
- persistence hydration and recovery;
- provider quota status without secrets.

Keep metric labels low-cardinality. Do not log full prompts, private narration, tokens, or user assets by default.

---

# 19. DASHBOARD PRODUCT REQUIREMENTS

Evolve the existing dashboard without gratuitous redesign.

Required user-visible outcomes:

- active hardware profile and whether it was auto-detected or overridden;
- current RAM pressure and model residency;
- clear capability matrix;
- selected voice provider and real voice identity;
- short voice preview with cancel;
- selected visual blueprint and preview;
- asset source, rights, and attribution status;
- workflow stage, elapsed time, retryability, and next action;
- explicit certification tier;
- grouped failed checks with remediation;
- before/after revision comparison;
- final video preview with captions;
- downloadable complete production bundle;
- no false success or hidden degraded state.

Accessibility target: WCAG 2.2 AA.

Validate:

- semantic structure;
- keyboard navigation;
- visible focus;
- accessible dialogs;
- labels and validation errors;
- `aria-live` for async progress;
- progress semantics;
- reduced motion;
- contrast;
- 390×844, 768×1024, 1280×800, and 1440×900 layouts;
- no nested scroll trap;
- accessible media controls and captions.

---

# 20. DOCUMENTATION

Update only authoritative active documentation affected by verified changes.

At minimum inspect and reconcile:

- `README.md`;
- `AGENTS.md`;
- `CLAUDE.md`;
- architecture documentation;
- model/operator registry documentation;
- startup and hardware-profile documentation;
- Creative Factory release status;
- audit ledger;
- voice/TTS guide;
- render and QC guide;
- asset/right guide;
- environment example;
- troubleshooting;
- changelog.

Documentation must state:

- actual supported hardware profiles;
- exact default and override behavior;
- current TTS provider priority;
- how to install and probe optional providers;
- voice/model licensing requirements;
- the difference between smoke render and production render;
- certification tiers;
- exact validation commands;
- current external limitations;
- what remains optional;
- what was deliberately not implemented.

Remove obsolete claims instead of adding another contradictory status paragraph.

---

# 21. GIT DELIVERY

Before committing:

```bash
git status --short
git diff --stat
git diff --check
git diff
```

Review every changed file.

Confirm:

- no secret;
- no user work discarded;
- no generated cache or model file;
- no accidental large media artifact;
- no unrelated formatting churn;
- no weakened test or quality gate;
- no unsupported benchmark claim;
- no fake publication or readiness claim.

Then:

1. fetch the remote;
2. compare local and upstream history;
3. preserve local work with a safety branch when needed;
4. never use `git reset --hard` to erase work;
5. never force-push;
6. stage only relevant files;
7. create a clear Conventional Commit;
8. push the current branch or prepare a pull request according to the environment;
9. report branch, commit hash, and exact push/PR result.

Do not claim that `master` was pushed when operating in an archive, detached worktree, unauthenticated environment, or restricted cloud branch.

---

# 22. DEFINITION OF DONE

The closeout is complete only when:

- actual host hardware is verified and correctly represented;
- constrained 8 GB and standard 16 GB policies are distinct;
- unsafe model-residency settings are rejected or corrected;
- stale instruction paths are resolved;
- Docker ignore files and documentation agree with executable reality;
- one canonical release command exists;
- existing completed systems remain intact;
- `VoiceProvider` abstraction exists;
- a measured local neural TTS path exists or a precise external blocker is documented;
- `espeak-ng` remains an honest fallback rather than the only production voice path;
- audio mastering and QC are deterministic;
- at least one production-capable visual blueprint is implemented;
- smoke and production renderers are explicitly distinct;
- quote/sentence artifacts are prevented by tests;
- template-aware blank/static-frame QC exists;
- free/local asset fixtures exist;
- optional external asset adapters preserve rights and attribution;
- an improved real video is generated without overwriting the original;
- improved media has a manifest, captions, transcript, QC, rights, and package data;
- certification tiers are enforced;
- restart recovery is verified where the environment permits;
- code, tests, build, security, and media gates pass or have precise environmental blockers;
- active documentation matches implementation;
- Git delivery is reported truthfully.

---

# 23. REQUIRED FINAL REPORT

Return exactly this structure:

## A. Execution trace

- intent;
- instruction files read;
- selected skills;
- actual hardware/runtime;
- starting Git state;
- scope and exclusions.

## B. Certification decision

Choose one:

- `LOCAL_PRODUCTION_VALIDATED`;
- `CODE_VALIDATED_WITH_EXTERNAL_BLOCKERS`;
- `TECHNICALLY_VALID_ONLY`;
- `NOT_SAFE_FOR_PRODUCTION`.

## C. Baseline video audit

Include:

- technical metadata;
- audio findings;
- visual/motion findings;
- text/script findings;
- certification tier;
- exact evidence artifacts.

## D. Verified root causes

List only evidence-backed causes with paths and relevant symbols.

## E. Implemented changes

Group by:

- hardware/model runtime;
- build/release;
- voice/TTS;
- audio;
- visual templates/rendering;
- assets/rights;
- quality certification;
- dashboard;
- security;
- observability;
- tests;
- docs.

## F. Files changed

One concise reason per file.

## G. Voice benchmark matrix

Include:

- provider;
- voice/model;
- license reviewed;
- cold start;
- warm synthesis;
- peak memory;
- real-time factor;
- sample rate;
- qualitative review;
- selected status.

## H. Improved artifact

Include:

- path;
- duration;
- dimensions;
- codecs;
- audio measurements;
- template;
- voice;
- asset sources;
- QC result;
- manifest hash;
- certification tier.

## I. Validation matrix

Use:

```text
Command | Exit code | Status | Relevant evidence | Blocker
```

## J. Security and rights review

- secret scan;
- browser credential boundary;
- asset licenses;
- voice/model licenses;
- consent/disclosure;
- unresolved risks.

## K. Remaining limitations

Separate:

- code limitation;
- hardware limitation;
- optional dependency;
- Docker/environment limitation;
- credentialed provider limitation;
- publishing limitation.

## L. Git delivery

- branch;
- commit hash;
- commit message;
- push or PR result;
- upstream state.

Do not end with an unsupported superlative.

---

# 24. START NOW

Execute in this order:

1. inspect instructions and Git state;
2. verify actual hardware and runtime;
3. inspect the baseline video and current renderer;
4. reconcile repository status claims against executable files;
5. produce an evidence-backed P0/P1 plan;
6. implement hardware and release-safety corrections;
7. implement voice-provider and audio improvements;
8. implement production visual blueprint and renderer improvements;
9. add rights-safe asset paths and optional provider adapters;
10. generate the improved golden-path artifact;
11. run complete validation;
12. update documentation;
13. review diff;
14. commit and push safely;
15. return the required report.

Do not repeat a greenfield rewrite of systems already verified complete.

Do not weaken the definition of `READY_TO_POST` to accommodate the current smoke video.

Deliver the smallest complete, test-backed, hardware-safe production closeout supported by repository evidence.
