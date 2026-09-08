import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  FULL_PIPELINE_MIN_AVAILABLE_MB,
  LOW_RAM_VIDEO_MODEL,
  PILOT_VIDEO_MODEL,
  detectAvailableMemoryMb,
  minimumRamRequiredForVideoRequest,
  resetLowRamModeCacheForTesting,
  resolveVideoModelTag,
  shouldAutoEnableLowRamMode,
  stageTimeoutMs,
} from "../src/services/video-runtime-config.js";
import { buildOllamaGenerateBody } from "../src/services/ollama.js";
import type { VideoJobRequest } from "../src/types/video.js";
import { resetEnvForTesting } from "../src/lib/env.js";

const request: VideoJobRequest = {
  prompt: "Create a 30-second faceless TikTok video about focus.",
  platform: "tiktok",
  niche: "tech",
  targetDurationSeconds: 30,
  clientRequestId: "video-regression-check",
};

delete process.env["SWARMX_VIDEO_LOW_RAM_MODE"];
delete process.env["SWARMX_VIDEO_INTENT_MODEL"];
delete process.env["SWARMX_VIDEO_PLAN_MODEL"];
delete process.env["SWARMX_VIDEO_SCRIPT_MODEL"];
delete process.env["SWARMX_VIDEO_STORYBOARD_MODEL"];
// Explicit "0" (not unset) so this baseline assertion is deterministic
// regardless of the host's live available RAM — isLowRamVideoMode() now
// falls back to a live /proc/meminfo check when the env var is unset, which
// is intentional (auto-enable on constrained hosts) but would make this
// specific assertion flaky on a real low-RAM dev box if left unset.
process.env["SWARMX_VIDEO_LOW_RAM_MODE"] = "0";
resetEnvForTesting();
resetLowRamModeCacheForTesting();
const defaultProfileRequiredMb = minimumRamRequiredForVideoRequest(request);
assert.equal(defaultProfileRequiredMb, 6170);

process.env["SWARMX_VIDEO_LOW_RAM_MODE"] = "1";
resetEnvForTesting();
resetLowRamModeCacheForTesting();
assert.equal(resolveVideoModelTag(request, "intent_classification"), LOW_RAM_VIDEO_MODEL);
assert.equal(resolveVideoModelTag(request, "planning"), LOW_RAM_VIDEO_MODEL);
assert.equal(resolveVideoModelTag(request, "scripting"), LOW_RAM_VIDEO_MODEL);
assert.equal(resolveVideoModelTag(request, "storyboard_generation"), LOW_RAM_VIDEO_MODEL);
assert.equal(minimumRamRequiredForVideoRequest(request), 3300);

process.env["SWARMX_VIDEO_LOW_RAM_MODE"] = "0";
process.env["SWARMX_VIDEO_PLAN_MODEL"] = "plan-phi4-pro-q8-prod";
resetEnvForTesting();
resetLowRamModeCacheForTesting();
assert.equal(resolveVideoModelTag(request, "planning"), "plan-phi4-pro-q8-prod");
delete process.env["SWARMX_VIDEO_PLAN_MODEL"];

const reasonerRequest = { ...request, modelTier: "reasoner" as const };
const reasonerRequiredMb = minimumRamRequiredForVideoRequest(reasonerRequest);
assert.ok(
  reasonerRequiredMb > 3300,
  `expected reasoner workflow to require more RAM than pilot mode, got ${reasonerRequiredMb}`,
);

// V6.2.42 — over-bound value is clamped to STAGE_TIMEOUT_BOUNDS[stage].max
process.env["VIDEO_PLANNING_TIMEOUT_MS"] = "999999";
assert.equal(stageTimeoutMs("planning"), 900_000);
delete process.env["VIDEO_PLANNING_TIMEOUT_MS"];

