# The Yap Engine — Changelog

> **Powered by SwarmXQ** · Full version history from V6.2.0 onward.

<!-- markdownlint-disable MD024 MD032 -->

---

## V6 Production Certification Pass — Reconciliation Commit `8f25287` (2026-09-09)

### Summary

v6 production certification pass on `main`. All 9 AGENTS.md invariants confirmed. No regressions.

### Changes

#### `ffmpeg-video-renderer.ts`
- Gap B audio mastering fail-open: loudnorm failures no longer block the render; pipeline continues with un-normalized audio.
- Double-loudnorm fix: removed erroneous second loudnorm pass causing audio artifacts.

#### `voice-providers.ts`
- TS2551 env key fix: `SWARMX_PYTHON` now accessed via `loadEnv()` (Zod schema) instead of direct `process.env` access — closes invariant 5 violation.

#### `vitest.config.ts`
- Added subpath aliases for `@swarmx/types/video-types` and `@swarmx/types/series-types` — prevents fallback to bare `@swarmx/types` catch-all for those imports in tests.

#### `video-regression-check.ts`
- Reconciled regression assertions to match current pipeline implementation. Stale assertion strings removed.

#### `model-registry-modelfile-check.ts` + `creative-factory-release-check.ts`
- Windows `fileURLToPath` fix: replaced `new URL(import.meta.url).pathname` with `fileURLToPath(import.meta.url)` to resolve drive-letter path corruption on Windows hosts (`/C:/...` → `C:/...`).

#### `apps/swarmx-api/__tests__/challenger-gate6-verification.test.ts`
- 17 new empirical tests added covering v6 certification paths.

### Environment truth

Node v24.17.0 · pnpm 11.9.0 · Python 3.14.6 · HP EliteBook 850 G3 · 16 GB RAM · CPU-only · WSL2

### Known blockers (document only)

- FFmpeg not in Windows PATH — WSL2 install required for local renders.
- `faster-whisper` not installed — word-level caption alignment bypassed.
- Modal credentials not provisioned — cloud GPU backend unavailable; local FFmpeg fallback active.

---

## V6.2.63 — Intent Fallback Resilience (2026-08-05)

### API — malformed intent JSON no longer blocks video generation

- Intent classification still sanitizes model output and attempts strict JSON
  parsing first, but malformed JSON now falls back to a deterministic structured
  intent derived from the already validated job request.
- The fallback records the model attempt as failed in operator telemetry and
  emits an explicit stream message, while allowing planning, scripting,
  storyboard, render assembly, and finalizing to continue.
- `video-regression-check.ts` now guards the deterministic fallback markers so
  future refactors cannot silently restore hard failure on malformed intent JSON.

## V6.2.62 — Composer Fetch Classification and Governance Reconciliation (2026-08-05)

### API — Composer Ollama failure classification

- Composer chat, loaded-model, model-preload, and server startup prewarm Ollama
  calls now use `fetchBackend(..., { backend: "ollama" })`, matching the video
  pipeline and Ollama service discipline. Network failures now classify as
  `OLLAMA_UNAVAILABLE` instead of surfacing as unstructured fetch errors.
- `video-regression-check.ts` now guards Composer's `/api/chat`, `/api/ps`, and
  `/api/generate` call sites plus server prewarm so future work cannot silently
  bypass the shared backend classifier.

### Governance/docs — runtime truth alignment

- APEX-17 operator-map headers in TypeScript and Python now advertise r8 while
  preserving the existing canonical tags and mirror semantics.
- `CLAUDE.md` and `NEXUS.md` now reflect the V6.2.62 baseline, current test
  counts, and the conservative CPU Ollama defaults from `env.ts` and
  `startup-enhanced.sh`: `OLLAMA_FLASH_ATTENTION=0` and
  `OLLAMA_KV_CACHE_TYPE=f16` unless a target-host validation opts in.

## V6.2.61 — Video Dashboard Motion, Prosody, and Mobile Usability (2026-08-05)

### API — style-aware renderer motion and Comfy prompt parity

- FFmpeg fallback motion now combines tone palette, niche accent transforms,
  style-specific pulse/drift profiles, a third slow parallax `drawbox` layer,
  and a hook-window amplitude boost derived from caption card timing.
- ComfyUI LTX workflow prompts now include the user prompt plus `tone`, `niche`,
  `style`, and first storyboard frame context so the optional generated-backdrop
  path diversifies along the same creative axes as the FFmpeg fallback.
- `video-regression-check.ts` now guards the new style/niche/hook motion
  markers and Comfy prompt axis metadata.

### API/dashboard — Kokoro prosody and fallback visibility

- Voice contracts now carry optional `tone` on synthesis requests and optional
  `prosodySegments` on voice artifacts.
- Kokoro synthesis can segment HOOK/BODY/RESOLUTION/CTA narration with
  section-specific speaking rates, and storytime dialogue can route quoted
  lines to a second Kokoro speaker while Piper/eSpeak remain single-pass
  fallbacks.
- `/api/system/health` can now return a voice fallback warning when Kokoro is
  unavailable and benchmark/provider state selects another provider; dashboard
  runtime guidance surfaces that warning without blocking submission.

### Dashboard — form guidance, shortcuts, telemetry drawer

- Video form selects now show output-oriented help for niche, tone, style,
  caption style, voice, and Kokoro profile choices.
- Voice preview controls are wired for static Kokoro assets under
  `public/audio/voice-previews/`. Five real Kokoro-generated WAV clips now ship
  with the dashboard and were verified with `ffprobe`; controls remain guarded
  by the missing-asset affordance if those files are removed in a future build.
- Added a `?` shortcuts overlay, mobile telemetry drawer controlled by the
  existing telemetry toggle, explicit `tok` suffixes for operator token
  ceilings, a first-run queue CTA that focuses quick-start presets, and a
  compact failed-card next-action line.
- The shortcuts overlay and mobile telemetry drawer now use native modal
  dialog activation so background dashboard controls are inert to keyboard and
  assistive-technology users while overlays are open.
- Browser verification found an already-running dashboard on port `3000`
  serving stale `_next/static/chunks/*` assets. A fresh production server from
  the rebuilt output served all chunks at 200; restart the live dashboard after
  this release so port `3000` picks up the rebuilt assets.

## V6.2.60 — Low-RAM Auto-Enable Fix + Voice Profile Routing (2026-08-05)

### Video pipeline — low-RAM auto-enable now actually engages on constrained hosts

- Fixed `shouldAutoEnableLowRamMode()` in `video-runtime-config.ts`, which
  compared the Zod-defaulted `loadEnv().SWARMX_VIDEO_LOW_RAM_MODE` value
  (always `"0"` unless explicitly set) instead of the raw env var, so it could
  never return `true` — auto-enable on constrained RAM was dead code.
- **Deeper root cause found after the above fix still didn't take effect on a
  live restart**: ES module import execution order runs every imported
  module's top-level side effects *before* the importing module's own body
  runs. Many services (`composer.ts`, `ollama.ts`, `video-queue.ts`, and
  a dozen others) call `loadEnv()` at their own top level, so by the time
  `server.ts`'s own statements execute — no matter how they're ordered within
  `server.ts` — `env.ts`'s module-level cache is already populated. Reordering
  statements inside a single file cannot fix a timing bug rooted in a shared
  singleton cache populated by other imported modules.
- `isLowRamVideoMode()` now owns a dedicated, self-contained memoized cache
  (`cachedLowRamMode`) populated from `readRawEnv()` plus a live
  `/proc/meminfo` check on first real invocation — never from `env.ts`'s
  `loadEnv()` cache. This is immune to import-ordering hazards because the
  first real call always happens after all module imports have completed.
- Added `resetLowRamModeCacheForTesting()` so tests and the regression script
  can flip `SWARMX_VIDEO_LOW_RAM_MODE` mid-run and observe the new value,
  matching the existing `resetEnvForTesting()` pattern in `env.ts`.
- `video-regression-check.ts` and `video-runtime-config.test.ts` updated:
  assertions that previously assumed "unset env var" always means "full
  7B pipeline" now explicitly set `SWARMX_VIDEO_LOW_RAM_MODE=0` for that
  case, since "unset" now correctly falls back to live RAM detection
  (which is the point of the fix) and would otherwise make those specific
  assertions flaky on real constrained hosts.
- Verified end-to-end after a full stack restart: the
  `"Video pipeline runtime mode resolved"` startup log now reflects live
  `/proc/meminfo` state (`lowRamMode` tracks `availableMb` against the
  6170 MB threshold) instead of being permanently stuck at `false`. A fresh
  video job was regenerated post-fix and completed with
  `certificationTier: PRODUCTION_PACK_VALID` (all technical, creative,
  accessibility, audio, and rights gates passed).

### Dashboard/API — voice profile routing and guided submission UX

- Added `voiceProfileId` and `storyMode` to the canonical video request contracts, route validation, dashboard normalization, and API bridge types so the form and runtime share the same schema.
- The dashboard video form now ships quick-start presets, an Essentials/Advanced layout split, runtime submission blocking messaging, and failure surfaces with concrete next actions.
- The FFmpeg narration path now forwards `voiceProfileId` and `storyMode` into synthesis, stamps both fields onto the packaged `voiceArtifact`, and records provider fallback reasons when a requested Kokoro profile has to degrade.
- Voice provider selection now honors explicit Kokoro profile requests ahead of benchmark ordering, while preserving benchmark-guided ranking for the normal `auto` path.

---

## V6.2.58 — Creative Quality Contract + Runtime UI Hardening (2026-07-24)

### Post-certification video polish — storyboard resilience + kinetic QC alignment

