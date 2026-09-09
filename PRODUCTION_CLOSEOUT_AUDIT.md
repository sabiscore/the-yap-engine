# SwarmXQ Production Closeout Audit
# V6.2.44 · APEX-17 r8 · 2026.07.20
# Lagos precision. Global scale.

---

## I. Critical Defects Found & Fixed

### [CRITICAL-01] SYSTEM-PROMPT.md — Stale APEX.14 Model Identity (all references)

**Severity:** CRITICAL — violates APEX-17 r8 invariants in CLAUDE.md  
**File:** `SYSTEM-PROMPT.md`  
**Symptom:** System prompt § 3 uses `Phi-4-mini`, `DeepSeek-R1:7B`, `Qwen2.5-Coder` as model
identities. These are generic model family names. APEX-17 r8 requires Operator names
(`Relay`, `Pilot`, `Architect`, `Oracle`, `Forge`, `Auditor`, `Lab`) plus canonical tags.
CLAUDE.md explicitly lists `phi4-mini` (as a model name), `phi4-fast`, and `qwen-worker`
as legacy aliases that **must never appear in production**.

**Fix:** `SYSTEM-PROMPT-V3.md` — full §3 rewrite with APEX-17 r8 Operator taxonomy,
hardware-aware dispatch table, and SINGLE-7B LOCK enforcement.

---

### [CRITICAL-02] agents/video-planner.md — Prohibited Legacy Alias Tags

**Severity:** CRITICAL — violates CLAUDE.md § CRITICAL INVARIANTS  
**File:** `agents/video-planner.md`  
**Symptom:** Lines 46, 52, 75, 86, 109 use `phi4-fast`, `deepseek-reasoner`, `qwen-worker`
in model trace format and stage model assignments. These are on the explicit blocklist.
CLAUDE.md states: "Legacy aliases that must NEVER appear in production code".

**Fix:** `video-planner-apex17r8.md` — all legacy tags replaced with Operator identities
and canonical tags. Model trace format updated to `"Operator (canonical-tag):stage"`.

---

### [CRITICAL-03] SYSTEM-PROMPT.md — SINGLE-7B LOCK Not Enforced in Dispatch

**Severity:** CRITICAL — any agent using the system prompt could attempt concurrent 7B loads  
**File:** `SYSTEM-PROMPT.md`  
**Symptom:** §3 dispatch rules mention model selection but do not mention `evictIncompatible()`,
the SINGLE-7B LOCK, or RAM pressure gates. An agent following the V2.0 prompt could legally
attempt to dispatch Architect and Oracle in the same session without eviction.

**Fix:** `SYSTEM-PROMPT-V3.md` §3 — SINGLE-7B LOCK rules added to dispatch table; μ-GATE
phase in IEP-ELITE protocol blocks 7B dispatch without prior eviction check.

---

### [CRITICAL-04] SYSTEM-PROMPT.md — Version Header Reflects Stale APEX.14 State

**Severity:** HIGH — documentation divergence creates confusion for any agent reading this  
**File:** `SYSTEM-PROMPT.md`  
**Symptom:** Header shows `v2.0 · 2026.04 · IEP-ELITE-MAX`. Current baseline is
`V6.2.44 · APEX-17 r8`. Changelog in the header references APEX.13 and APEX.14 as if they
are the most recent prior versions.

**Fix:** `SYSTEM-PROMPT-V3.md` — header updated to `V3.0 · 2026.07 · APEX-17 r8 · IEP-ELITE-MAX`
with correct baseline and full changelog vs V2.0.

---

## II. High-Impact Gaps Found & Addressed

### [GAP-01] Voice Generator: Kokoro TTS Not Integrated

**Severity:** HIGH — espeak-ng alone delivers robotic narration quality  
**Files:** `ffmpeg-video-renderer.ts`, `docs/VIDEO-GENERATION.md`  
**Symptom:** Despite APEX-17 upgrade doc referencing "Kokoro TTS" in the pipeline description,
the actual renderer only implements espeak-ng. The codebase has no Kokoro TTS Python service,
no voice-map, and no fallback detection logic.

**Impact on video quality:** The storyboard from the generated video (Image.jpeg) shows clean
kinetic_text captions — but the narration audio is espeak-ng robotic quality, limiting
platform performance especially for `warm`, `cinematic`, and `narrator` tone variants.

**Fix (3 files):**
1. `kokoro_tts_server.py` — FastAPI microservice, tone→voice map, WAV output
2. `ffmpeg-renderer-kokoro-patch.ts` — renderer integration, tier detection, fallback logic
3. `SYSTEM-PROMPT-V3.md §17` — Voice Generation Registry with full install protocol

**Required env var:** `SWARMX_TTS_URL=http://localhost:8888` (optional; auto-falls back to espeak)

---

### [GAP-02] Creative Quality Gates Missing from System Prompt