// V6.2.55 — defaults sized for CPU-only cold Q8 Pilot load + inference slack.
delete process.env["VIDEO_INTENT_CLASSIFY_TIMEOUT_MS"];
delete process.env["VIDEO_PLANNING_TIMEOUT_MS"];
delete process.env["VIDEO_SCRIPTING_TIMEOUT_MS"];
delete process.env["VIDEO_STORYBOARD_TIMEOUT_MS"];
assert.equal(stageTimeoutMs("intent_classification"), 240_000);
assert.equal(stageTimeoutMs("planning"), 300_000);
assert.equal(stageTimeoutMs("scripting"), 600_000);
assert.equal(stageTimeoutMs("storyboard_generation"), 600_000);

// V6.2.15 — shouldAutoEnableLowRamMode never overrides an explicit env value.
process.env["SWARMX_VIDEO_LOW_RAM_MODE"] = "0";
assert.equal(shouldAutoEnableLowRamMode(), false, "explicit=0 must block auto-enable");
process.env["SWARMX_VIDEO_LOW_RAM_MODE"] = "1";
assert.equal(shouldAutoEnableLowRamMode(), false, "explicit=1 must block auto-enable (already forced)");
delete process.env["SWARMX_VIDEO_LOW_RAM_MODE"];
// Threshold constant is stable and referenced by docs.
assert.equal(FULL_PIPELINE_MIN_AVAILABLE_MB, 6170);
// detectAvailableMemoryMb returns a positive number on Linux, null elsewhere.
const detected = detectAvailableMemoryMb();
assert.ok(detected === null || (typeof detected === "number" && detected > 0));

const body = buildOllamaGenerateBody({
  model: LOW_RAM_VIDEO_MODEL,
  prompt: "hello",
  keepAlive: "30s",
});
assert.equal(body.keep_alive, "30s");
const cappedBody = buildOllamaGenerateBody({
  model: LOW_RAM_VIDEO_MODEL,
  prompt: "hello",
  maxTokens: 192,
  overrides: { num_predict: 256 },
});
assert.equal((cappedBody.options as Record<string, unknown>).num_predict, 192);

const orchestratorSource = await readFile(new URL("../src/services/video-orchestrator.ts", import.meta.url), "utf8");
assert.ok(orchestratorSource.includes("parseIntentClassification"));
assert.ok(orchestratorSource.includes("buildDeterministicIntentFallback"));
assert.ok(orchestratorSource.includes("intent classification returned malformed JSON"));
assert.ok(orchestratorSource.includes("INTENT_VALIDATION_FAILED"));
assert.ok(orchestratorSource.includes("SWARMX_VIDEO_ALLOW_UNSTRUCTURED_INTENT"));
assert.ok(orchestratorSource.includes("shouldFallbackIntentToPilotLite"));
assert.ok(orchestratorSource.includes("hasPriorIntentPilotFailure"));
assert.ok(orchestratorSource.includes("recoveryModelForTextStage"));
assert.ok(orchestratorSource.includes("extractStoryboardFrames"));
assert.ok(orchestratorSource.includes("[VISUAL:"));
assert.ok(orchestratorSource.includes("starting retry with Pilot-lite"));
assert.ok(orchestratorSource.includes("retrying with Pilot-lite"));
assert.ok(orchestratorSource.includes("video text stage using Pilot-lite recovery profile"));
assert.ok(orchestratorSource.includes("unloadModel(model)"));
assert.ok(orchestratorSource.includes("PILOT_VIDEO_MODEL"));
assert.ok(orchestratorSource.includes("LOW_RAM_VIDEO_MODEL"));
assert.ok(orchestratorSource.includes("videoConfig.SWARMX_COMFYUI_URL"));
assert.ok(orchestratorSource.includes("videoConfig.SWARMX_VIDEO_HIGH_PRESSURE_DELAY_MS"));
assert.ok(orchestratorSource.includes("videoConfig.SWARMX_API_INTERNAL"));
assert.ok(orchestratorSource.includes("reinforceHookBlocklist"), "scripting prompt must support hook-blocklist regeneration");
assert.ok(
  orchestratorSource.includes("regenerating script after pre-render quality gate (hook_blocklist / weak_hook / retention_risk)"),
  "scripting stage must retry once before accepting a blocklisted hook",
);
assert.equal(orchestratorSource.includes("process.env.COMFY_HOST"), false);
assert.equal(orchestratorSource.includes("process.env.HIGH_PRESSURE_DELAY_MS"), false);
assert.equal(orchestratorSource.includes("process.env.SWARMX_API_INTERNAL"), false);
const renderStart = orchestratorSource.indexOf("async function stageRenderAssembly");
const renderEnd = orchestratorSource.indexOf("async function stageFinalizing");
assert.ok(renderStart > 0 && renderEnd > renderStart);
const renderBody = orchestratorSource.slice(renderStart, renderEnd);
assert.equal(renderBody.includes("acquireModel("), false);
assert.equal(renderBody.includes('ctx.modelsUsed["render_assembly"]'), false);

