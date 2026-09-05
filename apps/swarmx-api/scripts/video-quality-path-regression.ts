import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const renderer = await readFile(new URL("src/services/ffmpeg-video-renderer.ts", root), "utf8");
const alignmentClient = await readFile(new URL("src/services/video-caption-alignment-client.ts", root), "utf8");
const aligner = await readFile(new URL("../../src/swarmx/services/video_caption_aligner.py", root), "utf8");
const modal = await readFile(new URL("../../src/swarmx/services/modal_video_renderer.py", root), "utf8");
const studio = await readFile(new URL("../../apps/swarmx-dashboard/src/app/(dashboard)/video/studio/page.tsx", root), "utf8");
const orchestrator = await readFile(new URL("src/services/video-orchestrator.ts", root), "utf8");
const apiVideoTypes = await readFile(new URL("src/types/video.ts", root), "utf8");
const dashboardVideoTypes = await readFile(new URL("../../apps/swarmx-dashboard/src/lib/video-dashboard.ts", root), "utf8");
const jobForm = await readFile(new URL("../../apps/swarmx-dashboard/src/components/video/VideoJobForm.tsx", root), "utf8");

assert.match(renderer, /alignNarrationAudio/);
assert.match(renderer, /SWARMX_VIDEO_REQUIRE_WORD_ALIGNMENT/);
assert.match(renderer, /subtitles=/);
assert.match(renderer, /alignment/);