- Storyboard extraction now clamps normalized frame text to the schema budget
  before validation. A single overlong storyboard line no longer causes the
  entire `storyboard_generation` result to fail softly and fall back to the
  generic 3-frame default.
- Template-aware QC for `ffmpeg_kinetic_text` now treats deliberate text holds
  up to 6 seconds as expected on the CPU renderer. Longer freezes still surface
  as review warnings so genuinely stalled motion beats remain visible.

### API — script quality and env-boundary hardening

- The `scripting` stage now honors the `HOOK_BLOCKLIST` contract end to end:
  when the first valid script opens with a blocked preamble, the orchestrator
  retries once with an explicit regeneration instruction before accepting a
  degraded hook. If the second usable script still violates the blocklist, the
  job continues with a `scriptQualityWarnings` annotation instead of failing
  solely for creative softness.
- Dynamic API secrets and parametric env reads are now centralized through
  `env.ts` helpers (`readSecretEnv` / `readRawEnv`). Services and routes no
  longer read `process.env[...]` directly while preserving non-cached token
  behavior for video write auth and publisher OAuth tokens.
- `video-regression-check.ts` now guards both contracts: hook regeneration must
  remain wired, and service-level env access must stay centralized.

### Dashboard — health-driven ETA and visible action errors

- Video job cold-start messaging no longer hardcodes a dashboard fallback ETA.
  The card renders the value supplied by `/api/system/health`; if health lacks
  an ETA, the UI says the ETA is unknown rather than inventing a countdown.
- Failed video actions such as cancel, retry, reorder, publish, and caption
  rescoring now write sanitized store errors instead of relying on browser
  console output as the only feedback path.
- Added a dashboard regression test that blocks reintroducing hardcoded
  cold-start ETA literals in the health/card path.

### Runtime evidence — M13 re-certification

- Re-ran the live M13 harness against the local Fastify API with Kokoro online.
  Job `da82bfb8-ff66-4f58-9dd5-c2641d08571c` completed in 862 s with all six
  assertions passing and `certificationTier: PRODUCTION_PACK_VALID`.
- Verified the certified MP4 outside the harness: 720x1280 H.264, 30 fps,
  18.00 s, AAC 48 kHz stereo, SHA-256
  `056e161b8a54f99e7f5a1961e43456e6210c88b0dec4006349e01427a1d2e2a7`,
  FFmpeg `mean_volume: -20.0 dB`, `max_volume: -1.3 dB`, package sidecars
  present, and `/api/video/files/:filename` serving `206 Partial Content`.

### Stabilization follow-up — 2026-07-28

- Added a shared backend fetch classification boundary for Ollama and ComfyUI
  network failures. Connection-level failures now become `OLLAMA_UNAVAILABLE`
  or `COMFY_UNAVAILABLE` before retry logic, while explicit timeout and
  cancellation abort reasons remain `TIMEOUT` and `CANCELLED_BY_USER`.
- Dashboard runtime guidance now blocks full-pipeline submissions when live
  CPU telemetry reports `load1m / coreCount >= 0.85`, independent of the RAM
  floor. Missing CPU telemetry remains non-blocking.
- Client-facing video surfaces now expose operator names, certification tiers,
  certification blockers, virality component scores, and retry hints without
  rendering raw canonical model tags outside explicit operator/admin views.
- `SWARMX_VIDEO_MAX_RETRIES` now defaults to `2`, with retryable codes still
  limited to `TIMEOUT`, `OLLAMA_UNAVAILABLE`, and `COMFY_UNAVAILABLE`.
- Reconciled startup/model tuning docs with the verified safe CPU defaults:
  `OLLAMA_FLASH_ATTENTION=0` and `OLLAMA_KV_CACHE_TYPE=f16`.

## V6.2.57 — Operator Documentation Closeout (2026-07-24)

### Docs — M13 and browser verification runbooks

- Documented the direct M13 certification flow around the Fastify API default
  `http://127.0.0.1:3001`, including runtime preflight probes, required
  `SWARMX_VIDEO_API_TOKEN`, and the `m13-cert-report.json` evidence file.
- Added the repeatable `agent-browser` verification path for `/video`,
  `/video/[id]`, and `/system` after a certified run, covering desktop and
  narrow viewport checks plus console/page-error inspection.
- Added a Linux offline Chrome recovery note for `agent-browser install` when
  the Chrome-for-Testing archive has already been manually placed in
  `~/.cache/agent-browser/chrome-linux64.zip`.

## V6.2.56 — Voice/Text Sync + Ambient Motion Backgrounds (2026-07-24)

### API — caption timing aligned to narration length

- Intent classification now has an in-stage recovery path for CPU-only hosts
  where the default Q8 Pilot runner stops during cold classification. The
  orchestrator records the failed Q8 attempt, unloads it, and retries once with
  canonical Pilot-lite inside the same stage timeout; the fallback model is
  reflected in `modelsUsed.intent_classification` and the operator trace. If the
  first attempt spends the stage budget before Pilot-lite can complete, the job
  retry starts directly with Pilot-lite instead of re-burning time on the known
  failed Q8 runner. Once intent recovers to Pilot-lite, planning, scripting, and
  storyboard generation stay on the Pilot-lite recovery profile so constrained
  CPU hosts do not immediately reload the heavier planner and hit the M13
  planning timeout.
- Ollama generation requests now treat each stage's `maxTokens` as a hard cap
  over adaptive model profile `num_predict`, preventing a shared 7B profile from
  silently expanding short video stages. Planning is capped at 320 generated
  tokens, matching the required five-beat plan; intent keeps a 256-token cap so
  Pilot-lite can return complete strict JSON.
- Storyboard extraction now accepts numbered/bulleted scenes, `[SCENE N | BEAT]`
  lines, and `[VISUAL: ...]` tags from either storyboard output or the script
  before using generic safe defaults. This keeps Pilot-lite recovery jobs tied
  to the actual script beats even when the model omits strict bullet formatting.
- Added `computeCardTimings(cards, duration)` in `ffmpeg-video-renderer.ts`.
  Card display windows are now weighted by word count so a 17-word body line
  gets ~4.4 s of screen time while a 4-word CTA gets ~2.3 s — approximating
  what the narrator actually spends on each card, instead of splitting the
  video into equal slots regardless of content. Minimum readable floor per
  card is 1.5 s. Boundaries rounded to one decimal for stable FFmpeg + SRT
  alignment.
- `buildFilterComplex()` and `buildTimedText()` (SRT + VTT) now consume the
  same `CardTiming[]` array. The drawtext overlay, `captions.srt`, and
  `captions.vtt` reference identical start/end times so on-screen text and
  subtitles cannot drift apart.

### API — ambient motion backgrounds

- Added two full-height ambient glow layers (accent tone left, soft white
  right) that oscillate width and horizontal position via `sin(t*1.6)` and
  `sin(t*1.6+π)` respectively. The alternating breathing gives kinetic scenes
  an organic pulse without stealing focus from the caption card.
- Two drifting accent/white panels now use `mod(t*V + A*sin(t*ω), N)` for
  linear + sine composite trajectories instead of pure linear scan, so
  large moving elements feel wave-driven rather than robotic.
- Added twin top/bottom edge vignette bars (`black@0.35`) that darken the
  6% edges of the frame — cheaper and safer than FFmpeg's `vignette` filter
  on 4-core CPU, but visually similar in centering attention on the caption.
- Renderer tier scaling preserved: `ffmpeg_kinetic_text` gets the strongest
  glow (0.09 accent), `ffmpeg_faceless_broll` middle (0.07), and
  `ffmpeg_cinematic_explainer` stays muted (0.06) so overlaid b-roll is
  never fought.

### Artifact — improved v3 golden render

- Regenerated `video_first-video-v3.mp4` with the two improvements: same
  720×1280 H.264 @ 30 fps, 18.00 s, ~418 KB (up from 393 KB due to richer
  motion). SRT card boundaries now match card word counts (2.3–4.4 s).

### Dashboard — video runtime readiness

- `/video` now consumes structured `/api/system/health` fields for model
  readiness, runtime profile blockers, RAM headroom, and voice benchmark state.
  The workspace surfaces full-pipeline blockers before job submission instead
  of only showing generic API/Ollama availability.
- Video submission is now disabled while runtime readiness is explicitly blocked
  by API/Ollama outage, missing canonical model readiness, critical RAM pressure,
  or the full-pipeline RAM floor.
- `/system` now separates Ollama liveness from canonical model readiness instead
  of treating the health readiness triad as loaded model residency.
- Queue accessibility was tightened further: list semantics now wrap only
  actual job cards, and queued jobs advertise both drag and keyboard move
  controls.

## V6.2.55 — M13 Golden-Path Live Re-Certification (2026-07-24)

### API — live pipeline resilience

- `intent_classification` stage default timeout raised from 120 s to 240 s.
  Cold Q8 Pilot load on CPU (30–60 s) plus inference (10–30 s) plus marshaling
  was leaving under 30 s of slack in the previous 120 s window — the exact
  margin where prior `m9-golden-path-*` attempts timed out. Env override
  `VIDEO_INTENT_CLASSIFY_TIMEOUT_MS` remains available; max bound of 600 s
  unchanged.
- Added `scripts/m13-live-cert.ts` — an HTTP-only live certification harness.
  It submits a real `kinetic_text` job through the running API, polls to
  completion, and asserts M13 criteria: `stageValidationTrace.length >= 3`,
  `modelsUsed` count >= 4, `certificationTier >= PRODUCTION_PACK_VALID`,
  QC report present, and `/api/system/health` exposing `voice.benchmark` +
  `runtimeProfile`. Writes `m13-cert-report.json` to
  `.swarmx/video/artifacts/m13/`. Requires the API server to be running and
  `SWARMX_VIDEO_API_TOKEN` to be set. Wired as `pnpm test:m13`.