const routesSource = await readFile(new URL("../src/routes/video.ts", import.meta.url), "utf8");
assert.ok(routesSource.includes('"/files/:filename"'));
assert.equal(routesSource.includes('"/api/video/files/:filename"'), false);
// V6.2.15 — SSE handler must close cleanly on terminal jobs, not hang forever.
assert.ok(routesSource.includes("isTerminalStatus(job.status)"), "SSE must short-circuit on already-terminal jobs");
assert.ok(routesSource.includes('event.type === "video:completed"'), "SSE must close on terminal lifecycle events");

// V6.2.15 — server auto-configures LOW_RAM_MODE and prewarms video model on constrained hosts.
const serverSource = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
assert.ok(serverSource.includes("shouldAutoEnableLowRamMode()"), "server must auto-enable low-RAM mode");
assert.ok(serverSource.includes("LOW_RAM_VIDEO_MODEL"), "server must reference the video prewarm model");
assert.ok(
  serverSource.includes('import { fetchBackend } from "./services/backend-fetch-errors.js";'),
  "server startup prewarm must use fetchBackend() for stable Ollama failure classification",
);
assert.ok(
  serverSource.includes('fetchBackend(`${ollamaUrl}/api/generate`'),
  "server startup prewarm /api/generate call must use fetchBackend() rather than bare fetch()",
);
// Post-M13 fix — the shouldAutoEnableLowRamMode() check + process.env mutation
// MUST run BEFORE the first loadEnv() call. loadEnv() caches its parsed result
// on first invocation, so mutating process.env after that point is invisible
// to every later loadEnv() call (including isLowRamVideoMode()), silently
// disabling the entire low-RAM auto-enable feature on constrained hosts.
{
  const autoEnableIdx = serverSource.indexOf("if (shouldAutoEnableLowRamMode())");
  const firstLoadEnvCallIdx = serverSource.indexOf("  loadEnv();");
  assert.ok(autoEnableIdx > 0 && firstLoadEnvCallIdx > 0, "server must call both shouldAutoEnableLowRamMode() and loadEnv()");
  assert.ok(
    autoEnableIdx < firstLoadEnvCallIdx,
    "shouldAutoEnableLowRamMode() must run before the first loadEnv() call so the auto-enabled flag is visible to loadEnv()'s cache",
  );
}

