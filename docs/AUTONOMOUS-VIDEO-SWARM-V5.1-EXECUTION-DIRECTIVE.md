# THE YAP ENGINE — AUTONOMOUS 9:16 VIDEO SWARM · MASTER EXECUTION DIRECTIVE V5.1

**Repository:** `sabiscore/the-yap-engine`
**Base:** `main`
**Execution branch:** `feat/video-swarm-v5`
**Certification:** HOLD — no merge to certified/main line
**Operating mode:** repository-grounded hardening; preserve existing production subsystems
**Current audited base:** `9a12fafcece666b5159396e558b572a7782e0885`
**Primary objective:** turn a creative brief into a deterministic, evidence-backed, production-valid 9:16 MP4 using the existing SwarmXQ pipeline, without creating a parallel architecture.

---

## 0. AUTHORITY, PRECEDENCE, AND NON-NEGOTIABLES

Resolve conflicts in this order:

1. Security, secrets, data isolation, and fail-closed behavior.
2. Repository invariants in `CLAUDE.md`, `NEXUS.md`, `AGENTS.md`, and existing canonical contracts.
3. Truthful evidence and measured behavior.
4. Existing production architecture and backwards-compatible contracts.
5. Accessibility and operator safety.
6. Resource safety on constrained CPU-only hosts.
7. Audio/video quality.
8. Scope and convenience.

The repository is the source of truth. The findings in earlier V5 documents are hypotheses until re-verified against the exact execution HEAD.

Never fabricate a PASS. Every evidence claim must identify:
- commit SHA;
- branch;
- UTC timestamp;
- exact command;
- exit code;
- raw or artifact-backed output;
- affected artifact/file;
- limitations.

Never print credentials, tokens, cookies, private URLs, or secret environment values.

Never modify certification state, certification ceilings, protected resource limits, or release policy merely to obtain a green result.

---

## 1. EXECUTION STATE MACHINE

Before mutation:

```
ORIENT → READ GOVERNANCE → AUDIT EXACT HEAD → CREATE/VERIFY BRANCH
→ BASELINE → SURGICAL PATCH → TEST → REGRESSION → EVIDENCE
→ DRAFT PR → CI → REVIEW → HUMAN CERTIFICATION
```

The execution agent MUST NOT:
- merge to `main`;
- claim production certification;
- publish to TikTok or another public platform;
- introduce a second video pipeline;
- bypass a failing quality gate;
- silently weaken a threshold;
- convert a measured failure into a warning;
- rewrite baseline evidence.

If a required check cannot be run in the current environment, record `NOT EXECUTED (by design)` and provide the exact operator command.

---

## 2. EXISTING-SUBSYSTEM PRESERVATION

This is an evolutionary hardening release, not a greenfield rewrite.

Before adding any subsystem, locate and reuse the existing implementation. In particular, do not create duplicate:
- speech normalizers;
- chunkers;
- TTS providers;
- caption aligners;
- beat planners;
- audio mastering;
- FFmpeg renderers;
- QC engines;
- authentication boundaries;
- job-state machines;
- model orchestration;
- provenance/rights manifests.

A new implementation is permitted only when the existing subsystem cannot satisfy the contract and an ADR records why.

The canonical immutable stage order remains:

`intent_classification → planning → scripting → storyboard_generation → render_assembly → finalizing`

Post-pipeline:
`stageViralityAndCaption()` remains non-blocking and MUST NOT alter certification or release state.

---

## 3. MODEL / RESOURCE INVARIANTS

Preserve:
- SINGLE-7B LOCK;
- `MAX_CONCURRENT_JOBS=1`;
- `OLLAMA_NUM_PARALLEL=1`;
- `RAM_CRITICAL_MB=800`;
- `evictIncompatible()` before every incompatible 7B acquisition;
- immediate `ctx.modelsUsed[stage]` assignment after acquisition;
- canonical model tags only through `resolveCanonicalTag()`;
- every Ollama response through `sanitizeReasoningOutput()` and structured extraction through `extractJson()`.

Resource profiles are explicit:

**standard_cpu_16gb**
- 1080x1920;
- one video job;
- larger Ollama ceiling where already supported;
- no assumption of GPU availability.

**constrained_cpu_8gb**
- one video job;
- one loaded model;
- 720x1280 is permitted as the resource-safe output profile;
- physical 8 GB certification requires physical-host evidence; CI compatibility is not equivalent to physical certification.

Do not call the 8 GB profile certified solely because a GitHub runner or Docker memory limit passes.

---

## 4. OUTPUT CONTRACT

A production-valid output MUST be:

- portrait 9:16;
- exactly 1080x1920 on standard profile OR exactly 720x1280 on constrained profile;
- 30 fps;
- H.264;
- yuv420p;
- AAC;
- 48 kHz;
- stereo;
- faststart;
- final MP4;
- no missing audio;
- no silent fixture in release mode.

Audio:
- mastering target: -14.0 LUFS integrated;
- true peak target: -1.5 dBTP during mastering;
- final acceptance: integrated loudness in [-15.0, -13.0] LUFS;
- final acceptance: true peak <= -1.0 dBTP;
- LRA <= 11 where measured;
- final post-encode measurement is authoritative.