- Hardened the M13 harness preflight so it refuses to submit a live job while
  `/api/system/health` is degraded, model readiness is missing, Ollama is
  unreachable, voice benchmark data is absent, or available RAM is below the
  6170 MB full-pipeline floor. This prevents doomed intent-stage cold loads from
  wedging Ollama during certification.
- The M13 harness now reads `modelsUsed`, `certificationTier`, and QC evidence
  from the canonical completed-job `output` metadata, while remaining compatible
  with older top-level mirrors. Poll output also formats the API's 0-100
  `overallProgress` without multiplying it again.

### Dashboard — video queue accessibility

- Added keyboard-accessible move up/down controls for queued video jobs while
  preserving drag-and-drop reordering. The `/video` queue now exposes a list
  structure and no longer requires pointer-only interaction to change queue
  order.

### Artifact — improved v3 golden render

- Regenerated `.swarmx/video/artifacts/golden-path/exports/video_first-video-v3.mp4`
  using the upgraded background system: 720×1280 H.264 at 30 fps, 18.00 s,
  393 KB; AAC 48 kHz stereo; Kokoro `am_michael` narration; SRT + VTT captions;
  full production package (render manifest, rights manifest, technical + creative
  QC report, template lineage, thumbnail, transcript, voice lineage);
  `PRODUCTION_PACK_VALID` certification tier.

### Environment

- Voice benchmark refreshed against Kokoro (RTF 0.83) and eSpeak-ng (fallback,
  RTF 0.008); Piper still absent. Recommended provider: `kokoro`.
- Doctor CLI now passes all 6 checks on this host: env, redis, ollama, ram
  (6984 MB available), voice-binaries (kokoro), voice-benchmark (fresh).

## V6.2.54 — M9 Golden-Path Runtime Readiness (2026-07-24)

### API — artifact config schema alignment

- `/api/system/health` now reports canonical model tags for configured router,
  fast, reason, and code models even when legacy aliases are supplied.
- Video artifact storage now resolves export directory, artifact directory, and
  public URL base through `loadEnv()` instead of direct service-level
  `process.env` reads.
- Added `SWARMX_VIDEO_PUBLIC_URL_BASE` with legacy
  `VIDEO_PUBLIC_URL_BASE` compatibility; legacy `VIDEO_OUTPUT_DIR` is now
  normalized by the env schema into `SWARMX_VIDEO_EXPORT_DIR`.
- Video write auth now reads `SWARMX_VIDEO_API_TOKEN` at auth-check time
  instead of caching it at module import, preserving fail-closed production
  behavior while avoiding import-order surprises in scripts/process managers.
- Video orchestrator ComfyUI, governor, and high-pressure backoff settings now
  resolve through the centralized env schema. Legacy `COMFY_HOST` and
  `HIGH_PRESSURE_DELAY_MS` remain compatibility aliases.

### API — local renderer visual upgrade

- Upgraded the deterministic FFmpeg fallback from flat-color motion plates to a
  layered background system using `drawgrid`, motion panels, accent scan lines,
  caption cards, and the existing progress bar. Exported template lineage now
  identifies `drawgrid-and-drawbox-motion-system`.
- Caption timing now uses half-open intervals for adjacent cards, preventing
  one-frame text overlap at exact scene boundaries.
- Updated the golden-path render script to emit `first-video-v3` with refreshed
  kinetic script beats, background-aware storyboard notes, and the 16 GB host
  runtime profile.

### Quality gates

- Extended `video-regression-check.ts` and `system-health-regression.ts` to
  cover canonical diagnostics, schema-backed artifact URL/path resolution, and
  the upgraded local renderer background recipe.

---

## V6.2.47 — Script Quality Bleed Fix + Creative Factory UI Polish (2026-07-23)

### API — Script quality signal

- Added `HOOK_BLOCKLIST` (13 phrases) and `validateScriptSections()` to
  `video-orchestrator.ts`. Restructured `buildScriptingPrompt()` so writing
  rules live in a labelled preamble ("do NOT output them") and the output
  template is a clean four-marker skeleton — closes the phi4-lite instruction
  bleed where parenthetical guidance was echoed into `[BODY]`.
- Script warnings now persist on the job (`VideoJob.scriptQualityWarnings`) so
  they survive across REST/SSE hops. Codes: `hook_blocklist`, `duration_bleed`,
  `visual_cue_bleed`, `word_count_bleed`, `rule_text_bleed`. Emission is
  soft-warning only — the pipeline never aborts on a script-quality flag.

### Dashboard — Creative Factory panel polish

- **P0 fix**: replaced object-returning Zustand selector in
  `CreativeFactoryPanel` with individual scalar selectors — the old pattern
  triggers React #185 tearing under React 19 + Zustand v5.
- Added `ListSkeleton` shimmer for BrandKits, Audiences, and Runs tabs during
  initial load.
- Runs tab: split-pane now activates at the `sm` breakpoint (not `md`), each
  pane is independently scrollable (`max-h-[420px]`), and section headers stick
  to the top of their scroll container.
- `RunRow` gains a `focus-visible:ring-1` indicator for keyboard nav; the
  active checkpoint row is now marked `aria-current="step"` inside a semantic
  `<ol>`.

### Dashboard — VideoJobCard warnings surface

- `VideoJobCard` renders a warning badge (with up to 3 messages plus overflow
  count) whenever the job carries `scriptQualityWarnings`. `role="status"`,
  `aria-label` reflects the warning count, and the badge is a soft-warning tone
  — not a failure state.

### Types — new canonical contract

- `packages/swarmx-types/src/video-types.ts` exports
  `ScriptQualityWarningCode` and `ScriptQualityWarning`, added as
  `scriptQualityWarnings?: ScriptQualityWarning[]` on the canonical
  `VideoJob`. Both bridge types (API and dashboard) re-export the shape and
  normalize the field.

### Quality gates

All 8 gates green: types tsc · api tsc · dashboard tsc · dashboard vitest
(52/52) · api vitest (177/177) · 5 API regressions · creative-factory
invariant · dashboard `next build` (15 routes).

---

## Unreleased — Creative Video Factory Safety Baseline (2026-07-20)

### Dashboard/API — server-only video write auth

- Added a Next.js `/api/*` server proxy that injects `SWARMX_VIDEO_API_TOKEN`
  only on server-side mutating requests.
- Removed browser-side public video write-token env usage; the token must never
  enter client bundles or browser storage.

### API — durable local workflow state

- Added atomic JSON snapshots plus append-only JSONL event journals for video
  jobs, series, and Creative Factory workflow runs under `SWARMX_HOME/state`.
- API startup now hydrates video, series, and workflow registries before serving
  route state.
- Series episode pre-production no longer marks an episode `complete` when the
  mandatory quality gate fails.
- Episode pre-production failures now include typed `errorCode` values so the
  dashboard and recovery tooling can distinguish invalid JSON, execution
  failures, missing roadmap entries, and mandatory quality-gate failures.
- Added an executable Creative Factory release invariant script and wired it
  into the API regression/CI path.
- Aligned Docker Compose and env examples with the verified CPU-safe Ollama
  defaults: `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_KEEP_ALIVE=0`,
  `OLLAMA_FLASH_ATTENTION=0`, and `OLLAMA_KV_CACHE_TYPE=f16`.

---

## V6.2.21 — Observability & Env Fail-Fast (2026-07-17)

### API — structured logging sweep

- **10 additional `console.*` calls migrated to shared logger** across six
  service files:
  - `virality-scorer.ts` (1): oracle circuit-open event now emits
    `{modelTag}` at `warn` level.
  - `swarm-pressure-monitor.ts` (2): topology change events emit
    `{from, to, degraded, reasons}` at `info`; poll errors emit `{err}` at
    `error` with full stack.
  - `video-orchestrator.ts` (2): HIGH pressure backoff and re-check events
    emit `{jobId, delayMs / pressureLevel}` at `warn`.
  - `publishers/base-publisher.ts` (3): platform log helper now routes
    every call through the shared logger with `{publisher, …sanitized}`
    bindings; token/secret redaction is preserved.
  - `video-workflows.ts` (1): SINGLE-14b lock enforcement emits at `info`.
  - `video-queue.ts` (1): SINGLE-VIDEO LOCK override warning emits
    `{configured}` at `warn`.