// Services/routes must centralize env access through env.ts. Dynamic secrets
// and parametric overrides still stay non-cached, but not scattered at call sites.
const envSource = await readFile(new URL("../src/lib/env.ts", import.meta.url), "utf8");
assert.ok(envSource.includes("function readSecretEnv"), "env.ts must own non-cached secret access");
assert.ok(envSource.includes("function readRawEnv"), "env.ts must own parametric raw env access");
const videoAuthSource = await readFile(new URL("../src/services/video-auth.ts", import.meta.url), "utf8");
assert.ok(videoAuthSource.includes('readSecretEnv("SWARMX_VIDEO_API_TOKEN")'));
assert.equal(videoAuthSource.includes('process.env["SWARMX_VIDEO_API_TOKEN"]'), false);
const runtimeConfigSource = await readFile(new URL("../src/services/video-runtime-config.ts", import.meta.url), "utf8");
assert.ok(runtimeConfigSource.includes("readRawEnv(envName)"));
assert.ok(runtimeConfigSource.includes("readRawEnv(TEXT_STAGE_MODEL_ENV[stage])"));
assert.equal(runtimeConfigSource.includes("process.env[envName]"), false);
assert.equal(runtimeConfigSource.includes("process.env[TEXT_STAGE_MODEL_ENV[stage]]"), false);
// Post-M13 fix — shouldAutoEnableLowRamMode must check the RAW env value, not
// the Zod-defaulted cache. loadEnv().SWARMX_VIDEO_LOW_RAM_MODE is always "0" or
// "1" (both truthy strings), so checking it directly makes the function
// permanently return false and never auto-enable on constrained hosts.
assert.ok(
  runtimeConfigSource.includes('readRawEnv("SWARMX_VIDEO_LOW_RAM_MODE")'),
  "shouldAutoEnableLowRamMode must check the raw env value so unset hosts can still auto-enable low-RAM mode",
);
// Post-M13 fix #2 — isLowRamVideoMode() must NOT read loadEnv().SWARMX_VIDEO_LOW_RAM_MODE.
// Many services (composer.ts, video-queue.ts, video-orchestrator.ts, etc.) call
// loadEnv() at module TOP-LEVEL scope. ESM import side effects run before the
// importing module's own body, so those top-level loadEnv() calls populate the
// cache before server.ts's own startup code can auto-detect and set
// SWARMX_VIDEO_LOW_RAM_MODE — no statement reordering in server.ts can fix that.
// isLowRamVideoMode() must own a dedicated, self-contained cache (populated on
// first real post-import call) instead of relying on env.ts's loadEnv() cache.
assert.equal(
  /function isLowRamVideoMode\(\)[\s\S]*?\n\}/.exec(runtimeConfigSource)?.[0]?.includes("loadEnv()") ?? true,
  false,
  "isLowRamVideoMode must not read loadEnv().SWARMX_VIDEO_LOW_RAM_MODE — ESM import ordering makes that cache stale before auto-detection can run",
);
assert.ok(
  runtimeConfigSource.includes("let cachedLowRamMode"),
  "isLowRamVideoMode must memoize its own decision independent of env.ts's loadEnv() cache",
);

const m13CertSource = await readFile(new URL("./m13-live-cert.ts", import.meta.url), "utf8");
assert.ok(m13CertSource.includes('process.env["SWARMX_API_URL"]'), "M13 cert must honor SWARMX_API_URL");
assert.ok(m13CertSource.includes("FULL_PIPELINE_MIN_AVAILABLE_MB"), "M13 cert must enforce RAM preflight");
assert.ok(m13CertSource.includes("collectPreflightFailures"), "M13 cert must fail fast on degraded runtime");
assert.ok(m13CertSource.includes("No video job was submitted"), "M13 cert must avoid doomed job submission");
assert.ok(m13CertSource.includes("resolveModelsUsed"), "M13 cert must assert models from completed job output");
assert.ok(m13CertSource.includes("resolveCertificationTier"), "M13 cert must assert certification from completed job output");
assert.ok(m13CertSource.includes("hasQualityReport"), "M13 cert must assert QC from completed job output");
assert.ok(m13CertSource.includes("formatProgress"), "M13 cert must display 0–100 job progress correctly");

