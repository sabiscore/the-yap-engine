# THE YAP ENGINE — AUTONOMOUS 9:16 VIDEO SWARM · MASTER SPECIFICATION & AUDIT (V5)

**Hardware Baseline**: HP EliteBook 850 G3 · 16 GB RAM · Intel Core i7-6600U (2 cores / 4 threads) · WSL2 (Ubuntu 24.04 LTS) · CPU-only inference  
**Governing Invariants**: Single-7B Lock (`OLLAMA_MAX_LOADED_MODELS=2`), `MAX_CONCURRENT_JOBS=1`, `OLLAMA_NUM_PARALLEL=1`, `RAM_CRITICAL_MB=800`, zero `console.*`, zero `-scar` legacy tags.

---

## 1. Executive Summary & Architecture

The Yap Engine Autonomous 9:16 Video Swarm is an end-to-end multi-agent pipeline designed to transform a creative brief into a production-certified, 9:16 short-form video (MP4) with:
1. **Studio-Grade Voice Narration**: Local Kokoro TTS with dialect-accurate phoneme selection (`a`/`b`), 8ms anti-click boundary crossfades, natural pause insertion, and calibrated prosody models.
2. **Word-Synced Kinetic Captions**: Faster-Whisper ASR anchored against canonical script text, rendered via high-contrast Advanced SubStation Alpha (`.ass`) typography inside platform safe zones (MarginV=480, max line width ≤ 26 characters).
3. **Paced Visual Cadence**: Deterministic beat-planning engine partitioning narration into 2–3s visual scenes (bounded between 700ms and 3600ms) with motion cues and on-screen text.
4. **Broadcast Audio Mastering**: Two-pass EBU R128 loudness normalization (-14.0 LUFS ± 1.5, True Peak ceiling ≤ -1.0 dBTP, 192 kbps AAC stereo).
5. **Autonomous Quality Gates**: Real-time evaluation of 8 fail-closed gates (`G-S` Script, `G-V` Voice, `G-A` Alignment, `G-P` Pacing, `G-T` Typography, `G-M` Audio Mastering, `G-C` Rights/Licensing, `G-R` Resolution & Format) producing structured `QcReport` artifacts.
6. **Creative Hub Operator Console**: Low-overhead Next.js 16 / Fastify 5 dashboard with container-query responsive layouts, mobile-safe 44px tap targets, real-time pipeline pulse telemetry (R1–R8), and a cached integrations observability endpoint (`GET /api/system/integrations`).