**Severity:** HIGH — agents generating video content have no built-in quality enforcement  
**File:** `SYSTEM-PROMPT.md`  
**Symptom:** CLAUDE.md has extensive creative quality gates (HOOK_BLOCKLIST, TONE_RULES
completeness, virality formula, caption rules). These exist in `video-orchestrator.ts` and
`CLAUDE.md` but are NOT in `SYSTEM-PROMPT.md`. Any agent relying on the system prompt as
its only context will produce unchecked creative output.

**Fix:** `SYSTEM-PROMPT-V3.md §18 + §7` — HOOK_BLOCKLIST, TONE_RULES completeness gate,
virality formula, caption rules all added to the Swarm Coherence Invariant Pulse (§7) and
a dedicated Creative Quality Gates section (§18).

---

### [GAP-03] IEP-ELITE 7-Phase Protocol Missing from System Prompt

**Severity:** MEDIUM — referenced in CLAUDE.md agent constraints but absent from SYSTEM-PROMPT.md  
**File:** `SYSTEM-PROMPT.md`  
**Symptom:** CLAUDE.md states "Agent prompts follow the IEP-ELITE 7-phase protocol
(ORIENT → LOAD → PLAN → μ-GATE → EXECUTE → REFLECT → EMIT)". This protocol is not
reflected in the system prompt's orchestration section.

**Fix:** `SYSTEM-PROMPT-V3.md §3 [ARCH-04]` — IEP-ELITE 7-phase protocol wired into the
Operator orchestration section with explicit μ-GATE that enforces SINGLE-7B LOCK and
canonical tag validation before execution.

---

### [GAP-04] Downstream Simulation (§6) Missing RAM Pressure Awareness

**Severity:** MEDIUM — simulation could approve plans that OOM under HIGH pressure  
**File:** `SYSTEM-PROMPT.md`  
**Symptom:** §6 Predictive Downstream Simulation lists blast-radius rejection criteria but
does not mention RAM pressure. A plan that dispatches a 7B Operator under PRESSURE_CRITICAL
conditions would not be caught by §6.

**Fix:** `SYSTEM-PROMPT-V3.md §6 [FIX-02]` — explicit rejection rule: "Require a 7B Operator
load when RAM pressure is HIGH or CRITICAL → prefer degraded-mode output over full pipeline
execution that would OOM."

---

### [GAP-05] Free Toolchain Not Documented

**Severity:** MEDIUM — free stock assets, B-roll fetching, and Whisper subtitles are unlinked  
**Fix:** `SYSTEM-PROMPT-V3.md §18` — Free Toolchain Registry with Pexels API, Pixabay,
yt-dlp, Whisper subtitle generation, and Kokoro TTS install protocol.

---

## III. Video Storyboard Analysis (Image.jpeg)

The uploaded storyboard grid confirms the `kinetic_text` / `faceless_broll` pipeline is
functional. Quality assessment vs creative gates:

| Gate | Value observed | Status |
|---|---|---|
| `[HOOK]` word count | "Planning too long? Here is why you should ship daily." — 11 words | ✅ ≤18 |
| `[HOOK]` opener | Does not start with HOOK_BLOCKLIST pattern | ✅ |
| `[BODY]` escalation | Row 2: Problem → Row 3: Solution (stakes increase) | ✅ |
| `[RESOLUTION]` action | "Write one pain. Ship tomorrow." — specific, actionable | ✅ |
| `[CTA]` length | "Write one pain. Ship tomorrow." — 6 words | ✅ 5–8 |
| Tone consistency | Consistent `urgent` / `contrarian` tone across 3 acts | ✅ |
| Caption firstLine | "Planning too long?" — 17 chars | ✅ ≤40 |
| Visual tone | Dark navy (#0d1b2a) + electric blue — matches `urgent`/`minimal` | ✅ |

**Verdict:** Pipeline output meets all creative quality gates. The primary improvement
opportunity is audio quality (espeak-ng → Kokoro TTS).

---

## IV. Deliverables Summary

| File | Purpose | Action required |
|---|---|---|
| `SYSTEM-PROMPT-V3.md` | Production-ready system prompt | Replace `SYSTEM-PROMPT.md` |
| `video-planner-apex17r8.md` | Fixed video planner agent | Replace `agents/video-planner.md` |
| `kokoro_tts_server.py` | Kokoro TTS microservice | Place at `src/swarmx/services/kokoro_tts_server.py` |
| `ffmpeg-renderer-kokoro-patch.ts` | Renderer integration | Apply patch to `apps/swarmx-api/src/services/ffmpeg-video-renderer.ts` |

---

## V. Deployment Sequence

```bash
# 1. Install Kokoro TTS
pip install kokoro soundfile fastapi uvicorn
python -c "from kokoro import KPipeline; print('Kokoro OK')"

# 2. Start TTS microservice (persistent; add to startup-enhanced.sh)
python -m swarmx.services.kokoro_tts_server --port 8888 &
echo "SWARMX_TTS_URL=http://localhost:8888" >> .env

# 3. Deploy updated system prompt
cp SYSTEM-PROMPT-V3.md SYSTEM-PROMPT.md
cp SCAR-Cognitive-OS-vOmega-APEX-9.md SCAR-Cognitive-OS-vOmega-APEX-9.md.bak
cp SYSTEM-PROMPT-V3.md SCAR-Cognitive-OS-vOmega-APEX-9.md

# 4. Deploy updated video planner
cp video-planner-apex17r8.md agents/video-planner.md

# 5. Apply renderer patch (surgical — see ffmpeg-renderer-kokoro-patch.ts)
# Apply the KOKORO_VOICE_MAP, ESPEAK_SPEED_MAP, detectTtsEngine(), and
# synthesizeNarration() additions to ffmpeg-video-renderer.ts.
# Add SWARMX_TTS_URL to env.ts Zod schema.
# Add TTS_UNAVAILABLE/TTS_KOKORO_ERROR to dashboard error map.

# 6. Re-run release gate
pnpm -F @swarmx/api tsc --noEmit
pnpm -F @swarmx/types tsc --noEmit
pnpm -F @swarmx/dashboard tsc --noEmit
pnpm -F @swarmx/api vitest run     # ≥165 tests
pnpm -F @swarmx/dashboard vitest run  # ≥52 tests
npx tsx apps/swarmx-api/scripts/video-regression-check.ts
grep -n "phi4-fast\|deepseek-reasoner\|qwen-worker" SYSTEM-PROMPT.md  # → 0 hits
grep -n "phi4-fast\|deepseek-reasoner\|qwen-worker" agents/video-planner.md  # → 0 hits

# 7. Verify Kokoro TTS is live
curl http://localhost:8888/health
curl -X POST http://localhost:8888/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Planning too long? Here is why you should ship daily.", "voice": "urgent"}'
# → {"wav_b64": "...", "duration_ms": 2800, "engine": "kokoro", "voice": "am_adam"}

# 8. Run smoke test (generates real MP4)
npx tsx apps/swarmx-api/scripts/video-regression-check.ts --smoke
# Expect: MP4 ~200 KB+, espeak_duration_ms or kokoro_duration_ms in manifest

# 9. Write session memory note
cat > .serena/memories/project_v6.2.45.md << 'EOF'
# Session: 2026-07-20 · SwarmXQ Production Closeout V6.2.45

## Shipped
- SYSTEM-PROMPT.md: V3.0 · APEX-17 r8 · legacy alias purge · SINGLE-7B LOCK enforcement
- agents/video-planner.md: APEX-17 r8 operator names · Kokoro TTS voice map
- src/swarmx/services/kokoro_tts_server.py: Kokoro TTS FastAPI microservice
- apps/swarmx-api/src/services/ffmpeg-video-renderer.ts: Kokoro TTS integration

## Critical fixes
- [CRITICAL-01] SYSTEM-PROMPT.md: Phi-4-mini/DeepSeek-R1/Qwen2.5-Coder → Relay/Pilot/Architect/Oracle
- [CRITICAL-02] video-planner.md: phi4-fast/deepseek-reasoner/qwen-worker → canonical Operators
- [CRITICAL-03] SYSTEM-PROMPT.md: SINGLE-7B LOCK added to dispatch
- [CRITICAL-04] SYSTEM-PROMPT.md: Version updated to V3.0 · APEX-17 r8

## High-impact additions
- Kokoro TTS: Tier 1 voice engine, tone→voice map, FastAPI microservice
- Creative quality gates in system prompt (§7, §18)
- IEP-ELITE 7-phase protocol wired into §3
- Free toolchain registry (Pexels, yt-dlp, Whisper)

## TONE_RULES state
All 8 variants confirmed: contrarian, urgent, educational, cinematic, warm, minimal,
faceless_broll, kinetic_text. No gaps.

## Next session
- Wire Pexels B-roll fetcher as ComfyUI fallback in render_assembly stage
- Add Whisper SRT generation to finalizing stage
- Add SWARMX_TTS_URL to docker-compose.yml Ollama service env
EOF
```

---

## VI. Post-Closeout Opportunity Queue

| Priority | Item | Action |
|---|---|---|
| 1 | Pexels B-roll fetcher | Add `brollQuery` handler in render_assembly stage as ComfyUI fallback |
| 2 | Whisper SRT subtitles | Add to finalizing stage: `whisper narration.wav --model base --output_format srt` |
| 3 | Kokoro in docker-compose | Add `SWARMX_TTS_URL` to API service env in `docker-compose.yml` |
| 4 | Kokoro in startup-enhanced.sh | Auto-start TTS server before API warmup |
| 5 | `voice` field in VideoJobRequest | Expose to the dashboard VideoJobForm for user selection |
| 6 | Background music mixing | Fetch from Pixabay API; mix with narration via FFmpeg `-filter_complex amix` |