const composerSource = await readFile(new URL("../src/routes/composer.ts", import.meta.url), "utf8");
assert.ok(
  composerSource.includes('import { fetchBackend } from "../services/backend-fetch-errors.js";'),
  "Composer Ollama calls must use fetchBackend() so network failures classify as OLLAMA_UNAVAILABLE",
);
for (const endpoint of ["/api/chat", "/api/ps", "/api/generate"]) {
  assert.ok(
    composerSource.includes(`fetchBackend(\`${"${ollamaBase}"}${endpoint}`),
    `Composer ${endpoint} calls must use fetchBackend() rather than bare fetch()`,
  );
}
const preloadStart = composerSource.indexOf("function startModelPreload");
const preloadEnd = composerSource.indexOf("function timeoutBucketFor");
assert.ok(preloadStart > 0 && preloadEnd > preloadStart);
const preloadBody = composerSource.slice(preloadStart, preloadEnd);
assert.ok(preloadBody.includes('keep_alive: "30s"'));
assert.equal(preloadBody.includes('keep_alive: "10m"'), false);

const sseSource = await readFile(new URL("../src/plugins/sse.ts", import.meta.url), "utf8");
assert.ok(sseSource.includes("function removeSubscriber"));
assert.ok(sseSource.includes("reply.raw.destroy()"));

const typesSource = await readFile(new URL("../src/types/video.ts", import.meta.url), "utf8");
for (const errorCode of [
  "ARTIFACT_MISSING",
  "ARTIFACT_EMPTY",
  "ARTIFACT_INVALID",
  "STUB_RENDER_DISABLED",
  "FFMPEG_UNAVAILABLE",
  "FFPROBE_UNAVAILABLE",
  "ESPEAK_UNAVAILABLE",
  "FONT_UNAVAILABLE",
  "COMFY_OUTPUT_PATH_TRAVERSAL",
  "RENDER_BACKEND_INVALID",
  "INTENT_VALIDATION_FAILED",
]) {
  assert.ok(typesSource.includes(`"${errorCode}"`), `missing VideoErrorCode ${errorCode}`);
}

const tempOutput = await mkdtemp(join(tmpdir(), "swarmx-video-regression-"));
process.env["SWARMX_VIDEO_EXPORT_DIR"] = tempOutput;
process.env["SWARMX_VIDEO_ALLOW_STUB_RENDER"] = "0";
resetEnvForTesting();
const assets = await import("../src/services/video-assets.js");
assert.equal(assets.outputDir(), tempOutput);
process.env["SWARMX_VIDEO_PUBLIC_URL_BASE"] = "https://cdn.example.test/video/";
resetEnvForTesting();
assert.equal(
  assets.resolvePublicUrl("clip one.mp4"),
  "https://cdn.example.test/video/clip%20one.mp4",
);
delete process.env["SWARMX_VIDEO_PUBLIC_URL_BASE"];

const legacyOutput = await mkdtemp(join(tmpdir(), "swarmx-video-legacy-output-"));
delete process.env["SWARMX_VIDEO_EXPORT_DIR"];
process.env["VIDEO_OUTPUT_DIR"] = legacyOutput;
resetEnvForTesting();
assert.equal(assets.outputDir(), resolve(legacyOutput));
delete process.env["VIDEO_OUTPUT_DIR"];
process.env["SWARMX_VIDEO_EXPORT_DIR"] = tempOutput;
resetEnvForTesting();
await assert.rejects(
  () => assets.buildOutputMetadata({
    jobId: "missing",
    outputFilename: "missing.mp4",
    modelsUsed: {},
    request,
  }),
  /Video artifact missing/,
);

await assert.rejects(
  () => assets.buildOutputMetadata({
    jobId: "stub",
    outputFilename: "stub_stub.mp4",
    modelsUsed: {},
    request,
  }),
  /Stub render output is disabled/,
);

const realFile = join(tempOutput, "real.mp4");
await writeFile(realFile, "not-a-real-video", "utf8");
await assert.rejects(
  () => assets.buildOutputMetadata({
    jobId: "real",
    outputFilename: "real.mp4",
    modelsUsed: { intent_classification: LOW_RAM_VIDEO_MODEL },
    request,
  }),
  /Video artifact media probe failed/,
);