// ADR-1: the aligned path must stay inside ONE filter_complex chain (fades,
// background motion layers, and the progress bar all survive alongside the
// ASS subtitle burn-in) instead of the old bare "format=yuv420p" + separate
// "-vf" combination, which silently dropped everything but captions.
assert.match(renderer, /CaptionOverlay/);
assert.match(renderer, /captionOverlay\.mode === "subtitles"/);
assert.ok(!/"-vf",\s*`subtitles=/.test(renderer), "subtitles must be folded into filter_complex, not a separate -vf flag");
assert.match(renderer, /accentHex: accentColor\.replace\(\/\^0x\/, ""\)/);
assert.match(renderer, /boxOpacity: Number\(styleConfig\.boxOpacity\)/);

assert.match(alignmentClient, /CaptionAlignmentStyleOptions/);
assert.match(alignmentClient, /--accent-hex/);
assert.match(alignmentClient, /--box-opacity/);

assert.match(aligner, /word_timestamps=True/);
assert.match(aligner, /SWARMX_WHISPER_DEVICE/);
assert.match(aligner, /\\k/);
assert.match(aligner, /\\c/);
assert.match(aligner, /\\\\t\(0,120/);
assert.match(aligner, /_ass_color/);
assert.match(aligner, /accent_hex/);
assert.match(aligner, /SWARMX_WHISPER_COMPUTE_TYPE/);
// ADR-1: pill-box (opaque BorderStyle 3) + pop-in scale entrance + threaded
// box opacity, so whisper-aligned captions match the cards path's styling.
assert.match(aligner, /BorderStyle,\s*Outline,\s*Shadow/);
assert.match(aligner, /,3,18,6,2,/);
assert.match(aligner, /\\\\fscx55\\\\fscy55\\\\t\(0,140,\\\\fscx100\\\\fscy100\)/);
assert.match(aligner, /box_opacity/);
assert.match(aligner, /--accent-hex/);
assert.match(aligner, /--box-opacity/);
// The pre-existing bug where --language was parsed but never threaded to
// align_audio() — fixed as part of the ADR-1 pass.
assert.match(aligner, /align_audio\(audio_path, language=language\)/);

assert.match(modal, /gpu="L4"/);
assert.match(modal, /min_containers=0/);
assert.match(modal, /MAX_CONTAINERS/);
assert.match(modal, /Retries\(max_retries=2/);
assert.match(modal, /render_one\.map\(validated\)/);
assert.match(modal, /Wan2\.2-TI2V-5B/);
assert.match(modal, /secrets=\[modal_secret\]/);

// ADR-2 (already wired as of this snapshot — locking it in as a regression
// guard, not new work): ambient bed replaces the inline single-pass
// loudnorm rather than stacking on top of it.
assert.match(renderer, /SWARMX_AUDIO_AMBIENT_BED_ENABLED/);
assert.match(renderer, /createAmbientBed/);
assert.match(renderer, /masterAudioWithBed/);

// ADR-3: template taxonomy reconciliation. `templateFamily` is the
// surviving canonical field (not `template`), extended with the two
// swarmxq-main-only values that had no equivalent in the existing eight.
for (const source of [apiVideoTypes, dashboardVideoTypes]) {
  assert.match(source, /"pov-immersion"/);
  assert.match(source, /"reddit-story"/);
}
assert.match(orchestrator, /"pov-immersion":/);
assert.match(orchestrator, /"reddit-story":/);
// The dashboard template selector must be restored, not left silently
// removed.
assert.match(jobForm, /templateFamily/);
assert.match(jobForm, /"pov-immersion"/);

// ADR-4: named background profiles must produce genuinely different layer
// sets, not just carry a label. Never reintroduce the literal `vignette`
// filter (CPU-cost rationale documented in code) — only the word appearing
// in comments about avoiding it is acceptable.
assert.match(renderer, /switch \(profile\.backgroundProfile\)/);
assert.match(renderer, /case "minimal_grid":/);
assert.match(renderer, /case "gradient_flow":/);
assert.match(renderer, /case "plasma_pulse":/);
assert.match(renderer, /case "fractal_noise":/);
assert.ok(!/vignette=/.test(renderer), "the literal vignette filter must never be added");

assert.match(studio, /useVideoStore/);
assert.match(studio, /submitJob\(request\)/);
assert.match(studio, /Make a Yap/);
// ADR-6: the primary creator surface must not lead with the internal
// runtime name ("SwarmX") in prose copy — "SwarmXQ" stays fine as the
// internal runtime identifier elsewhere, but this surface is customer-facing.
assert.ok(!/SwarmX/.test(studio), "video/studio/page.tsx copy must use Yap Engine language, not SwarmX");

// v5 finalization directive — ADR-7: pre-render quality gate. Hook and
// retention signals must be checked BEFORE storyboard/render, using only
// free, local, deterministic scoring (no LLM call, no new dependency).
assert.match(orchestrator, /generateRetentionMap/);
assert.match(orchestrator, /PRELIMINARY_HOOK_REGEN_THRESHOLD/);
assert.match(orchestrator, /highRetentionRisk/);
assert.match(orchestrator, /hookBlocked \|\| weakHook \|\| highRetentionRisk/);
assert.match(orchestrator, /preliminaryHookScore: number; retentionMap\?: RetentionMap/);
// Guards against reintroducing the disproven unrecoveredHighRiskCount gate
// (structurally always 0 in retention-map.ts as currently implemented).
assert.ok(!/unrecoveredRetentionRisk = retentionMap\.unrecoveredHighRiskCount/.test(orchestrator), "gate must use overallRisk, not the always-zero unrecoveredHighRiskCount");

// v5 finalization directive — ADR-8: free Discord/Slack webhook
// notifications. Must be fire-and-forget (never awaited on the render
// critical path) and must never throw on a broken webhook.
const webhookNotifier = await readFile(new URL("src/services/webhook-notifier.ts", root), "utf8");
assert.match(webhookNotifier, /SWARMX_DISCORD_WEBHOOK_URL/);
assert.match(webhookNotifier, /SWARMX_SLACK_WEBHOOK_URL/);
assert.match(webhookNotifier, /export function notifyJobCompleted/);
assert.match(webhookNotifier, /export function notifyJobFailed/);
assert.match(orchestrator, /notifyJobCompleted\(ctx\.job, output\)/);
assert.match(orchestrator, /notifyJobFailed\(ctx\.job, videoError\)/);
// Must only fire on TERMINAL failure (inside the retry-not-scheduled branch),
// never on every transient retry.
assert.match(orchestrator, /} else {\s*\n\s*\/\/ Terminal failure/);
assert.match(orchestrator, /notifyJobFailed\(ctx\.job, videoError\);/);

console.log("video-quality-path-regression: PASS");