Mastering failure or post-encode measurement failure is fail-closed.

---

## 5. TEXT / SPEECH CONTRACT

Speech normalization MUST:
- remove model reasoning traces;
- remove visual/control markup;
- preserve meaningful punctuation and paragraph boundaries;
- preserve `\n\n`, ellipses, and intentional spaced-hyphen pauses;
- expand pronunciation-sensitive numbers, currencies, symbols, acronyms, and technical terms through the existing pronunciation dictionary;
- reject unresolved problematic ALL-CAPS tokens;
- reject over-budget scripts rather than truncating them;
- never perform arbitrary character truncation;
- emit deterministic chunks <= 480 characters, with a hard ceiling below 500;
- prefer paragraph → sentence → clause → word splitting;
- never split inside a word.

Prosody is punctuation/service-side only.

Bracket controls such as:
`[pause:...]`, `[speed:...]`, `[emphasis]`
are not a supported production control language. They MUST be stripped/rejected rather than interpreted.

Beat/tone speed modifiers remain deterministic and clamped to 0.90–1.10.

Kokoro:
- preserve dialect mapping already present in the repository;
- preserve native 24 kHz synthesis where applicable;
- resample only at the mastering/render boundary;
- preserve word boundaries when the provider supplies them;
- use existing fallbacks only when explicitly configured and label fallback lineage.

---

## 6. WORD ALIGNMENT CONTRACT

Alignment priority:

T1 — provider-native Kokoro word boundaries when valid.
T2 — Faster-Whisper word timestamps.
T3 — deterministic estimated timing only as a last-resort review-mode fallback; never silently present estimates as measured word timing.

Canonical script spelling must be emitted to captions. ASR timing may be used for timestamps, but ASR spelling must not overwrite canonical script text.

Acceptance:
- coverage >= 0.95;
- median native drift <= 150 ms;
- max drift <= 400 ms;
- no negative or overlapping word intervals;
- audio/video offset <= 40 ms where measurable.

Below these thresholds, G-A fails.

Estimated timing must be explicitly marked in provenance and cannot satisfy a production certification gate.

---

## 7. VISUAL / BEAT CONTRACT

Storyboard generation remains upstream of render assembly.

Beat planner MUST:
- use 5–8 storyboard intents where the source storyboard supports them;
- target 2.0–2.5 second visual cadence;
- never allow a visual hold > 3.0 seconds;
- G-P is fail-closed above 3.0 seconds; no compatibility exception is certification-valid;
- merge pathological holds < 0.8 seconds;
- snap transitions to valid word/phrase boundaries;
- never cut through a word;
- maintain contiguous, gap-free coverage;
- ensure the first frame contains the hook intent.

The existing beat planner is authoritative. Improve it rather than introducing a second planner.

---

## 8. TYPOGRAPHY CONTRACT

Author at 1080x1920 and scale for constrained output.

Use bundled, license-verified:
- Space Grotesk;
- JetBrains Mono.

Safe area:
- horizontal content box approximately x=60..940;
- vertical content box approximately y=200..1500;
- captions use the existing 480px bottom safe margin;
- maximum two caption lines;
- width is determined by actual font metrics, not a fixed character count;
- no caption may overflow the safe box;
- minimum contrast ratio 4.5:1 for normal text;
- interactive Creative Hub targets >=44x44 CSS pixels.

Typography QC must inspect actual rendered geometry when a render artifact exists. Character count alone is not an adequate typography certification.

---

## 9. AUDIO PIPELINE

Use the existing single-authority `audio-mastering.ts`.

Required sequence:

1. source audio;
2. optional deterministic cleanup;
3. loudnorm pass 1 measurement;
4. loudnorm pass 2;
5. 48 kHz stereo encode;
6. final MP4 encode;
7. post-encode ebur128 measurement;
8. G-M gate.

Do not normalize audio independently in multiple pipeline stages.

Do not fail-open after mastering or post-encode measurement errors.

---

## 10. QUALITY GATES

All gates are fail-closed.

### G-S — Script
Verify:
- target word budget;
- terminal punctuation;
- unresolved ALL-CAPS;
- normalization success;
- chunk ceiling.

### G-V — Voice
Verify:
- non-silent production voice;
- positive duration;
- duration tolerance;
- provider/voice lineage.

### G-A — Alignment
Verify:
- coverage >= 0.95;
- median drift <=150ms;
- max drift <=400ms;
- canonical script spelling;
- measured vs estimated provenance.

### G-P — Pacing
Verify:
- contiguous coverage;
- minimum 700ms;
- preferred 2.0–2.5s cadence;
- maximum 3.0s target and 3.6s hard ceiling;
- word-boundary-safe transitions.

### G-T — Typography
Verify:
- exact output canvas;
- safe geometry;
- real font metrics;
- <=2 lines;
- contrast >=4.5:1;
- no overflow.

### G-M — Audio
Verify post-encode:
- -15 to -13 LUFS;
- TP <= -1.0 dBTP;
- LRA <=11 where measured;
- 48 kHz stereo AAC.