process.env["VIDEO_MAX_RETRIES"] = "2";
resetEnvForTesting();
const queue = await import("../src/services/video-queue.js");
const first = queue.enqueue({ ...request, clientRequestId: "queue-first" });
const second = queue.enqueue({ ...request, clientRequestId: "queue-second" });
assert.equal(queue.startJob(first.id)?.status, "running");
assert.equal(queue.startJob(second.id), null);
queue.failJob(first.id, {
  code: "TRANSIENT",
  message: "retry",
  retryable: true,
  stage: "planning",
  timestamp: new Date().toISOString(),
});
assert.equal(queue.getJob(first.id)?.status, "queued");
assert.equal(queue.startJob(first.id)?.status, "running");
queue.failJob(first.id, {
  code: "TRANSIENT",
  message: "retry second attempt",
  retryable: true,
  stage: "planning",
  timestamp: new Date().toISOString(),
});
assert.equal(queue.getJob(first.id)?.status, "queued");
assert.equal(queue.startJob(first.id)?.status, "running");
queue.failJob(first.id, {
  code: "TRANSIENT",
  message: "retry exhausted",
  retryable: true,
  stage: "planning",
  timestamp: new Date().toISOString(),
});
assert.equal(queue.getJob(first.id)?.status, "failed");
assert.equal(queue.dequeueNext()?.id, second.id);

// ── Video auth failthrough regression (Phase-1 fix) ───────────────────────────
// Verify the auth middleware returns after sending 401 (no void discards the reply).
const authSource = await readFile(new URL("../src/services/video-auth.ts", import.meta.url), "utf8");
assert.ok(
  authSource.includes("return reply.code(401).send("),
  "video-auth must use 'return reply.code(401).send()' (not void) so the handler stops on auth failure",
);
assert.equal(
  authSource.includes("void reply.code(401)"),
  false,
  "video-auth must not use 'void reply.code(401)' — execution would continue past auth failure",
);
assert.ok(
  authSource.includes("function readVideoWriteToken"),
  "video-auth must read SWARMX_VIDEO_API_TOKEN at auth-check time",
);
assert.equal(
  authSource.includes("const VIDEO_WRITE_TOKEN"),
  false,
  "video-auth must not cache SWARMX_VIDEO_API_TOKEN at module import time",
);

// ── Sanitizer integration regression (Phase-1 fix) ────────────────────────────
// All four text stages must pipe raw model output through sanitizeReasoningOutput.
const orchestratorSourceV2 = await readFile(new URL("../src/services/video-orchestrator.ts", import.meta.url), "utf8");
assert.ok(
  orchestratorSourceV2.includes("sanitizeReasoningOutput"),
  "video-orchestrator must import and use sanitizeReasoningOutput",
);
// Verify each stage calls it
for (const stage of ["stageIntentClassification", "stagePlanning", "stageScripting", "stageStoryboardGeneration"]) {
  const start = orchestratorSourceV2.indexOf(`async function ${stage}`);
  assert.ok(start >= 0, `stage function ${stage} not found`);
  const nextFn = orchestratorSourceV2.indexOf("async function stage", start + 1);
  const end = nextFn > 0 ? nextFn : orchestratorSourceV2.length;
  const body = orchestratorSourceV2.slice(start, end);
  assert.ok(
    body.includes("sanitizeReasoningOutput"),
    `${stage} must call sanitizeReasoningOutput() on raw model output`,
  );
}