```
                    ┌──────────────────────────────────────────────┐
                    │               CREATIVE BRIEF                 │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: CONTRACTS & TEXT LAYER                                                         │
│  - Script Generator & Hook Classifier (Hook Laboratory)                                 │
│  - Pronunciation Dictionary (Tech terms, acronyms, currency, numbers)                   │
│  - Speech Normalizer (Punctuation-only prosody, terminal punctuation, SpeechPlan)       │
│  - Beat Planner (2–3 s visual cuts: HOOK → CONTEXT → INSIGHT → PROOF → CTA)             │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: STUDIO VOICE NARRATION (Kokoro TTS)                                            │
│  - Dialect isolation (lang_code "a" for American am_/af_, "b" for British bm_/bf_)      │
│  - 8 ms raised-cosine edge fade (anti-click protection on audio chunks)                 │
│  - Structural pause injection: 1.0s at ellipsis (...), 0.4s at \n\n, 0.12s join         │
│  - Voice prosody calibration lookup (wordsPerSecond & pause duration modeling)          │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: WORD-LEVEL CAPTION ALIGNMENT (Whisper Anchoring)                               │
│  - Faster-Whisper ASR transcription with word timestamps                                │
│  - Canonical script anchoring: dynamic programming alignment with fuzzy matching        │
│  - Interpolation flags for unaligned tokens & native drift median tracking (≤ 500ms)    │
│  - Space Grotesk / JetBrains Mono kinetic ASS generation (MarginV=480, max 26 chars)   │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: PROCEDURAL MOTION & VISUAL SYSTEM                                              │
│  - 9:16 Canvas (1080x1920 default, 720x1280 8GB constrained profile)                    │
│  - Layered background motion: animated drawgrid + parallax drawbox panels + hook boost  │
│  - Niche-aware accent colors & animated progress bar                                    │
│  - OFL-1.1 licensed open typography (Space Grotesk Bold, JetBrains Mono Regular/Bold)   │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 6: BROADCAST AUDIO MASTERING                                                      │
│  - Two-pass ffmpeg loudnorm filter (Target: -14.0 LUFS, TP ceiling: -1.5 dBFS)          │
│  - Post-encode ebur128 verification on final MP4 (-14 LUFS ± 1.5, True Peak ≤ -1.0 dBTP)│
│  - 192 kbps AAC stereo encoding, 48 kHz master sample rate                              │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 7: AUTOMATED QUALITY CONTROL (G-S through G-R)                                    │
│  - G-S: Script Quality Gate (word count, ALL-CAPS, terminal punctuation)                │
│  - G-V: Voice Prosody Gate (duration ratio, non-silent fixture)                         │
│  - G-A: Alignment Gate (coverage ≥ 75%, median drift ≤ 500ms)                            │
│  - G-P: Pacing Gate (visual scene holds 700ms - 3600ms)                                 │
│  - G-T: Typography Gate (line width bounds, safe zone 60-940 x 200-1500)                │
│  - G-M: Audio Mastering Gate (integrated LUFS & true peak compliance)                   │
│  - G-C: Creative Rights Gate (OFL fonts, Kokoro Apache-2.0, rights-safe background)     │
│  - G-R: Resolution & Media Encoding Gate (9:16 aspect, h264 video, aac audio)          │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 8 & 9: CREATIVE HUB & RELEASE CERTIFICATION                                       │
│  - VideoPipelinePulse: Real-time visual tracking of R1–R8 pipeline gates                │
│  - System Integrations endpoint (/api/system/integrations)                              │
│  - Release evidence pack, audit logs, and complete V1–V15 verification matrix           │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase-by-Phase Technical Audit

### Phase 0: Audit & Host Invariants
- **Constraint Enforcement**:
  - `SINGLE-7B LOCK`: Exactly one 7B model inference-active at a time via `ModelOrchestrator.evictIncompatible()`.
  - `MAX_CONCURRENT_JOBS = 1`: Strictly serial job execution prevents CPU resource starvation.
  - `OLLAMA_NUM_PARALLEL = 1`: Multi-threading parallelism disabled for CPU efficiency.
  - `RAM_CRITICAL_MB = 800`: Automatic circuit-breaker tripping when available host RAM drops below 800 MB.
  - **Zero `console.*`**: Enforced across `apps/swarmx-api/src/services` and `src/routes`; all structured logging passes through Pino (`log.*`).
  - **Zero Legacy `-scar` Tags**: Enforced across all production packages; canonical model tags pass through `@swarmx/types/operator-map`.

### Phase 1: Security & Boundary Hardening
- **Terminal PTY Isolation**:
  - `isTerminalPtyAllowed()` in `apps/swarmx-api/src/plugins/websocket.ts` disables `/ws/terminal/:sessionId` endpoints in production, under Vercel serverless runtime, or when bound to non-loopback network interfaces.
- **Environment Schema & Branch Isolation**:
  - `apps/swarmx-api/src/lib/env.ts` validates that preview deployments (`VERCEL_ENV=preview`) cannot target production database branches (`NEON_BRANCH=production`).
  - Verification: 6/6 tests passing in `apps/swarmx-api/__tests__/security-hardening.test.ts`.

### Phase 2: Contracts & Text Layer
- **Type Contracts** (`packages/swarmx-types/src/video-types.ts`):
  - `ScriptContract`: Enforces schema version `1.0`, tone, target duration, word budgets, and structured beats with emphasis and visual intent.
  - `SpeechPlan`: Pre-computed audio chunks with localized speed multipliers and trailing silence pauses.
  - `BeatPlan`: Visual beat sequencing with start/end millisecond timestamps, scene IDs, motion profiles, and text card overlays.
- **Pronunciation & Normalization**:
  - `pronunciation-dictionary.ts`: Rule-based expansion for numbers, currency (`$2.5M` → *two point five million dollars*), technical terms (`SQL` → *sequel*, `OAuth` → *oh-auth*, `FFmpeg` → *eff-eff-em-peg*), and symbols.
  - `speech-normalizer.ts`: Cleans raw LLM output, strips `<think>` reasoning traces and bracket tags, normalizes quotes and punctuation, preserves pauses (`\n\n`, `...`, ` - `), and verifies word budget tolerances.
- **Beat Planning**:
  - `beat-planner.ts`: Partitions transcript into 2–3s visual cuts, anchoring transitions to sentence or clause boundaries. Verifies that every hold stays within 700ms–3600ms.

### Phase 3: Studio Voice Narration
- **Kokoro TTS Server** (`src/swarmx/services/kokoro_tts_server.py`):
  - Dialect separation: assigns `lang_code="b"` for British voices (`bm_george`, `bf_isabella`) and `"a"` for American voices (`am_michael`, `af_nicole`, `am_adam`), preventing phonemization corruption.
  - 8ms Raised-Cosine Crossfade: `apply_audio_fade()` eliminates boundary pops and clicks between adjacent synthesized segments.
  - Punctuation-based silence injection: `1.0s` at trailing ellipsis (`...`), `0.40s` at paragraph breaks (`\n\n`), and `0.12s` between beat segments.
  - Explicit speed preservation: Allows callers to explicitly request `speed=1.0` without being overridden by default tone speed presets.
- **Voice Prosody Calibration**:
  - Calibrated pause durations, words-per-second rates, and real-time factors across core voices documented in `docs/voice-prosody-calibration.json`.
  - Calibration runner script: `apps/swarmx-api/scripts/voice-prosody-calibration.ts`.

### Phase 4: Word-Level Caption Alignment
- **Whisper Anchoring Aligner** (`src/swarmx/services/video_caption_aligner.py`):
  - Accepts canonical script text via `--script` flag and maps Faster-Whisper ASR word timestamps to script words.
  - Generates `AlignmentContract` containing per-word start/end times, confidence scores, and interpolation flags.
  - Emits ASS subtitles styled with Space Grotesk Bold, 64pt font, 480px vertical safe margin, semi-opaque black pill background (`box_alpha`), and pop-in karaoke tags (`\k` highlight animations).
  - Enforces max line length ≤ 26 characters (≤ 880px width on 1080px canvas) to eliminate edge clipping on mobile viewports.

### Phase 5: Procedural Motion & Visual System
- **Renderer Engine** (`apps/swarmx-api/src/services/ffmpeg-video-renderer.ts`):
  - Procedural background motion system utilizing FFmpeg `drawgrid` and `drawbox` filters with sinusoidal motion expressions.
  - Style motion profiles (`STYLE_MOTION_PROFILES`) with amplitude boost during the first 3 seconds (hook window).
  - Dynamic resolution via `resolveVideoResolution()`: Defaults to 1080x1920 (9:16); automatically adapts to 720x1280 when running on constrained 8GB hardware profiles.
  - Self-hosted OFL fonts: `SpaceGrotesk-Bold.ttf`, `JetBrainsMono-Bold.ttf`, and `JetBrainsMono-Regular.ttf` located in `assets/fonts/` and `apps/swarmx-dashboard/public/fonts/`.

### Phase 6: Broadcast Audio Mastering
- **Two-Pass EBU R128 Mastering** (`apps/swarmx-api/src/services/audio-mastering.ts`):
  - Single-authority mastering pass: High-pass rumble filter (80 Hz, 12 dB/oct), soft-knee dynamic compressor, and two-pass `loudnorm` filter targeting `-14.0 LUFS` with True Peak limit at `-1.5 dBFS`.
  - Post-encode verification: `measurePostEncodeLoudness()` runs `ffmpeg -filter_complex ebur128=peak=true` on the finalized MP4.
  - Gate compliance: Integrated loudness must land within `-14.0 LUFS ± 1.5 dB` and True Peak must not exceed `-1.0 dBTP`.
  - Audio codec: AAC stereo at 192 kbps, 48 kHz.

### Phase 7: Automated Quality Control (G-S to G-R)
- **Quality Gates Engine** (`apps/swarmx-api/src/services/quality-gates.ts`):
  - Evaluates 8 independent gates on every completed render:
    - **`G-S` (Script Gate)**: Word count within target duration tolerance (2.6 words/sec ± 35%), ALL-CAPS words ≤ 2, terminal punctuation present.
    - **`G-V` (Voice Gate)**: Non-zero audio duration within 60%–140% of target, non-silent audio fixture.
    - **`G-A` (Alignment Gate)**: Alignment coverage ≥ 75%, median drift ≤ 500ms.
    - **`G-P` (Pacing Gate)**: Beat holds strictly bounded between 700ms and 3600ms.
    - **`G-T` (Typography Gate)**: Safe box vertical margin ≥ 400px (MarginV=480), no single token > 35 characters.
    - **`G-M` (Audio Mastering Gate)**: Integrated LUFS within `-14.0 ± 2.0 LUFS`, True Peak ≤ `-0.8 dBTP`.
    - **`G-C` (Creative Rights Gate)**: Font assets OFL-1.1 certified, audio Kokoro Apache-2.0, procedural graphics rights-safe.
    - **`G-R` (Resolution & Format Gate)**: 9:16 aspect ratio, H.264 video, AAC audio.
  - Emits `QcReport` (`qc-report.json`) into the job artifact directory.

### Phase 8: Creative Hub Operator Experience
- **Telemetry & Integrations Endpoint**:
  - `GET /api/system/integrations` in `apps/swarmx-api/src/routes/system.ts`: Cached for 60 seconds; reports health and connectivity for Neon PostgreSQL, Upstash Redis, Vercel, Render backends, Ollama, Kokoro TTS, FFmpeg/FFprobe binaries, Slack/Discord webhooks, TikTok publication gates, and AWS Phase-D.
- **Pipeline Pulse Display**:
  - `apps/swarmx-dashboard/src/components/video/VideoPipelinePulse.tsx`: Renders real-time status and animated pulse indicators for all 8 hardening gates (`R1` Speech, `R2` Voice, `R3` Align, `R4` Beats, `R5` Typo, `R6` Master, `R7` Render, `R8` QC Cert).
- **Mobile Usability & Neutral Copy**:
  - 44px minimum tap targets across all interactive controls (`min-h-11 min-w-11`).
  - Strict copy compliance: Unmeasured virality heuristics are labelled `"Signal estimate — not measured"`.

### Phase 9: Proof, Verification & Operations
- Complete monorepo test coverage, benchmark harnesses, and verified acceptance matrix.

---

## 3. Master Acceptance Matrix (V1 through V15)

| Ref | Acceptance Criterion | Implementation Location | Verification Command | Status |
|:---|:---|:---|:---|:---:|
| **V1** | **Single 7B Lock & Memory Gating**<br>Only one 7B model resident; MAX_CONCURRENT_JOBS=1; 800MB RAM floor | `apps/swarmx-api/src/services/model-orchestrator.ts`<br>`apps/swarmx-api/src/services/memory-guard.ts` | `pnpm -F @swarmx/api test -- -t "memory"` | **PASS** |
| **V2** | **Zero `console.*` Invariant**<br>No `console.log/error/warn` in API services or routes; Pino logger only | `apps/swarmx-api/src/lib/logger.ts`<br>`apps/swarmx-api/src/services/*` | `grep -rn 'console\.' apps/swarmx-api/src/services apps/swarmx-api/src/routes` (0 hits) | **PASS** |
| **V3** | **Canonical Tag Resolution**<br>All model tags pass through `@swarmx/types/operator-map`; zero `-scar` tags | `packages/swarmx-types/src/operator-map.ts`<br>`apps/swarmx-api/src/services/ollama.ts` | `grep -rn '\-scar' apps/ packages/ src/swarmx/ --exclude-dir=.next --exclude-dir=node_modules` (0 hits) | **PASS** |
| **V4** | **Sanitize Reasoning Output**<br>DeepSeek `<think>` tags stripped; `extractJson()` used for structured output | `apps/swarmx-api/src/services/reasoning-sanitizer.ts` | `pnpm --filter @swarmx/api exec tsx scripts/reasoning-sanitizer-regression.ts` | **PASS** |
| **V5** | **Terminal PTY Endpoint Gating**<br>PTY WebSocket disabled in production, serverless, or non-loopback binds | `apps/swarmx-api/src/plugins/websocket.ts`<br>`apps/swarmx-api/src/server-runtime.ts` | `pnpm -F @swarmx/api test -- -t "security-hardening"` | **PASS** |
| **V6** | **Preview Environment Isolation**<br>Zod refinement prevents preview envs targeting production Neon branches | `apps/swarmx-api/src/lib/env.ts` | `pnpm -F @swarmx/api test -- -t "env"` | **PASS** |
| **V7** | **Speech Normalizer & Pronunciation**<br>Dictionary expansions, terminal punctuation check, SpeechPlan output | `apps/swarmx-api/src/services/speech-normalizer.ts`<br>`apps/swarmx-api/src/services/pronunciation-dictionary.ts` | `pnpm -F @swarmx/api test -- -t "speech-normalizer"` | **PASS** |
| **V8** | **Kokoro TTS Studio Narration**<br>Dialect separation (`a`/`b`), 8ms anti-click crossfade, natural pauses | `src/swarmx/services/kokoro_tts_server.py`<br>`docs/voice-prosody-calibration.json` | `pnpm -F @swarmx/api test -- -t "kokoro-audio-pipeline"` | **PASS** |
| **V9** | **Word-Synced Caption Alignment**<br>Faster-Whisper anchored to script; kinetic ASS captions with MarginV=480 | `src/swarmx/services/video_caption_aligner.py`<br>`apps/swarmx-api/src/services/video-caption-alignment-client.ts` | `pnpm -F @swarmx/api test -- -t "video-regression-check"` | **PASS** |
| **V10** | **Beat Planner 2–3s Cadence**<br>Visual holds between 700ms and 3600ms; transition anchoring to clauses | `apps/swarmx-api/src/services/beat-planner.ts` | `pnpm -F @swarmx/api test -- -t "beat-planner"` | **PASS** |
| **V11** | **Procedural Motion & Open Fonts**<br>drawgrid/drawbox motion; Space Grotesk / JetBrains Mono OFL fonts | `apps/swarmx-api/src/services/ffmpeg-video-renderer.ts`<br>`assets/fonts/*` | `pnpm -F @swarmx/api test:video` | **PASS** |
| **V12** | **Broadcast Audio Mastering**<br>Two-pass loudnorm; -14 LUFS ± 1.5, True Peak ≤ -1.0 dBTP, 192k AAC | `apps/swarmx-api/src/services/audio-mastering.ts` | `pnpm -F @swarmx/api test -- -t "audio-mastering"` | **PASS** |
| **V13** | **Autonomous 8-Gate QC Report**<br>G-S through G-R evaluated fail-closed; structured `qc-report.json` | `apps/swarmx-api/src/services/quality-gates.ts` | `pnpm -F @swarmx/api test -- -t "quality-gates"` | **PASS** |
| **V14** | **Creative Hub Integrations & Pulse UI**<br>Cached `/api/system/integrations` endpoint; R1–R8 pulse status display | `apps/swarmx-api/src/routes/system.ts`<br>`apps/swarmx-dashboard/src/components/video/VideoPipelinePulse.tsx` | `pnpm -F @swarmx/dashboard test` | **PASS** |
| **V15** | **Monorepo Build & Integrity Green**<br>Clean tsc, vitest, next build, ruff lint, openclaw validation | Repository Root | `pnpm typecheck && pnpm test && pnpm validate:openclaw` | **PASS** |

---

## 4. Operational Runbook

### 4.1 Development & Staging Setup

```bash
# 1. Environment bootstrap
cp env.example env.local
# Set SWARMX_VIDEO_API_TOKEN, SWARMX_DASHBOARD_ACCESS_TOKEN in env.local

# 2. Typecheck entire monorepo (Types, API, Dashboard)
pnpm typecheck

# 3. Run all unit and contract tests
pnpm test

# 4. Run OpenClaw integration boundary validation
pnpm validate:openclaw

# 5. Run Python linter
./.venv/bin/python -m ruff check .
```

### 4.2 Local Docker Compose (8 GB vs 16 GB)

- **8 GB Mode (`docker-compose.8gb.yml`)**:
  - Redis: `96m`
  - Ollama: `3800m` (`OLLAMA_KEEP_ALIVE=0`, `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_NUM_THREADS=2`)
  - SwarmX Python (Kokoro/Whisper): `600m`
  - SwarmX API: `512m`
  - SwarmX Dashboard: `384m`
  - Resolution: 720x1280
  - Launch: `docker compose -f docker-compose.yml -f docker-compose.8gb.yml up -d`

- **16 GB Mode (`docker-compose.16gb.yml`)**:
  - Ollama: `8g` (`OLLAMA_KEEP_ALIVE=5m`, `OLLAMA_MAX_LOADED_MODELS=2`, `OLLAMA_NUM_THREADS=4`)
  - SwarmX Python: `1500m`
  - SwarmX API: `1024m`
  - SwarmX Dashboard: `512m`
  - Resolution: 1080x1920
  - Launch: `docker compose -f docker-compose.yml -f docker-compose.16gb.yml up -d`

### 4.3 Troubleshooting Guide

| Symptom | Cause | Remediation |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:6379` in unit tests | Redis is not running locally during tests | Tests mock Redis or gracefully fall back; start local redis if running live workers |
| `VOICE_PROVIDER_UNAVAILABLE` | Kokoro TTS server offline and silent audio disallowed | Verify `SWARMX_TTS_URL` or set `SWARMX_VIDEO_ALLOW_SILENT_AUDIO=1` in testing |
| `ALIGNMENT_FAILED` | Faster-Whisper failed or missing Python dependencies | Check `./.venv/bin/python -m swarmx.services.video_caption_aligner --help` |
| `G-M Loudness gate failed` | Input audio was pre-clipped or ffmpeg loudnorm diverged | Verify audio normalization and run `apps/swarmx-api/__tests__/audio-mastering.test.ts` |
| `G-P Beat holds too long` | Script beat lacked punctuation or natural pause points | Ensure script normalizer runs with sentence punctuation breaks |
| `PTY WebSocket 404/disabled` | Environment is production or bound to non-loopback | Expected behavior per security invariant V5; terminal PTY is dev-only |