- **Net result**: `grep -rn 'console\\.' apps/swarmx-api/src` returns zero
  hits in `services/` and `routes/` (browser-side console usage in the
  dashboard's error boundaries is unchanged and correct).

### API — env fail-fast

- **`src/lib/env.ts`** (new file): centralized Zod schema for the top ~15
  API env vars (`SWARMX_API_PORT`, `SWARMX_API_HOST`, `NODE_ENV`,
  `LOG_LEVEL`, `REDIS_URL`, `OLLAMA_*`, video-queue toggles, rate limits,
  cleanup interval). Coerces string env values to typed numbers /
  enums and applies sensible defaults.
- **`server.ts`** now calls `loadEnv()` at startup before any other module
  reads `process.env`. On invalid input (e.g. `SWARMX_API_PORT=abc`,
  malformed URL), the process prints a formatted error listing every
  invalid key path and exits with code 1 — no more silent misconfiguration
  or crashes on first request.
- Ad-hoc `process.env["…"] ?? default` reads at existing call sites are
  left in place; new code should import from `./lib/env.js`.

### Verification

Quality gates: api tsc | types tsc | dashboard tsc | vitest (52 passed) | 4 API regressions | dashboard next build — all pass.

---

## V6.2.20 — Backend Production Hardening (2026-07-17)

### API — reliability and observability

- **Global process error handlers** (`apps/swarmx-api/src/server.ts`): registered
  `process.on("unhandledRejection")` and `process.on("uncaughtException")` before
  the SIGTERM/SIGINT handlers. Both log at Pino `fatal` level and exit with code 1,
  so unhandled promise rejections produce a structured trace rather than a silent
  crash. Without these, the Node.js process terminated with no log entry and the
  container log tail showed only an exit code.

- **Rate-limit bucket eviction** (`apps/swarmx-api/src/routes/video.ts`): added
  an unref'd `setInterval` (2 h period) that deletes Map keys whose entire
  timestamp array has aged past the respective rate-limit window. Previously,
  `captionScoreBuckets` and `jobSubmitBuckets` accumulated one key per unique
  (or spoofed) IP address indefinitely — a slow in-process memory growth vector.

- **Structured logging in adaptive-timeout** (`apps/swarmx-api/src/services/adaptive-timeout-config.ts`):
  replaced 7 `console.warn / console.error / console.info / console.debug` calls
  with structured Pino log calls via the new shared logger. Circuit-breaker trip
  events now log at `error` level with indexed fields (`op`, `modelTag`, `failures`,
  `windowMs`) so log aggregators can alert on repeated model failures. Soft-timeout
  warnings and stream-guard timeouts log at `warn`.

- **Shared logger module** (`apps/swarmx-api/src/lib/logger.ts`): new file
  exporting a zero-dependency, Pino-compatible structured JSON logger for service
  modules that do not have access to the Fastify `server.log` instance. Emits
  NDJSON to stderr with the same `{level, time, pid, name, ...bindings, msg}`
  schema Fastify's Pino uses, so log aggregators ingest both streams uniformly.
  Interface matches `pino.Logger`, enabling a drop-in swap to real Pino later
  without call-site changes.

### Verification

Quality gates: API tsc ✓ | adaptive-timeout-regression ✓ | workspace typecheck ✓ | dashboard build ✓ | `git diff --check` ✓.

---

## V6.2.19 — Render Failed State (2026-07-17)

### Dashboard — 12th named runtime state

- **"Render Failed" status label** (`components/video/VideoJobCard.tsx`): the
  `STATUS_MAP` `failed` entry now uses the operator-language label "Render
  Failed" instead of the generic "Failed", completing all 12 named runtime
  states required by the definition of done.

- **Error code display and retry icon in card** (`components/video/VideoJobCard.tsx`):
  hovering or focusing a failed job card reveals a `RefreshCw` icon button that
  navigates to the detail page where error code and retry options are surfaced.
  The ARIA announcement (`buildStatusAnnouncement`) now includes the error code
  token (e.g. `[RENDER_FAILED]`) alongside the safe error message.

- **"Render Failed" panel in detail view**
  (`app/(dashboard)/video/[id]/page.tsx`): failed jobs now render an explicit
  `role="alert"` panel at the top of the right column showing the error code in
  monospace, a one-line human-readable context hint (`errorCodeHint`), and
  action buttons. "Retry from Stage" appears only when `job.error.retryable` is
  true and calls `POST /api/video/jobs/:id/resume`; on API error it surfaces an
  inline message directing the operator to Resubmit. "Resubmit" always appears
  and navigates to `/video`.

- **`errorCodeHint` helper** (`lib/video-dashboard.ts`): new exported pure
  function mapping every known `VideoErrorCode` to a one-line operator-language
  context string.

- **`retryFromStage` return type** (`stores/video.ts`): changed from
  `Promise<void>` to `Promise<boolean>` so the detail panel can detect API
  failures without adding global error state.

### Verification

Quality gates: dashboard tsc ✓ | lint ✓ | test ✓ | API tsc ✓ | workspace typecheck ✓ | production build ✓ | regression-check ✓ | `git diff --check` ✓.

---

## V6.2.18 — Video Review UX Polish (2026-07-17)

### Dashboard — creative review surface

- **Cold-start ETA countdown** (`components/video/VideoJobCard.tsx`): the
  "Loading Model" hint now shows `~Ns remaining` derived from `elapsed`
  (140 s cold-load target), then falls back to "warmup exceeded typical range"
  once past 140 s. Reduces the cancel-during-cold-load anti-pattern that used to
  waste the entire pipeline warm-up.

- **Script section rendering** (`app/(dashboard)/video/[id]/page.tsx`): script
  output now parses `[HOOK] / [BODY] / [RESOLUTION] / [CTA]` markers and renders
  each block with a distinct left-accent color (warning / accent / success /
  throttled). Raw script text without markers falls back to the previous
  monospace block. Makes the four viral-structure beats scannable in a glance
  during creative review.

- **Full-caption char counter** (`components/video/CaptionEditor.tsx`): a badge
  next to "Caption Draft" reports total length (`firstLine + body + CTA +
  hashtags`) against the platform hard cap (2 200 chars for TikTok/Reels), with
  amber styling once the 280-char in-feed soft cap is exceeded and red beyond
  the hard cap. Helps creators avoid silent truncation before publish.

- **Model tier reference** (`components/video/VideoJobForm.tsx`): the Model
  selector now labels each option with its parameter count (`Auto (recommended)`,
  `Fast (3.8B)`, `Worker/Supervisor/Reasoner (7B)`), and a collapsible reference
  panel explains RAM requirements, cold-load timing, and the
  "silently-ignored-in-LOW_RAM_MODE" fallback so tier selection is no longer
  guesswork. Auto stays the default.

### Verification

Quality gates: dashboard tsc ✓ | lint ✓ | test 52/52 ✓ | API tsc ✓ |
regression-check ✓ | production build 11/11 routes ✓ | `git diff --check` ✓.

---

## V6.2.16 — Video Seeking, Rate Limiting, Tone Palette, Cleanup (2026-07-17)

### API — video serving and submission hardening

- **HTTP Range request support** (`routes/video.ts`): `GET /api/video/files/:filename`
  now handles `Range: bytes=N-M` requests and responds with `206 Partial Content` +
  `Content-Range` / `Accept-Ranges: bytes`. Without this, the browser `<video
  controls>` element could not seek — it reloaded from byte 0 on every scrub.
  Invalid ranges return `416 Range Not Satisfiable`. Full-file requests also now
  send `Accept-Ranges: bytes` and `Content-Length` so the browser can pre-compute
  the seek bar.

- **POST /jobs rate limiting** (`routes/video.ts`): sliding-window limiter
  (default 10 submissions per connection per hour) applied before the RAM check
  and preflight. Returns `429 rate_limited` when exceeded. Configurable via
  `SWARMX_VIDEO_JOB_LIMIT_PER_HOUR`. Follows the same pattern as the existing
  caption-score limiter. Queue capacity (`VIDEO_QUEUE_MAX_SIZE`) remains the
  concurrency ceiling; the per-connection rate limit caps how fast a single
  client can fill it.

### API — FFmpeg renderer visual quality

- **Tone-based visual palette** (`services/ffmpeg-video-renderer.ts`): background
  color is now selected from `TONE_BACKGROUNDS` keyed by the job's `tone` field
  (contrarian → near-black `0x0a0a0a`; educational → deep navy `0x070e1a`;
  cinematic → charcoal; warm → dark brown; etc.). Replaces the single hardcoded
  `0x111827` that applied regardless of creative direction.

- **Animated progress bar**: a `drawbox` filter writes an accent-colored bar at
  `y=ih-8` whose width grows linearly with video time (`w=trunc(iw*t/${duration})`).
  Accent color comes from `TONE_ACCENTS` (e.g. educational → `3399ff`,
  contrarian → `ff2222`). Gives viewers a passive sense of how much content remains.

- **Caption style modes** (`CAPTION_STYLE_CONFIGS`): `bold_center` (default) keeps
  text centered at middle; `lower_third` moves text to `y=h*0.72` with a higher box
  opacity (0.78) for overlay readability; `minimal` uses a smaller font (38px) and
  nearly transparent box (0.20). Font sizes also scale down automatically for long
  card text (> 60 / 100 / 150 chars) so no card overflows the frame.

- **Script-section-aware card extraction** (`extractScriptSections`): the renderer
  now parses `[HOOK]`, `[BODY]`, `[RESOLUTION]`, `[CTA]` markers from the
  orchestrator's script output and uses them as discrete cards. Inline `[VISUAL:…]`
  cues are stripped before writing card text files. Previously all cards fell back
  to generic fallback strings regardless of script content.

- **FFmpeg output quality**: switched `-preset fast` + `-crf 23` + `-b:a 128k`
  (was default preset, no CRF, no audio bitrate). Produces slightly smaller files
  at equivalent perceptual quality. Frame rate raised from 24 to 30 fps.

### API — operations

- **Export and artifact cleanup** (`services/video-cleanup.ts`): new service
  scans `SWARMX_VIDEO_EXPORT_DIR` and `SWARMX_VIDEO_ARTIFACT_DIR` on a
  configurable interval (default 6 h) and removes entries older than
  `SWARMX_VIDEO_EXPORT_TTL_DAYS` (default 7 days). First run fires 30 s after
  API startup. Timers are `unref()`d so they never block process exit.
  `startVideoCleanup()` / `stopVideoCleanup()` wired into `server.ts`.

### Dashboard — UX

- **Pipeline progress bar** (`components/video/VideoJobCard.tsx`): thin
  `status-active`-colored bar under the status badge showing `overallProgress %`
  with a smooth `transition-[width] duration-700` CSS animation. Visible only
  while the job is `running` and progress > 0; includes ARIA `role=progressbar`
  with `aria-valuenow/min/max` attributes.

### Tests

- `video-regression-check.ts` extended: rate-limit position check (before RAM
  check), Range / Accept-Ranges / 206 / 416 source assertions, renderer palette
  and progress-bar assertions, cleanup export assertions, server wiring assertions.

---

## V6.2.15 — Zero-Config Video Pipeline, SSE Terminal Close, UX Polish (2026-07-17)

### API — video pipeline zero-config on any host

- **CPU-safe stage timeout defaults** (`services/video-runtime-config.ts`):
  raised `STAGE_TIMEOUT_DEFAULTS` from GPU-tuned values (4/15/35/60 s) to values
  that clear both cold-load latency on GPU (5–15 s) and warm CPU inference on
  a 3.8B Q4_K_M model (14/60/110/150 s):
  - `intent_classification`: 4 000 → 30 000 ms
  - `planning`: 15 000 → 60 000 ms
  - `scripting`: 35 000 → 90 000 ms
  - `storyboard_generation`: 60 000 → 120 000 ms
  Env overrides via `VIDEO_*_TIMEOUT_MS` still work and are clamped by the same
  `STAGE_TIMEOUT_BOUNDS`. This removes the "job times out at 4 s on the first
  stage" failure mode that every CPU-only host hit on first-run.

- **LOW_RAM_MODE auto-detection** (`services/video-runtime-config.ts`,
  `server.ts`): new exports `detectAvailableMemoryMb()` +
  `shouldAutoEnableLowRamMode()` + `FULL_PIPELINE_MIN_AVAILABLE_MB` (6170).
  Server startup sets `SWARMX_VIDEO_LOW_RAM_MODE=1` automatically when
  `MemAvailable < 6170 MB` and the operator has not set an explicit value.
  Explicit env value always wins.

- **Boot-time model prewarm** (`server.ts`): when `LOW_RAM_MODE` is active,
  the API fires a fire-and-forget `/api/generate` warmup for
  `instruct-phi4-lite-q4km-prod` right after `ModelOrchestrator.init()`. Moves
  the 100–140 s CPU cold-load off the first user submission.

- **Runtime mode log** (`server.ts`): one-line startup log
  (`{ lowRamMode, availableMb, videoModel }`) makes cold-start audits and
  incident response trivial — no more guessing which pipeline is active.

- **SSE terminal-state close** (`routes/video.ts`): the `/jobs/:id/sse`
  handler now closes cleanly when a job is already terminal at subscription
  time, and auto-closes when it forwards a `video:completed`/`failed`/
  `cancelled` event. Prevents leaked sockets and idle load-balancer
  connections when clients tail a finished job.

### Dashboard — error hygiene + a11y

- **safeErrorMessage adoption** (`components/video/VideoJobCard.tsx`,
  `components/video/VideoJobTimeline.tsx`): raw `job.error.message` reads
  routed through `safeErrorMessage()` — same path leak / oversized-internal
  guards used elsewhere.

- **sanitizeApiError TypeError hardening** (`stores/video.ts`): guard
  `err.message` access with `typeof err.message === "string"` to avoid a
  runtime crash on TypeError subclasses that omit `message`.

- **Composer ThinkingIndicator** (`app/(dashboard)/composer/page.tsx`):
  added `aria-label` that includes elapsed seconds so screen readers
  announce meaningful progress; marked the pulsing dots and bot icon
  `aria-hidden` so they aren't announced separately.

- **Video queue skeleton** (`app/(dashboard)/video/page.tsx`): added a
  visible "Loading video jobs…" label above the skeleton stack so sighted
  users get the same context as screen-reader users.

### Tests

- `video-regression-check.ts` extended: locks in the new CPU-safe stage
  timeout defaults, asserts `shouldAutoEnableLowRamMode()` never overrides
  an explicit env value, asserts the SSE handler references `isTerminalStatus`
  and terminal event strings, and asserts `server.ts` wires the auto-detect
  helper. Dashboard: 49 tests still green.

---

## V6.2.14 — Intent parser tolerates split ARC/TAKEAWAY keys; CPU timeout docs (2026-07-16)

- **`parseIntentClassification`** (`services/video-orchestrator.ts`): the
  3.8B Q4_K_M model consistently emits `ARC` and `TAKEAWAY` as separate
  top-level JSON keys and omits `complexity`, tripping schema validation
  on every first-video attempt. Parser now repacks split keys into the
  `intent` string and defaults `complexity` to `0.5` when absent.
- **CONFIG_REFERENCE.md**: documented `VIDEO_*_TIMEOUT_MS` stage timeout
  table with GPU vs CPU-only ceiling values.
- First video generated end-to-end on the 16 GB CPU host: `h264 720×1280`,
  30.00 s, AAC audio, 361 KB, 8.2 min wall time.

---

## V6.2.13 — React #185, CORS preflight, error sanitization, runtime gitignore (2026-07-16)

- **VideoJobDetail React #185 crash**: object-literal Zustand selector
  `(s) => ({...})` triggered React 19's `useSyncExternalStore` tearing
  detection → infinite re-render. Replaced with five stable scalar
  selectors.
- **CORS `allowedHeaders`** now includes `x-video-api-key` — preflight
  on authenticated POST /api/video/jobs no longer fails when the token is
  set.
- **`safeErrorMessage` adoption in composer**: two raw `err.message`
  exposures replaced.
- **Runtime state gitignore**: `.swarmx/evolution-layer/` and
  `apps/**/.swarmx/video/` excluded; untracked `latest.json`.

---

## V6.2.12 — Dashboard Polling Compliance, Prompt Guidance, Virality Notice, Docs Sync (2026-07-16)

### Dashboard

- **Agents fallback polling** (`agents/page.tsx`): Reduced SSE-disconnected poll
  interval from 30 s to 8 s to comply with the §4 ≤10 s ceiling. Added a cap of 12
  polling attempts before the loop pauses (prevents indefinite low-priority traffic
  during prolonged API outages), ±10 % per-tick jitter to prevent thundering-herd
  on reconnect, and a `document.hidden` guard that skips ticks while the tab is
  not visible. Updated the status label from "polling every 30 s" to "polling every 8 s".

- **VideoJobForm** (`components/video/VideoJobForm.tsx`):
  - Default `niche` corrected from `"tech"` to `"motivational"` per the §5a spec.
  - Added `180 s (3 min)` duration option to complete the 15–180 s range required
    by the API schema (`minimum: 15, maximum: 180`).
  - Added inline prompt quality guidance below the character counter describing the
    four high-signal prompt dimensions: hook angle, emotional arc, concrete takeaway,
    and CTA intent.

- **Video job detail** (`app/(dashboard)/video/[id]/page.tsx`): When a completed job
  has no `viralitySignal` (circuit-breaker or LOW\_RAM\_MODE suppressed the Oracle
  call), the UI now shows an explicit operator note — "Virality scoring unavailable
  in low-RAM mode" — rather than silently hiding the section. Never displays a score
  of 0 or "N/A" as if scoring ran.

- **VideoJobCard** (`components/video/VideoJobCard.tsx`): Added a "Loading Model"
  notice that appears when a job has been in `classifying` or `running` status for
  more than 30 seconds. This covers the 100–140 s cold-model-load window on
  CPU-only hosts and prevents operators from cancelling during normal cold start.

### Documentation

- **VIDEO-GENERATION.md**: Added:
  - Manual prewarm section with the exact `curl` command for `instruct-phi4-lite-q4km-prod`
    and explanation of the cold-start window.
  - Internal LLM stage output formats section documenting the structured contracts
    for intent (HOOK/ARC/TAKEAWAY), planning (5-beat), scripting ([HOOK]/[BODY]/
    [RESOLUTION]/[CTA]), and storyboard (per-scene) stages.
  - Caption generator tone note: receives `tone: req.tone`, not `niche`; corrected
    in 8ab025a.
  - Virality oracle unavailability note for LOW\_RAM\_MODE.

---

## V6.2.11 — Video Preflight Fix And CPU-Realistic Stage Timeouts (2026-07-16)

### Video pipeline

- Fixed `commandAvailable()` in both `src/routes/video.ts` and
  `src/services/ffmpeg-video-renderer.ts`: FFmpeg 6.x rejects `--version` for
  `ffmpeg` and `ffprobe` (exit 1: `Missing argument for option '-version'`),
  which caused all video submissions on modern Ubuntu builds to fail the
  preflight with `ffprobe_unavailable` even when the tools were installed.
  Both helpers now accept a per-tool version flag; call sites pass
  `-version` for ffmpeg/ffprobe and `--version` for espeak-ng.
- Raised the upper bounds of `STAGE_TIMEOUT_BOUNDS` in
  `src/services/video-runtime-config.ts` so operators on CPU-only hosts
  (~5 tokens/sec for a 3.8B Q4_K_M model) can budget for realistic
  structured-output stages: intent_classification 30_000 → 90_000,
  planning 120_000 → 180_000, scripting 180_000 → 240_000,
  storyboard_generation 240_000 → 300_000. The defaults are unchanged; only
  the ceiling for explicit `VIDEO_*_TIMEOUT_MS` overrides is expanded.
- Updated the `video-regression-check.ts` clamp assertion accordingly.

## V6.2.10 — Shared Error Sanitization Helper (2026-07-16)

### Dashboard reliability

- Added a shared `safeErrorMessage()` helper in `src/lib/utils.ts` that guards
  against leaking absolute paths, oversized internals, or non-Error thrown
  values into the UI when a store-level sanitizer is not available.
- Sanitized the workflows page `Run failed:` and `Cancel failed:` inline
  alerts and the settings page `Save failed:` alert; all three surfaces now
  fall back to a calm generic message when the underlying error looks
  path-bearing or oversized, and expose `role="alert"` for assistive tech.
- Updated the `model-orchestrator.ts` header and `VIDEO-GENERATION.md`
  first-job admission checklist to describe the 16 GB profile alongside the
  constrained 8 GB profile.

### Tests

- Added seven `safeErrorMessage()` unit tests covering short messages, path
  redaction (POSIX and Windows), oversized-message redaction, empty
  fallback, and non-Error thrown values. Dashboard test count: 49.

## V6.2.9 — Host Profile Auto-Detection And Startup Tuning (2026-07-15)

### Runtime

- Added `SWARMX_HOST_PROFILE` with `auto`, `8gb`, and `16gb` modes to
  `scripts/startup-enhanced.sh`.
- Auto-detect hosts with roughly 12 GB or more total RAM as `16gb`, while
  preserving the constrained `8gb` profile everywhere else.
- Kept low-free-memory protection authoritative: even a `16gb` host falls back
  to constrained startup safeguards when available RAM is already below roughly
  2.2 GB.
- Raised the `16gb` startup profile to `OLLAMA_MAX_LOADED_MODELS=2`,
  `OLLAMA_KEEP_ALIVE=2m`, and default startup/predictive prewarm opt-in.

### Documentation

- Updated the README, startup guide, config reference, and example environment
  file to describe auto-detected host profiles and the explicit override path.

### Validation

- Verified `scripts/startup-enhanced.sh --check-only --verbose` under default,
  forced `8gb`, and forced `16gb` host profiles.

## V6.2.8 — Final Runtime and Dashboard Polish (2026-07-15)

### Dashboard reliability and accessibility

- Added a bounded 30-second REST fallback for the Agent Fleet only while its
  SSE connection is disconnected, so live data recovers without imposing a
  duplicate polling loop during normal streaming.
- Replaced misleading cgroup `treegrid` semantics with a native accessible
  metrics table because the API supplies a flat scope collection, not a
  parent-child hierarchy.
- Announced Agent Fleet and System loading states to assistive technology and
  increased the refresh control to a touch-friendly target.
- Removed raw route-boundary exception messages and digests from the operator
  UI while retaining structured client-side diagnostics.

### Video runtime and documentation

- Aligned API video export and render-workspace defaults with
  `configs/video.defaults.yaml`: `.swarmx/video/exports` and
  `.swarmx/video/tmp`.
- Updated the video configuration, duration, audio fallback, and first-job
  admission documentation to match source behavior.
- Reframed the obsolete V5 Modelfile document and the r7 migration manual as
  historical references; the supported policy is canonical tags with strict
  single-model residency on 8 GB hosts.

### Validation

- API regression scripts, dashboard tests, lint, workspace type checks, and
  production builds passed before release.

---

## V6.2.7 — Degraded Runtime Health Integration (2026-07-15)

### Health and performance

- Bounded `/api/system/health` Ollama liveness probes to a dedicated
  `SWARMX_SYSTEM_HEALTH_PROBE_TIMEOUT_MS` budget (default: 1500 ms).
- Stopped model-list discovery when Ollama liveness has already failed, so an
  unavailable backend returns a bounded HTTP `200` degraded response instead of
  waiting for readiness work that cannot succeed.
- Added `SWARMX_SYSTEM_HEALTH_MODEL_PROBE_TIMEOUT_MS` (default: 2500 ms) for
  bounded readiness checks after Ollama is confirmed live.

### Dashboard UX

- Centralized dashboard API/Ollama/RAM recovery guidance through a shared
  runtime policy and React Query health cache.
- Deduplicated health polling across the dashboard shell, Composer, and video
  workspace with a 12-second shared cadence, three-second client budget, and no
  automatic retry storm.
- Made API and Ollama health badges visible at compact widths and clarified
  recovery instructions in the global banner and video workspace.

### Tests and documentation

- Added pure runtime-guidance coverage and an API system-health regression
  script that validates bounded configuration and explicit offline model state.
- Updated the environment template, startup/config references, installation
  pnpm version, and canonical architecture terminology.

---

## V6.2.6 — Low-RAM Runtime Finalization & Video Render Hardening (2026-07-14)

### Runtime

- Enforced 8 GB defaults across startup, Docker, setup helpers, and health checks:
  `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_NUM_PARALLEL=1`, and `OLLAMA_KEEP_ALIVE=0`.
- Made Relay startup prewarm and speculative specialist prewarm opt-in with
  `SWARMX_MODEL_STARTUP_PREWARM=1` and `SWARMX_MODEL_PREDICTIVE_PREWARM=1`.
- Shortened request-level keep-alive windows for Relay, Pilot, and non-7B Phi4
  operators; 7B specialists continue to unload after calls outside explicit
  evolver reuse windows.
- Added pre-eviction headroom checks before 7B loads and refreshed `/api/ps`
  residency state before eviction decisions.

### Video

- Added a bounded FFmpeg render smoke test that creates and probes a real MP4.
- Required `ffmpeg`, `ffprobe`, and `espeak-ng` for local voiced production
  renders; silent output is opt-in only.
- Added artifact validation before completed status: file existence, nonzero
  size, duration, dimensions, frame rate, and format.
- Added backward-compatible creative request fields for audience, tone, style,
  caption style, and voice.

### Tooling And Docs

- Added root workspace `test`, `lint`, `typecheck`, and `build` scripts.
- Restored reproducible Python validation through project dev dependencies and
  deterministic async paths that no longer hang during default-executor teardown.
- Updated setup, startup, config, video, and low-RAM documentation with clean
  clone commands and current hardware constraints.

---

## V6.2.5 — UI/UX Polish & Accessibility Quick Wins (2026-07-05)

Systematic quality pass across all video dashboard components. Resolves WCAG AA violations, eliminates per-render object allocations, and ships the missing right-panel empty state.

### Dashboard — Accessibility

- `apps/swarmx-dashboard/src/components/video/ViralityMeter.tsx`
  - **Hoisted `<Tooltip.Provider>`** out of `DimensionBar` into a single wrapper around the dimension bars grid. Previously a new Provider context was mounted for each of the 5 bars per render.
  - Added `role="progressbar"` with `aria-valuenow/min/max` and `aria-label` to the compact variant bar — was previously an unsemantic `<div>` with no ARIA role.

- `apps/swarmx-dashboard/src/components/video/VideoJobCard.tsx`
  - Added `tabIndex={0}`, `role="button"`, `aria-label`, `onKeyDown` (Enter/Space → select), and `focus-visible:ring-2` to `<article>` — was click-only, entirely keyboard-inaccessible.
  - Cancel and download action buttons: added `focus-visible:opacity-100` and `focus-visible:ring-2` so they are reachable without a mouse (previously `opacity-0` until hover).
  - Cancel/download `aria-label` now includes the job prompt.

- `apps/swarmx-dashboard/src/components/video/CaptionEditor.tsx`
  - Added `id` attributes to all 6 form controls and matching `htmlFor` to all `<label>` elements — previously no labels were programmatically associated with their controls (WCAG 1.3.1 failure).
  - Added `role="alert"` to the rescore error container — screen readers now announce API failures immediately.
  - Sound Suggestion input: added consistent `focus:outline-none focus:ring-1 transition-colors` focus ring.
  - Error copy: replaced code-language `"firstLine cannot start with I/My/This/We/Our"` with a user-readable message.

- `apps/swarmx-dashboard/src/components/video/PlatformPublishPanel.tsx`
  - Status feedback paragraph: added `role="status"` and `aria-live="polite"` — publish outcome was previously announced only visually.
  - History scroll container: added descriptive `aria-label` with event count.

- `apps/swarmx-dashboard/src/app/(dashboard)/video/[id]/page.tsx`
  - Replaced ASCII arrows `"<- Back to Queue"` / `"Video -> "` with Unicode `←` / `→`.
  - `!job` loading state now renders `<VideoJobDetailLoading />` skeleton instead of plain text.
  - `<video>` element: added `aria-label` containing the job prompt.
  - Operator trace `<table>`: added `<caption className="sr-only">` — was a table with no accessible name.

### Dashboard — Performance

- `apps/swarmx-dashboard/src/components/video/VideoJobCard.tsx`
  - Moved `StatusBadge` status map to module-scope constant `STATUS_MAP` — was recreated on every render.

### Dashboard — UX

- `apps/swarmx-dashboard/src/app/(dashboard)/video/page.tsx`
  - Added right-panel empty state (visible above `lg` breakpoint) prompting users to select a job — layout previously left the right column blank.
  - Derived `runningCount`, `queuedCount`, `doneCount` once — was calling `jobs.filter().length` three times inline in JSX.
  - Retry button `aria-label` now includes the job prompt (first 50 chars).

- `apps/swarmx-dashboard/src/components/video/CaptionEditor.tsx`
  - Moved `DISALLOWED_OPENERS` array to module scope — was recreated on every render.

### Validation status

- `pnpm --filter @swarmx/dashboard lint` — **0 errors, 0 warnings**.
- `pnpm --filter @swarmx/dashboard typecheck` — **clean**.

---

## V6.2.4 — Accessibility, Error Boundaries & Code Quality (2026-07-05)

Systematic audit pass following V6.2.3. Adds missing Next.js route boundaries, closes accessibility gaps across all video UI components, and removes production anti-patterns.

### Dashboard — New route files

- `apps/swarmx-dashboard/src/app/(dashboard)/video/[id]/error.tsx` *(new)*
  - Error boundary for the job detail route. Shows a job-scoped error state with "Try again" and "Back to jobs" affordances. Was previously missing — any unhandled error in the detail page would propagate to the root layout boundary with no route-level recovery path.

- `apps/swarmx-dashboard/src/app/(dashboard)/video/[id]/loading.tsx` *(new)*
  - Suspense skeleton for the job detail route. Renders animated placeholder sections for the header, progress timeline, and metadata panel while the page component loads.

### Dashboard — Accessibility improvements

- `apps/swarmx-dashboard/src/components/video/CaptionEditor.tsx`
  - Added `aria-label` to "Re-score", "Copy Caption", and "Reset" action buttons. Copy button label dynamically reflects state ("Caption copied to clipboard" / "Copy full caption to clipboard").

- `apps/swarmx-dashboard/src/components/video/ViralityMeter.tsx`
  - Added `aria-label` to the "Improve" button: "Get AI recommendations to improve virality score".

- `apps/swarmx-dashboard/src/components/video/PlatformPublishPanel.tsx`
  - Added dynamic `aria-label` to the publish/schedule button that includes platform name and current state (publishing in progress, schedule, or publish).

- `apps/swarmx-dashboard/src/app/(dashboard)/video/page.tsx`
  - Added `aria-label` to draggable job containers (describes job prompt for screen readers).
  - Added `aria-label` to the "Retry from Failed Stage" button.

### API — Code quality

- `apps/swarmx-api/src/services/video-orchestrator.ts`
  - Replaced `console.log` with `process.stderr.write` for the SINGLE-7B eviction log line. Eliminates the last `console.log` in the orchestration path; all observability output now goes to stderr in a structured format consistent with pino's output stream.

- `apps/swarmx-api/src/routes/workflows.ts`
  - Replaced `res: any` with `res: import("http").IncomingMessage` in the HTTP callback. Eliminates the last untyped `any` in the API routes layer.

### Validation status

- `pnpm --filter @swarmx/dashboard lint` — **0 errors, 0 warnings**.
- `pnpm --filter @swarmx/dashboard typecheck` — verified clean.
- `pnpm --filter @swarmx/api typecheck` — verified clean.
- Python test suite (204 tests) — all passed.

---

## V6.2.3 — Production Readiness Pass (2026-07-05)

Codebase audit pass eliminating all React Compiler violations, stale Python test assertions, and unused-variable warnings introduced during the VIDEO-ALPHA integration. Zero regressions.

### Dashboard

- `apps/swarmx-dashboard/src/components/video/VideoJobCard.tsx`
  - **[V5.9-FIX-10]** Replaced impure `Date.now()` call during render (React Compiler rule violation) with a `useState` + `useEffect` ticker pattern. Elapsed time now updates every second while the job is `running` and remains stable otherwise.

- `apps/swarmx-dashboard/src/app/(dashboard)/video/page.tsx`
  - **[V5.9-FIX-11]** Removed closure over `queuedJobs` snapshot inside `handleDropOn` — the React Compiler correctly flagged this as a mutable dependency that caused the `useCallback` memoization to be skipped entirely. The callback now reads live queue state via `useVideoStore.getState().listJobs()`, which is safe inside a callback and compiler-transparent.
  - Removed the now-unnecessary `queuedJobs` derived variable.

- `apps/swarmx-dashboard/src/components/video/CaptionEditor.tsx`
  - Added `eslint-disable-next-line` comment with rationale on the intentionally unused `jobId` destructure (`_unusedJobId`) to suppress the `no-unused-vars` warning cleanly without altering the component's public API.

### Python tests

- `tests/cli/test_config_model_normalization.py`
  - Updated all three test assertions to expect APEX-17 r7 canonical tags (`instruct-phi4-pro-q8-prod`, `reason-deepseekr1-pro-q5km-prod`, `code-qwen25-pro-q5km-prod`) instead of pre-migration short names that were removed during the r7 naming migration.

- `tests/cli/test_config_validation.py`
  - Updated `test_ensure_calls_validate` canonical-tag assertion set to match r7 production tags.

### Dev dependencies

- Installed `typer`, `pytest`, and `pytest-asyncio` into the project venv to unblock previously skipping CLI and async test modules.

### Validation status

- `pnpm --filter @swarmx/dashboard lint` — **0 errors, 0 warnings** (was 3 errors, 1 warning).
- `pnpm --filter @swarmx/dashboard typecheck` — verified clean.
- `pnpm --filter @swarmx/api typecheck` — verified clean.
- `python3 -m pytest tests/cli/test_config_model_normalization.py tests/cli/test_config_validation.py` — **13/13 passed**.
- Full non-CLI test suite (204 tests) — **all passed**.

---

## V6.2.2 — VIDEO-ALPHA Integration Finish (2026-07-04)

Final integration pass for the VIDEO-ALPHA upgrade, focused on live-update wiring, route validation, dashboard correctness, and documentation hygiene.

### Highlights

- `apps/swarmx-api/src/services/ollama.ts`
  - Added centralized `generateOllamaText()` helper so video orchestration uses the shared Ollama transport path instead of embedding a direct `/api/generate` call in the orchestrator.

- `apps/swarmx-api/src/services/video-orchestrator.ts`
  - Switched stage text generation to the shared Ollama helper.
  - Preserved RAM-aware overrides and stage abort signaling while removing inline model transport logic.

- `apps/swarmx-api/src/routes/video.ts`
  - Added Zod validation for `POST /api/video/jobs/:id/resume`, `POST /api/video/jobs/reprioritize`, and `POST /api/video/caption/score`.
  - Added caption-score rate limiting at 10 requests/minute per connection, configurable via `SWARMX_VIDEO_CAPTION_SCORE_LIMIT_PER_MIN`.

- `apps/swarmx-dashboard/src/stores/video.ts`
  - Added store actions for job-specific SSE subscription, retry-from-stage, queue reprioritization, and caption rescoring.
  - Job SSE subscription now returns a teardown callback so route-level consumers can unsubscribe cleanly.

- `apps/swarmx-dashboard/src/app/(dashboard)/video/[id]/page.tsx`
  - Added job-scoped SSE subscription on mount for direct detail-route live updates.
  - Fixed publish callback behavior so successful publishes surface correct UI feedback instead of always appearing to fail.

- `apps/swarmx-dashboard/src/app/(dashboard)/video/page.tsx`
  - Added queue drag-reorder wiring for queued jobs.
  - Added retry affordance for failed jobs.

- `apps/swarmx-dashboard/src/components/video/CaptionEditor.tsx`
  - Rescoring now routes through the shared video store API instead of duplicating direct fetch logic in the component.

- `apps/swarmx-dashboard/src/components/video/PlatformPublishPanel.tsx`
  - Made returned platform URLs clickable and improved publish guidance copy.

- `apps/swarmx-dashboard/src/stores/events.ts`
  - Removed unused type aliases and cleaned a small unused-parameter warning.

- `docs/VIDEO-GENERATION.md`
  - Synchronized route coverage and examples with the implemented surface.
  - Fixed markdown structure, tables, fenced code block languages, and TOC/lint issues.
  - Documented resume/reprioritize routes, RAM admission error, caption-score endpoint, and rate-limiting behavior.

- `env.example`
  - Added `SWARMX_VIDEO_CAPTION_SCORE_LIMIT_PER_MIN` and documented the current RAM gate behavior.

### Validation status

- `pnpm --filter @swarmx/api typecheck` — verified clean.
- `pnpm --filter @swarmx/dashboard typecheck` — verified clean.
- `./scripts/rebuild-all-modelfiles.sh --validate` — verified clean.
- Grep verification for direct `/api/generate` and `/api/chat` usage in the video orchestrator path — verified clean.

## V6.2.1 — API Contract + Docs Sync (2026-07-04)

Documentation and contract-alignment pass after strict TypeScript cleanup and naming migration hardening.

### Highlights

- `apps/swarmx-api/src/types/events.ts`
  - Canonicalized API-local video lifecycle events on `{ type, timestamp, data }`.
  - Confirmed emitted variants: `video:created`, `video:queued`, `video:stage_started`, `video:progress`, `video:completed`, `video:failed`, `video:cancelled`, `video:snapshot`.

- `apps/swarmx-api/src/routes/video.ts`
  - Confirmed implemented route surface:
    - `POST /api/video/jobs`
    - `GET /api/video/jobs`
    - `GET /api/video/jobs/:id`
    - `POST /api/video/jobs/:id/cancel`
    - `GET /api/video/files/:filename`
  - Removed stale docs references to non-implemented `DELETE /api/video/jobs/:id`, `POST /api/video/jobs/:id/retry`, and `GET /api/video/health`.

- `docs/VIDEO-GENERATION.md`
  - Rewrote API examples and schemas to match current request/query/response contracts.
  - Updated SSE section to distinguish API lifecycle events from compact dashboard progress projections.
  - Corrected model/env examples to canonical tags and active dashboard env key (`NEXT_PUBLIC_API_URL`).
  - Updated architecture and troubleshooting references (`videoRoutes` registration, stage names).

- `README.md`
  - Updated video pipeline stage narrative to match the current orchestrator implementation and linked to authoritative API/video docs.

### Validation status

- `pnpm --filter @swarmx/api typecheck` — verified clean.
- `bash scripts/rebuild-all-modelfiles.sh --validate` — verified clean for canonical naming checks.

---

## V5.8 — Surgical Refinement: Gap Closure + Async Hardening (2026-05-04)

Production refinement pass closing all critical import failures, naming
collisions, path regressions, and blocking-thread anti-patterns identified
in the V5.1–V5.7 codebase. Zero architectural regressions; all V5.7
features and invariants preserved.

### Critical Fixes

**`brain/scorer.py`** — Name-collision fix
- The legacy `score_output()` in `brain/scorer.py` (3-signal, length-based)
  was shadowing the production `score_output()` in `brain/loop.py`
  (5-signal, 0.0–1.0 range) depending on Python import order. Quality
  gating was non-deterministic. Fixed: `brain/scorer.py` now re-exports
  `brain.loop.score_output` — one canonical definition.

**`brain/rag.py`** — ImportError on minimal deployments
- Bare `from memory.faiss_store import FAISSStore` at module level with no
  error handling caused `ImportError` to propagate through
  `brain/orchestrator.py` on any machine without faiss/sentence-transformers,
  crashing the entire brain subsystem. Fixed: replaced with a 4-tier
  graceful degradation chain (FAISS → TF-IDF → JSONL keyword → passthrough).

**`memory/vector_store.py`** and **`memory/faiss_store.py`** — Path regression
- Both stores wrote to `~/.swarm` (stale, pre-V5 path) instead of
  `~/.swarmx` (current, aligned with `SWARM_HOME` env and `brain/memory.py`).
  Agents running in isolated environments were silently writing memory to a
  different directory than the one being read. Fixed: both stores now use
  `Path(os.environ.get("SWARM_HOME", Path.home() / ".swarmx")) / "memory"`.

**`memory/faiss_store.py`** — Missing import guards
- `import faiss` and `from sentence_transformers import ...` were bare module-
  level imports with no try/except. Any import of `memory.faiss_store` without
  the ML stack present raised `ImportError`. Fixed: all ML imports guarded;
  `FAISSStore()` is now a factory returning `_FAISSStoreImpl` when deps are
  present, `_FallbackStore` (delegates to VectorStore) otherwise.

**`src/swarmx/core/evolution_engine.py`** — Duplicate `__all__` omits `delta_capture`
- The file had two `__all__` definitions. Python uses the last; the last one
  did not include `delta_capture`. The comment above the first `__all__`
  ("Replace the existing `__all__` with:") was a merge artifact from a PR
  that was applied as a comment block rather than a code change.
  Fixed: first `__all__` block removed; `delta_capture` added to the
  canonical (final) `__all__`.

**`agents/executor.py`** — Blocking `threading.Thread` in async event loop
- `execute_parallel()` used `threading.Thread` + `t.join()` synchronously
  inside what is now an async execution context. This deadlocked when called
  from within the V5.8 orchestrator's `asyncio.gather` path. Fixed: replaced
  with `asyncio.gather` + `asyncio.to_thread` wrapper for sync callables.

**`brain/roles.py`** and **`brain/utils.py`** — Duplicate `detect_role` stubs
- Both files contained `detect_role(task)` with different signal sets,
  duplicating `brain.dispatcher.classify()`. Downstream callers received
  inconsistent model routing depending on which module they imported from.
  Fixed: stubs removed; canonical implementation is `brain.dispatcher.classify()`.
  `brain/roles.py` rewritten as a complete role→model mapping dict with
  env-var override support. `brain/utils.py` rewritten with `chunk_tasks`,
  `flatten_results`, and `truncate` utilities.

### New Capabilities

**`orchestration/tools.py`** — Two new tools
- `semantic_search`: exposes the 3-tier vector memory to agent tool dispatch.
  Previously agents could only benefit from RAG enrichment at prompt time
  (via `brain/rag.py`); they could not query memory mid-execution.
- `diff_files`: unified diff between two safe-path files. Enables audit and
  self-improvement workflows to compare file versions through tool dispatch.

**`src/swarmx/event_bus.py`** — Typed `EventKind` constants + `subscribe()` generator
- `EventKind` class added with 20 typed event string constants. `publish()`
  now validates kinds in strict mode (`SWARMX_EVENT_STRICT=1`). `subscribe()`
  generator added for filtered event streaming. `snapshot()` extended with
  per-kind latency stats.

**`memory/__init__.py`** — `get_store()` factory
- New package entry point: `from memory import get_store` returns the best
  available store (FAISS → TF-IDF → None) without the caller needing to
  know which ML deps are installed.

**`brain/__init__.py`** — Unified public API
- All brain module entry points now importable from `brain` directly.
  Eliminates the need for callers to know the specific submodule.

### Test Coverage

New test files added:
- `tests/brain/__init__.py`
- `tests/brain/test_rag.py` — 6 tests covering all 4 degradation tiers
- `tests/brain/test_scorer.py` — 6 parametrised signal tests + collision regression
- `tests/brain/test_graph.py` — 8 DAG executor tests (parallel, cycles, skip, sync)
- `tests/memory/test_vector_store.py` — 8 tests (path, JSONL, search, clear, fallback)
- `tests/agents/__init__.py`
- `tests/agents/test_executor.py` — async parallel executor tests
- `tests/agents/test_analyzer.py` — result aggregator tests

### No Regressions

All V5.7 features preserved:
- 6-role model architecture, config-driven via `swarmx_config.yaml`
- Full async multi-turn tool call loop (max 20 steps × 6 tool calls)
- Per-tool rate limiting + circuit breaker (V5.7 ENH-01/02)
- Memory compression at 70% context threshold
- Background auto-critic (`deepseek-critic`)
- ESCALATE / BLOCK / BLOCKED envelope detection
- Atomic TaskTrace persistence
- Gödel guard (`policy.py:godel_guard()`)
- `allow_auto_deploy: false` invariant

---

## V5.1 — Surgical Merge: v2-corrected + v5 (2026-05-03)

Surgical merge of `swarmx-v2-corrected` (corrected Modelfiles, proven APEX-17 prompts) into
`swarmx-v5` (full orchestration stack, 6-role architecture). V5.1 is the canonical production base.

### Fixes Applied (from v2-corrected analysis)

**`orchestration/orchestrator.py`** — Critical CLI bug fixed
- `--critic` mode contained `audit = await ollama.chat.__func__` — a dead reference
  left from a refactor. Fixed: now correctly instantiates `SwarmXOrchestrator` and
  calls `orch.run_critic(Path(args.critic))`.
- `TaskStatus.BLOCKED` was defined in the enum but never set in the run loop.
  Fixed: BLOCK envelope from any agent now sets `trace.status = TaskStatus.BLOCKED`
  and halts execution. Was previously treated identically to step failure.
- Argparse `--help` output improved with epilog examples.
- Minor: `cached_tokens` calculation corrected (was a subtraction of identical values).

**`modelfiles/primary/`** — Missing `REQUIRES 0.5.13` directives added
- `qwen-supervisor.modelfile` — was missing (phi4 models already had it)
- `qwen-worker.modelfile` — was missing
- `deepseek-reasoner.modelfile` — was missing
- `deepseek-critic.modelfile` — was missing

**`orchestration/swarmx_config.yaml`** — Evolution model names corrected
- `evolution.models` section was absent; APEX-17 comments still referenced old
  V4 names (`phi4-mini:swarmx-evolve`, `deepseek-r1:swarmx-evolve`).
  Added explicit `evolution.models` block with V5.1 names:
  `observe: phi4-fast:swarmx-evolve`, `critique/validate: deepseek-critic`,
  `mutate: qwen2.5:swarmx-evolve`.
- Added `co_load.unsafe_pairs` entry for `deepseek-critic + deepseek-r1-evolve`.

**`orchestration/requirements.txt`** — Merged v2 deps into v5 clean layout
- Re-added `pydantic-settings>=2.3.0` (removed in v5, still needed for .env schema)
- Re-added `python-dotenv>=1.0.1` (was pinned to 1.0.0 in v5; bumped)
- Removed `asyncio>=3.4.3` (stdlib since Python 3.4 — never install via pip)
- Added framework integration comments (LangGraph / CrewAI / AutoGen)

### New Files

**`modelfiles/variants/phi4-fast-evolve.modelfile`** (new in V5.1)
- APEX-17 observe phase variant based on phi4-fast (Q8_0)
- 8k context, temperature 0.15 — fitness signal synthesis
- Emits `FITNESS_SNAPSHOT` schema for deepseek-critic consume
- Was missing in both v2 and v5; v5's config.yaml referenced it but it didn't exist

### No Regressions

All V5.0 features preserved:
- Config-driven orchestrator (all constants from swarmx_config.yaml)
- Full multi-turn tool call loop per step
- ESCALATE/BLOCK envelope detection and routing
- Background auto-critic (`traces.auto_critic`)
- 6-role model architecture (fast, worker, executor, supervisor, reasoner, critic)
- Rich CLI with argparse
- TaskTrace with escalations list and per-step tool_calls_made counter

---

## V5.0 — APEX-17 Integrated Merge (2026-05)

See full V5.0 notes in previous CHANGELOG entry below.

This is a surgical merge of four source bundles:
- **V4** — hardened parameter headers, APEX-17 system prompts, native DeepSeek + Qwen templates
- **swarmx-modelfiles-v2a** — flat 9-modelfile set with individual system prompts
- **swarmx_complete** — full Python orchestration bundle
- **swarmx-modelfiles-v2b** — structured primary/variants split, APEX-17 evolution cycle

### V5.0 Key Features

**Orchestrator** — Config-driven, tool call loop, memory compression, auto-critic, ESCALATE/BLOCK envelopes, argparse CLI

**Tools** — `http_post`, AST-level `run_python` safety, SSRF protection, `json_validate`, `summarise_text`, call log observability

**Config** — Co-load matrix, KV strategy per role, latency targets, self-improvement gate, evolution gates

**Modelfiles** — 6 primary + 3 variant; dedicated `deepseek-critic` role, `phi4-fast` router, `qwen-supervisor` + `qwen-worker` split

**Setup** — `install.sh` with version check, `health_check.py` with 6-model validation + co-load check, `test_integration.py` with `--fast` flag

---

## V4 (prior)

- V4 headers with detailed memory math per model
- APEX-17 system prompts across all 5 primary modelfiles
- Native DeepSeek-R1 TEMPLATE with `<think>` block support
- Native Qwen2.5 TEMPLATE, Phi-4 mini TEMPLATE

## swarmx_complete (prior)

- Full Python orchestration stack: orchestrator, tools, config, schemas
- health_check.py, test_integration.py, install.sh, zram_setup.sh, ollama_env.sh
- message_schemas.json, kv_cache_reference.md