// ── Preflight checks regression (Phase-2 fix) ─────────────────────────────────
// The video route must check ffmpeg, ffprobe, and a VoiceProvider before enqueuing.
const routesSourceV2 = await readFile(new URL("../src/routes/video.ts", import.meta.url), "utf8");
assert.ok(
  routesSourceV2.includes("ffmpeg_unavailable"),
  "video route must return 503 ffmpeg_unavailable when ffmpeg is absent",
);
assert.ok(
  routesSourceV2.includes("ffprobe_unavailable"),
  "video route must return 503 ffprobe_unavailable when ffprobe is absent",
);
assert.ok(
  routesSourceV2.includes("voice_provider_unavailable"),
  "video route must return 503 voice_provider_unavailable when no configured VoiceProvider is usable",
);
const rendererVoiceProviderSource = await readFile(new URL("../src/services/voice-providers.ts", import.meta.url), "utf8");
assert.ok(
  rendererVoiceProviderSource.includes("KOKORO_VOICE_MAP"),
  "VoiceProvider architecture must include Kokoro tone-to-voice resolution",
);
assert.ok(
  rendererVoiceProviderSource.includes("SWARMX_TTS_URL"),
  "Kokoro VoiceProvider must probe SWARMX_TTS_URL from validated env",
);
// The preflight block must come before queue.enqueue() so jobs are not created on failure
const preflightPos = routesSourceV2.indexOf("ffmpeg_unavailable");
const enqueuePos = routesSourceV2.indexOf("queue.enqueue(normalizedRequest)");
assert.ok(
  preflightPos < enqueuePos,
  "preflight checks must appear before queue.enqueue() in the route handler",
);

// ── V6.2.16 — Rate limiting on POST /jobs ─────────────────────────────────────
assert.ok(
  routesSourceV2.includes("exceedsJobSubmitLimit"),
  "video route must rate-limit POST /jobs via exceedsJobSubmitLimit()",
);
assert.ok(
  routesSourceV2.includes("jobSubmitRateLimit"),
  "video route must define a configurable jobSubmitRateLimit",
);
// Rate-limit check must precede both RAM check and preflight so we never
// charge a submission slot for a request we'd reject anyway on RAM/preflight.
const rateLimitPos = routesSourceV2.indexOf("exceedsJobSubmitLimit");
const ramCheckPos  = routesSourceV2.indexOf("insufficient_ram_for_video");
assert.ok(
  rateLimitPos < ramCheckPos,
  "rate-limit check must come before RAM check in the POST /jobs handler",
);

// ── V6.2.16 — Range request support in GET /files/:filename ──────────────────
assert.ok(
  routesSourceV2.includes("Content-Range"),
  "video file route must emit Content-Range header for partial content",
);
assert.ok(
  routesSourceV2.includes("Accept-Ranges"),
  "video file route must advertise Accept-Ranges: bytes",
);
assert.ok(
  routesSourceV2.includes("reply.status(206)"),
  "video file route must respond 206 Partial Content for range requests",
);
assert.ok(
  routesSourceV2.includes("range_not_satisfiable"),
  "video file route must return 416 Range Not Satisfiable for invalid ranges",
);
assert.ok(
  routesSourceV2.includes("unsupported_media_type"),
  "video file route must reject unsupported media extensions instead of defaulting to video/mp4",
);
assert.ok(
  routesSourceV2.includes("faceless_broll") && routesSourceV2.includes("kinetic_text"),
  "video route schema must accept all production tone variants used by renderer/templates",
);