### G-C — Rights / Provenance
Verify:
- bundled font license metadata;
- provider license;
- fallback license state;
- background/asset provenance;
- no unsupported claims.

### G-R — Media
Verify:
- exact expected dimensions;
- exact 9:16 ratio;
- H.264;
- yuv420p;
- AAC;
- 48 kHz;
- 30 fps;
- faststart;
- playable MP4.

---

## 11. CREATIVE HUB CONTRACT

The Creative Hub is an operator console, not a second execution engine.

It MUST:
- consume authoritative API state;
- never call Ollama directly;
- never derive job state independently;
- recover by fetching full job state before resubscribing to SSE;
- expose degraded states such as 502/503/504/offline;
- never display stale “certified/verified” language when evidence is missing;
- use “Signal estimate — not measured” for heuristic creative signals;
- keep terminal PTY production-isolated;
- keep write tokens server-side;
- prevent preview deployments from targeting production Neon branches;
- preserve >=44px interaction targets;
- preserve accessible contrast.

Pipeline telemetry remains R1–R8 and must reflect actual stage/gate state.

---

## 12. EVIDENCE LEDGER

Create or update:

`docs/evidence/video-swarm-v5/`

Each evidence record MUST include:

```json
{
  "schemaVersion": "1.0",
  "phase": "string",
  "status": "PASS | FAIL | IN PROGRESS | OPEN — needs operator | NOT EXECUTED (by design)",
  "repo": "sabiscore/the-yap-engine",
  "branch": "feat/video-swarm-v5",
  "commitSha": "exact SHA",
  "utc": "ISO-8601",
  "command": "exact command",
  "exitCode": 0,
  "artifacts": [],
  "notes": []
}
```

Evidence must never be retroactively rewritten to convert an earlier failure into a pass.

---

## 13. EXECUTION PHASES

### Phase 0 — Reconciliation
- verify exact HEAD;
- compare branch with main;
- inventory existing implementations;
- classify earlier V5 findings as PASS / PARTIAL / STALE / FAIL.

### Phase 1 — Security
- preserve PTY isolation;
- verify server-side write-token boundary;
- verify preview/production database isolation;
- verify degraded API behavior.

### Phase 2 — Text
- remove legacy bracket-prosody execution paths;
- preserve punctuation-only speech normalization;
- verify <=480-character chunks.

### Phase 3 — Voice
- verify Kokoro dialect routing;
- verify audio chunk boundaries;
- verify provider-native word boundaries;
- preserve fallback lineage.

### Phase 4 — Alignment
- enforce measured alignment thresholds;
- preserve canonical script spelling;
- reject unverified estimated timing for certification.

### Phase 5 — Visual
- enforce 9:16 profile resolution;
- enforce beat cadence;
- enforce typography geometry;
- preserve bundled fonts and licensing.

### Phase 6 — Mastering
- single-authority two-pass loudnorm;
- fail closed on mastering errors;
- make post-encode ebur128 authoritative.

### Phase 7 — QC
- enforce G-S/G-V/G-A/G-P/G-T/G-M/G-C/G-R;
- emit structured QC report;
- fail closed.

### Phase 8 — Hub
- preserve authoritative API state;
- harden degraded UX;
- verify accessibility and operator telemetry.

### Phase 9 — Proof
- typecheck;
- tests;
- lint;
- build;
- regression scripts;
- Windows constrained compatibility;
- CI;
- draft PR;
- evidence pack.

---

## 14. ACCEPTANCE EXTENSIONS

In addition to existing V1–V15, add:

**V16 — Existing-subsystem integrity**
No duplicate speech, alignment, beat, mastering, rendering, or QC pipeline introduced.

**V17 — Exact-head reproducibility**
Evidence identifies exact base and execution SHAs.

**V18 — Branch isolation**
All implementation changes remain on `feat/video-swarm-v5`; no certified-line mutation.

**V19 — Post-encode authority**
Final MP4 measurements, not intermediate WAV values, determine G-M.

**V20 — Fail-closed audio**
Mastering or post-encode loudness measurement failure blocks a production package.

**V21 — Measured alignment**
Production G-A requires measured/provider-native alignment or an explicitly supported measured ASR path.

**V22 — Exact media contract**
G-R rejects wrong dimensions even when the aspect ratio remains 9:16.

**V23 — Physical 8 GB honesty**
CI/resource simulation cannot be reported as physical 8 GB certification.

**V24 — Evidence integrity**
Every PASS has exact command, SHA, timestamp, and inspectable output.

---

## 15. REQUIRED EXECUTION OUTPUT

At completion, report:

1. NEXUS execution trace.
2. Exact base SHA and final branch SHA.
3. Files changed.
4. Why each change was necessary.
5. Tests actually executed.
6. CI results.
7. Video/render evidence, if an actual render was available.
8. Gates PASS/FAIL/NOT EXECUTED.
9. Residual risks.
10. Exact operator steps still required.
11. Draft PR URL.
12. Explicit certification state: **HOLD** until human release owner approves.

No overall “ready” verdict is permitted unless every required evidence gate has measured support.