// ── V6.2.16 — FFmpeg renderer: tone palette and script-section extraction ────
const rendererSource = await readFile(new URL("../src/services/ffmpeg-video-renderer.ts", import.meta.url), "utf8");
// V6.2.28 — all 8 tone variants must appear in both TONE_BACKGROUNDS and TONE_ACCENTS
const REQUIRED_TONE_KEYS = [
  "contrarian", "urgent", "educational", "cinematic",
  "warm", "minimal", "faceless_broll", "kinetic_text",
] as const;
for (const tone of REQUIRED_TONE_KEYS) {
  const hits = (rendererSource.match(new RegExp(`${tone}:`, "g")) ?? []).length;
  assert.ok(
    hits >= 2,
    `Both TONE_BACKGROUNDS and TONE_ACCENTS must define key '${tone}' (found ${hits} hit(s))`,
  );
}
assert.ok(
  rendererSource.includes("CAPTION_STYLE_CONFIGS"),
  "renderer must define per-captionStyle layout configs",
);
assert.ok(
  rendererSource.includes("extractScriptSections"),
  "renderer must extract [HOOK]/[BODY]/[RESOLUTION]/[CTA] from script text",
);
assert.ok(
  rendererSource.includes("fontSizeForText"),
  "renderer must scale font size based on card text length",
);
assert.ok(
  rendererSource.includes("lt(t,${end})"),
  "renderer must use half-open non-final caption intervals to avoid boundary overlap",
);
assert.equal(
  rendererSource.includes("between(t,"),
  false,
  "renderer must not use inclusive between() timing for adjacent caption cards",
);
// Progress bar drawn via drawbox with time-varying width expression.
assert.ok(
  rendererSource.includes("drawbox=x=0:y=ih-8"),
  "renderer must emit an animated progress bar via drawbox",
);
assert.ok(
  rendererSource.includes("buildBackgroundMotionLayers"),
  "renderer must isolate deterministic background motion layers",
);
assert.ok(
  rendererSource.includes("drawgrid=width=90:height=90"),
  "renderer must render a textured background grid instead of flat-only frames",
);
assert.ok(
  rendererSource.includes("drawgrid-and-drawbox-motion-system"),
  "template lineage must describe the upgraded local background system",
);
assert.ok(
  rendererSource.includes("STYLE_MOTION_PROFILES") && rendererSource.includes("hookBoost"),
  "renderer must keep style-aware motion profiles with hook-window amplitude boost",
);
assert.ok(
  rendererSource.includes("NICHE_ACCENT_OFFSETS") && rendererSource.includes("resolveNicheAccentColor"),
  "renderer must apply deterministic niche-aware accent transforms",
);
assert.ok(
  rendererSource.includes("Third parallax layer") && rendererSource.includes("slowPanelSpeed"),
  "renderer must keep the third slow parallax drawbox layer",
);
assert.ok(
  rendererSource.includes("synthesizeSegments") && rendererVoiceProviderSource.includes("prosodySegments"),
  "renderer must route Kokoro narration through section-aware prosody segments",
);

const workflowSource = await readFile(new URL("../src/services/video-workflows.ts", import.meta.url), "utf8");
assert.ok(
  workflowSource.includes("buildCreativeComfyPrompt"),
  "ComfyUI workflow generation must expose a creative prompt builder",
);
for (const axis of ["tone:", "niche:", "style:"]) {
  assert.ok(
    workflowSource.includes(axis),
    `ComfyUI creative prompt must include ${axis} metadata`,
  );
}

// ── V6.2.16 — Export cleanup service ─────────────────────────────────────────
const cleanupSource = await readFile(new URL("../src/services/video-cleanup.ts", import.meta.url), "utf8");
assert.ok(
  cleanupSource.includes("startVideoCleanup"),
  "cleanup service must export startVideoCleanup()",
);
assert.ok(
  cleanupSource.includes("stopVideoCleanup"),
  "cleanup service must export stopVideoCleanup()",
);
assert.ok(
  cleanupSource.includes("SWARMX_VIDEO_EXPORT_TTL_DAYS"),
  "cleanup service TTL must be configurable via SWARMX_VIDEO_EXPORT_TTL_DAYS",
);
// Server must import and call the cleanup service.
const serverSource2 = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
assert.ok(
  serverSource2.includes("startVideoCleanup()"),
  "server must call startVideoCleanup() after pollers are started",
);
assert.ok(
  serverSource2.includes("stopVideoCleanup()"),
  "server must call stopVideoCleanup() during graceful shutdown",
);

console.log("video regression checks passed");
process.exit(0);
