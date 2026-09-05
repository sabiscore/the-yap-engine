/**
 * apps/swarmx-api/src/services/video-orchestrator.ts
 * SwarmXQ Video Subsystem — Pressure-Aware Orchestrator
 *
 * Version : v2026.8.5-apex17-r8
 *
 * Fixes applied in r7 (correctness pass on r6):
 *   [VOT-09] stageRenderAssembly() now fully destructures { modelTag, overrides }
 *            from acquireModel() for consistency. Previously only `modelTag` was
 *            destructured; `overrides` was silently dropped. This stage does not
 *            call ollamaGenerate() so overrides are not forwarded — they are
 *            captured with an underscore-prefixed binding and a comment explaining
 *            why. This removes the inconsistency and prevents future developers
 *            from re-introducing the pattern without noticing.
 *   [VOT-10] modelsUsed recording moved from runStage() into each individual
 *            stage function. Previously runStage() called resolveModelTag() a
 *            second time after the stage fn completed. This meant:
 *            (a) If resolveCanonicalTag() produced a different result between
 *            the acquireModel() call and the runStage() bookkeeping call (e.g.
 *            during alias map hot-reload), modelsUsed would record a different
 *            tag than was actually used.
 *            (b) stageFinalizing() correctly had no modelsUsed entry because it
 *            calls no model — this is preserved.
 *            Fix: each stage fn sets ctx.modelsUsed[stage] = model immediately
 *            after acquireModel() resolves. The assignment in runStage() is
 *            removed entirely.
 *   [VOT-11] high pressure level now triggers a configurable backoff delay
 *            instead of silently passing through. On an 8 GB RAM system, "high"
 *            means between 1500 MB and 2500 MB available — a real signal that
 *            a 7B model load could trigger OOM without sufficient headroom.
 *            Behavior: 3-second delay (overridable via SWARMX_VIDEO_HIGH_PRESSURE_DELAY_MS
 *            env var), then a re-check. If the re-check is still "high", the
 *            job proceeds (graceful degradation). If it escalated to "critical",
 *            the job fails with PRESSURE_CRITICAL. This adds one network probe
 *            only on the high-pressure path.
 *   [VOT-12] comfyRunWorkflow() poll loop ceiling is now derived from
 *            STAGE_TIMEOUT_MS["render_assembly"] instead of being an independent
 *            literal. Previously the poll loop allowed up to 300 s (60 × 5 s)
 *            but the stage timeout was 240 s — they raced independently with no
 *            coordination. The corrected ceiling is
 *            Math.floor(STAGE_TIMEOUT_MS["render_assembly"] / COMFY_POLL_INTERVAL_MS)
 *            = 48 iterations. The constants are co-located with a comment so
 *            future edits to STAGE_TIMEOUT_MS["render_assembly"] automatically
 *            tighten the poll loop.
 *
 * Fixes applied in r6 (APEX-17 canonical rename + correctness pass):
 *   [VOT-07] Added resolveCanonicalTag import from model-orchestrator.
 *            resolveModelTag() now applies alias resolution as a final pass
 *            so callers that supply a legacy modelTier value (or any unrecognized
 *            tier key that falls through to STAGE_MODEL_TAG) always receive a
 *            canonical name. Without this, a caller passing modelTier: "qwen"
 *            would silently fall through to the STAGE_MODEL_TAG default, which
 *            is already canonical — but any external caller injecting a legacy
 *            tag string into modelTier would bypass the alias system entirely.
 *   [VOT-08] All STAGE_MODEL_TAG and tierMap values updated to canonical
 *            production names (APEX-17-r5 rename). Comments corrected.
 *
 * Fixes applied in r5:
 *   [VOT-01] Removed unused imports VIDEO_JOB_STAGE_ORDER / stageIndex /
 *            computeOverallProgress — caused TS2305 "no exported member" errors.
 *   [VOT-02] Removed REQUIRES_7B_LOCK constant — dead code.
 *   [VOT-03] ollamaGenerate() now accepts ModelOverrides and merges numCtx /
 *            numPredict from the orchestrator into Ollama options.
 *   [VOT-04] acquireModel() returns { modelTag, overrides } instead of bare
 *            string. All stage callers destructure and forward overrides.
 *   [VOT-05] stageController() uses { once: true } on both listeners to
 *            prevent indefinite listener accumulation on jobAbortSignal.
 *   [VOT-06] isComfyAvailable() stores abort listener reference and calls
 *            removeEventListener() in finally block.
 *
 * Responsibilities:
 *   - Stage-by-stage pipeline execution
 *   - Pressure monitor gating before each stage
 *   - SINGLE-7B LOCK enforcement via ModelOrchestrator
 *   - DeepSeek/Qwen output sanitization via reasoning-sanitizer
 *   - RAM-aware ctx/predict overrides applied per stage
 *   - AbortController per stage fetch (no connection leaks)
 *   - SSE event emission via broadcaster callback
 */

import type {
  VideoJob,
  VideoJobStage,
  VideoStageProgress,
  VideoJobError,
  VideoOutputMetadata,
  VideoJobRequest,
} from "../types/video.js";
import type { OperatorTraceEntry, ScriptQualityWarning, RetentionMap } from "@swarmx/types/video-types";
// [VOT-01] Removed: VIDEO_JOB_STAGE_ORDER, stageIndex, computeOverallProgress
// were imported but never used — caused TypeScript "no exported member" errors.
import type { SwarmXEvent } from "../types/events.js";
import {
  makeVideoProgressEvent,
  makeVideoCompletedEvent,
  makeVideoFailedEvent,
} from "../types/events.js";
import * as queue from "./video-queue.js";
import * as assets from "./video-assets.js";
import {
  ModelOrchestrator,
  type ModelOverrides,
} from "./model-orchestrator.js";
import { resolveOperatorName } from "@swarmx/types/operator-map";
import { getComfyUIClient } from "./comfyui-client.js";
import { ModalVideoRenderBackend } from "./modal-video-render-backend.js";
import type { RenderSegmentTask } from "./video-render-backend.js";
import { buildCreativeComfyPrompt, generateLTXWorkflow } from "./video-workflows.js";
import { scoreVirality } from "./virality-scorer.js";
import { generateCaptionDraftWithValidation } from "./caption-generator.js";
import { generateOllamaText } from "./ollama.js";
import { fetchBackend } from "./backend-fetch-errors.js";
import { log } from "../lib/logger.js";
import { HOOK_BLOCKLIST, findHookBlocklistViolations } from "../lib/creative-quality.js";
import { classifyHookFamily, validateHookCandidate } from "../lib/hook-laboratory.js";
import { generateRetentionMap } from "./retention-map.js";
import { notifyJobCompleted, notifyJobFailed } from "./webhook-notifier.js";
import { tracer, SpanStatusCode, trace } from "../lib/tracer.js";
import { renderWithFfmpeg, type FfmpegRenderPackage } from "./ffmpeg-video-renderer.js";
import { sanitizeReasoningOutput } from "./reasoning-sanitizer.js";
import { validateStageResult, type ValidatedStage } from "./stage-schemas.js";
import { certifyProductionPack } from "./creative-factory-certification.js";
import { toVideoJobError } from "./video-error-classification.js";
import type { StageValidationEntry } from "../types/video.js";
import {
  LOW_RAM_VIDEO_MODEL,
  PILOT_VIDEO_MODEL,
  resolveVideoModelTag,
  stageTimeoutMs,
  type TextVideoJobStage,
} from "./video-runtime-config.js";
import { loadEnv } from "../lib/env.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const videoConfig = loadEnv();
const COMFY_BASE = videoConfig.SWARMX_COMFYUI_URL;
const GOVERNOR_BASE = videoConfig.SWARMX_API_INTERNAL;

/**
 * [VOT-11] Backoff delay (ms) applied when governor reports "high" pressure.
 * Configurable via env so staging can tune without a code change.
 * Default: 3000ms (3 seconds). Acceptable range: 1000–30000 ms.
 */
const HIGH_PRESSURE_DELAY_MS = videoConfig.SWARMX_VIDEO_HIGH_PRESSURE_DELAY_MS;
const RETRY_BASE_DELAY_MS = videoConfig.SWARMX_VIDEO_RETRY_BASE_DELAY_MS;
const RETRY_MAX_DELAY_MS = videoConfig.SWARMX_VIDEO_RETRY_MAX_DELAY_MS;
const RETRY_JITTER_MS = videoConfig.SWARMX_VIDEO_RETRY_JITTER_MS;

/** Per-stage timeout matrix (ms) — aligned with architecture review §3. */
const STAGE_TIMEOUT_MS: Record<VideoJobStage, number> = {
  intent_classification:  stageTimeoutMs("intent_classification"),
  planning:              stageTimeoutMs("planning"),
  scripting:             stageTimeoutMs("scripting"),
  storyboard_generation: stageTimeoutMs("storyboard_generation"),
  render_assembly:      stageTimeoutMs("render_assembly"),
  finalizing:            stageTimeoutMs("finalizing"),
};

/**
 * [VOT-12] ComfyUI polling constants — co-located so edits to
 * STAGE_TIMEOUT_MS["render_assembly"] automatically tighten the poll ceiling.
 *
 * Previously the poll loop ran up to 60 × 5s = 300s but the stage timeout
 * was 240s — independent literals that raced with no shared contract.
 * Now COMFY_POLL_MAX_ATTEMPTS is derived from the stage timeout so the two
 * are always in sync. At 240s / 5s = 48 iterations maximum.
 */
const COMFY_POLL_INTERVAL_MS   = 5_000;
const COMFY_POLL_MAX_ATTEMPTS  = Math.floor(
  STAGE_TIMEOUT_MS["render_assembly"] / COMFY_POLL_INTERVAL_MS
); // = 48

// ─── Types ────────────────────────────────────────────────────────────────────

export type BroadcastFn = (event: SwarmXEvent) => void;

interface OrchestratorContext {
  job: VideoJob;
  broadcast: BroadcastFn;
  /** Abort signal for the entire job — set externally when cancel is requested. */
  jobAbortSignal: AbortSignal;
  startedAt: number;
  modelsUsed: Partial<Record<VideoJobStage, string>>;
  scriptText?: string;
  storyboardFrames?: string[];
  viralitySummary?: string;
}

function toPublicStatus(stage: VideoJobStage): string {
  const map: Record<VideoJobStage, string> = {
    intent_classification: "classifying",
    planning: "staging",
    scripting: "scripting",
    storyboard_generation: "staging",
    render_assembly: "generating",
    finalizing: "reviewing",
  };
  return map[stage];
}

function pushOperatorTrace(
  job: VideoJob,
  entry: OperatorTraceEntry,
): void {
  if (!job.operatorTrace) {
    job.operatorTrace = [];
  }
  job.operatorTrace.push(entry);
}

function pushStageValidation(job: VideoJob, entry: StageValidationEntry): void {
  if (!job.stageValidationTrace) {
    job.stageValidationTrace = [];
  }
  job.stageValidationTrace.push(entry);
  if (!entry.passed) {
    log.warn({
      code: "STAGE_SCHEMA_INVALID",
      jobId: job.id,
      stage: entry.stage,
      issues: entry.issues,
    }, "stage schema validation failed — falling back to safe default");
  }
}

function runStageValidation<S extends ValidatedStage>(
  job: VideoJob,
  stage: S,
  candidate: unknown,
): ReturnType<typeof validateStageResult<S>>["data"] {
  const { entry, data } = validateStageResult(stage, candidate);
  pushStageValidation(job, entry);
  return data;
}

function recordOperatorTrace(
  ctx: OrchestratorContext,
  stage: VideoJobStage,
  model: string,
  startedAt: string,
  success: boolean,
  tokenCount = 0,
  latencyMs = 0,
): void {
  pushOperatorTrace(ctx.job, {
    stage: toPublicStatus(stage),
    operatorTag: model,
    modelTag: model,
    operator: traceOperatorFor(model),
    startedAt,
    completedAt: new Date().toISOString(),
    latencyMs,
    tokenCount,
    success,
    timestamp: startedAt,
  });
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("no JSON object found");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function parseIntentClassification(raw: string): { intent: string; complexity: number } {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("intent classification is not an object");
  }
  const candidate = parsed as Record<string, unknown>;

  // Base intent from the "intent" key.
  let intent = typeof candidate["intent"] === "string" ? candidate["intent"].trim() : "";

  // The 3.8B model often outputs ARC and TAKEAWAY as separate top-level keys
  // instead of packing them into the intent string. Repack them when they appear.
  if (intent && !intent.includes("| ARC:") && !intent.includes("| TAKEAWAY:")) {
    const arc      = typeof candidate["ARC"]      === "string" ? candidate["ARC"].trim()      : "";
    const takeaway = typeof candidate["TAKEAWAY"] === "string" ? candidate["TAKEAWAY"].trim() : "";
    if (arc)      intent += ` | ARC: ${arc}`;
    if (takeaway) intent += ` | TAKEAWAY: ${takeaway}`;
  }

  if (!intent) throw new Error("intent classification failed schema validation");

  // complexity is optional — model frequently omits it; default to 0.5.
  const rawC = candidate["complexity"];
  const complexity =
    typeof rawC === "number" && Number.isFinite(rawC) && rawC >= 0 && rawC <= 1 ? rawC : 0.5;

  return { intent, complexity };
}

function summarizeBriefForIntent(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 117).trimEnd()}...`;
}

function buildDeterministicIntentFallback(request: VideoJobRequest): { intent: string; complexity: number } {
  const topic = summarizeBriefForIntent(request.prompt);
  const style = request.style ?? "faceless_broll";
  const niche = request.niche ?? "other";
  const audience = request.audience?.trim() || "the target viewer";
  const duration = request.targetDurationSeconds ?? 30;
  const complexity = Math.min(0.8, Math.max(0.35, duration >= 45 ? 0.65 : 0.45));

  return {
    intent:
      `HOOK: Make "${topic}" feel immediately visible and worth finishing. ` +
      `| ARC: ${audience} moves from passive interest to a clear ${style} takeaway in the ${niche} niche. ` +
      `| TAKEAWAY: Show one specific action the viewer can apply today.`,
    complexity,
  };
}

// ─── Pressure Guard ───────────────────────────────────────────────────────────

interface GovernorSnapshot {
  pressureLevel:    "normal" | "high" | "critical";
  concurrencyLimit: number;
}

/**
 * Read the live governor snapshot from the Python sidecar.
 * On failure, falls back to local MemAvailable instead of failing open to normal.
 */
async function readPressure(): Promise<GovernorSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const res = await fetch(
      `${GOVERNOR_BASE}/api/governor`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new Error(`governor probe: ${res.status}`);
    return (await res.json()) as GovernorSnapshot;
  } catch {
    try {
      const { readFile } = await import("node:fs/promises");
      const meminfo = await readFile("/proc/meminfo", "utf8");
      const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
      const availableMb = match?.[1] ? Math.floor(Number(match[1]) / 1024) : 0;
      if (availableMb < 800) return { pressureLevel: "critical", concurrencyLimit: 1 };
      if (availableMb < 2_500) return { pressureLevel: "high", concurrencyLimit: 1 };
      return { pressureLevel: "normal", concurrencyLimit: 1 };
    } catch {
      return { pressureLevel: "high", concurrencyLimit: 1 };
    }
  } finally {
    clearTimeout(timer);
  }
}

// ─── Model Acquisition with SINGLE-7B LOCK ───────────────────────────────────

/**
 * [VOT-04] Returns both the resolved model tag AND the RAM-aware overrides
 * from ModelOrchestrator so callers can forward them to ollamaGenerate().
 *
 * Previously acquireModel() returned only the string tag, silently discarding
 * the overrides computed by getRamAwareOverrides() inside requestModel().
 */
async function acquireModel(
  stage: TextVideoJobStage,
  request: VideoJobRequest,
  requestedTag?: string,
): Promise<{ modelTag: string; keepAlive: string; overrides: ModelOverrides }> {
  const tag = requestedTag ?? resolveModelTag(request, stage);
  const mo  = ModelOrchestrator.getInstance();
  const { modelTag: resolvedTag, keepAlive, evictedModels, overrides } = await mo.requestModel(tag);

  if (evictedModels.length > 0) {
    // Expected on 8 GB RAM — log for observability via stderr (no fastify logger in service scope)
    process.stderr.write(
      `[video-orchestrator] SINGLE-7B eviction before stage "${stage}": ${evictedModels.join(", ")}\n`
    );
  }

  return { modelTag: resolvedTag, keepAlive, overrides };
}

// ─── Ollama Fetch Helper ──────────────────────────────────────────────────────

/**
 * [VOT-03] Now accepts optional ModelOverrides from the orchestrator.
 *
 * Previously: `options: { num_predict: maxTokens, temperature: 0.3 }` — fixed.
 * Now: `numCtx` and `numPredict` from getRamAwareOverrides() are merged in,
 * so under low-ram / degraded modes the KV cache and predict budget are
 * automatically reduced before the Ollama request is sent.
 *
 * Accepts `signal` (from stage AbortController) so the connection is
 * cleanly torn down when the stage times out or the job is cancelled.
 */
async function ollamaGenerate(
  model:     string,
  prompt:    string,
  signal:    AbortSignal,
  maxTokens = 1024,
  overrides: ModelOverrides = {},
  keepAlive?: string,
): Promise<{ text: string; tokenCount: number; latencyMs: number }> {
  return tracer.startActiveSpan("swarmx.ollama.generate", async (span) => {
    span.setAttribute("swarmx.model.tag", model);
    span.setAttribute("swarmx.ollama.max_tokens", maxTokens);
    const t0 = Date.now();
    try {
      const result = await generateOllamaText({
        model,
        prompt,
        signal,
        maxTokens,
        overrides,
        ...(keepAlive !== undefined ? { keepAlive } : {}),
      });
      const latencyMs = Date.now() - t0;
      span.setAttribute("swarmx.ollama.latency_ms", latencyMs);
      span.setAttribute("swarmx.ollama.token_count", result.tokenCount);
      span.setStatus({ code: SpanStatusCode.OK });
      return { text: result.text, tokenCount: result.tokenCount, latencyMs };
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Submit a ComfyUI workflow and wait for completion.
 * All fetch calls are gated on the stage abort signal.
 *
 * [VOT-12] Poll ceiling derived from STAGE_TIMEOUT_MS["render_assembly"] /
 * COMFY_POLL_INTERVAL_MS (= 48 iterations at 240s / 5s). Previously this was
 * hardcoded as 60, giving a 300s ceiling that raced independently with the
 * 240s stage timeout.
 */
async function comfyRunWorkflow(
  workflowJson: Record<string, unknown>,
  signal:       AbortSignal
): Promise<string> {
  const submitRes = await fetchBackend(`${COMFY_BASE}/prompt`, {
    backend: "comfyui",
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ prompt: workflowJson }),
  });

  if (!submitRes.ok) {
    throw Object.assign(
      new Error(`ComfyUI submission failed: ${submitRes.status}`),
      { code: "COMFY_UNAVAILABLE" }
    );
  }

  const { prompt_id } = (await submitRes.json()) as { prompt_id: string };

  // [VOT-12] Use coordinated ceiling — see COMFY_POLL_MAX_ATTEMPTS constant.
  for (let attempt = 0; attempt < COMFY_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, COMFY_POLL_INTERVAL_MS);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });

    const histRes = await fetchBackend(`${COMFY_BASE}/history/${prompt_id}`, {
      backend: "comfyui",
      signal,
    });
    if (!histRes.ok) continue;

    const history = (await histRes.json()) as Record<
      string, { outputs?: Record<string, unknown> }
    >;
    if (history[prompt_id]) {
      const outputs     = history[prompt_id].outputs ?? {};
      const firstOutput = Object.values(outputs)[0] as
        | { images?: { filename: string }[] } | undefined;
      return firstOutput?.images?.[0]?.filename ?? "output.mp4";
    }
  }

  throw Object.assign(new Error("ComfyUI workflow timed out"), { code: "RENDER_FAILED" });
}

// ─── Stage Implementations ───────────────────────────────────────────────────

async function stageIntentClassification(
  ctx: OrchestratorContext
): Promise<{ intent: string; complexity: number }> {
  const initialModelOverride = hasPriorIntentPilotFailure(ctx.job) ? LOW_RAM_VIDEO_MODEL : undefined;
  if (initialModelOverride) {
    log.warn({
      jobId: ctx.job.id,
      stage: "intent_classification",
      model: PILOT_VIDEO_MODEL,
      fallbackModel: initialModelOverride,
    }, "prior Q8 Pilot intent failure detected — starting retry with Pilot-lite");
    ctx.broadcast({
      type: "video:stream",
      timestamp: new Date().toISOString(),
      data: {
        jobId: ctx.job.id,
        stage: "intent_classification",
        pct: 5,
        operatorTag: initialModelOverride,
        message: "Previous Q8 Pilot attempt failed; starting retry with Pilot-lite.",
      },
    });
  }

  // [VOT-04] Destructure modelTag + overrides from acquireModel
  const { modelTag: model, keepAlive, overrides } = await acquireModel(
    "intent_classification",
    ctx.job.request,
    initialModelOverride,
  );
  // [VOT-10] Record actual resolved tag immediately — not re-derived later
  ctx.modelsUsed["intent_classification"] = model;
  trace.getActiveSpan()?.setAttribute("swarmx.model.tag", model);
  const controller = stageController(ctx, "intent_classification");

  try {
    return await classifyIntentWithModel(ctx, model, keepAlive, overrides, controller.signal);
  } catch (err) {
    if (!shouldFallbackIntentToPilotLite(model, err)) {
      throw err;
    }

    const errorCode = errorCodeOf(err);
    log.warn({
      jobId: ctx.job.id,
      stage: "intent_classification",
      model,
      fallbackModel: LOW_RAM_VIDEO_MODEL,
      errorCode,
    }, "intent classification primary model failed — retrying with Pilot-lite");
    ctx.broadcast({
      type: "video:stream",
      timestamp: new Date().toISOString(),
      data: {
        jobId: ctx.job.id,
        stage: "intent_classification",
        pct: 5,
        operatorTag: LOW_RAM_VIDEO_MODEL,
        message: "Q8 Pilot unavailable; retrying intent classification with Pilot-lite.",
      },
    });

    await ModelOrchestrator.getInstance().unloadModel(model);
    const fallback = await acquireModel("intent_classification", ctx.job.request, LOW_RAM_VIDEO_MODEL);
    ctx.modelsUsed["intent_classification"] = fallback.modelTag;
    trace.getActiveSpan()?.setAttribute("swarmx.model.tag", fallback.modelTag);
    return await classifyIntentWithModel(
      ctx,
      fallback.modelTag,
      fallback.keepAlive,
      fallback.overrides,
      controller.signal,
    );
  } finally {
    controller.abort();
    const completedModel = ctx.modelsUsed["intent_classification"] ?? model;
    ModelOrchestrator.getInstance().onModelCallComplete(completedModel);
  }
}

async function classifyIntentWithModel(
  ctx: OrchestratorContext,
  model: string,
  keepAlive: string,
  overrides: ModelOverrides,
  signal: AbortSignal,
): Promise<{ intent: string; complexity: number }> {
  const startedAt = new Date().toISOString();
  const attemptStartedMs = Date.now();
  let traceRecorded = false;

  try {
    // [VOT-03] Pass overrides to ollamaGenerate
    // [VOT-13] Sanitize raw output before parsing so DeepSeek <think> blocks
    //          never corrupt intent JSON. Safe no-op on phi4/qwen outputs.
    const { text: rawIntent, tokenCount: intentTokens, latencyMs: intentLatency } = await ollamaGenerate(
      model,
      `Analyze this video generation brief and extract its creative strategy.

Brief: "${ctx.job.request.prompt}"

Respond as strict JSON only, no other text:
{"intent": "HOOK: [one-sentence contrarian or surprising angle] | ARC: [what viewer feels start→middle→end] | TAKEAWAY: [specific actionable conclusion]", "complexity": 0.0}

      complexity: 0.0 = simple topic, minimal narrative arc; 1.0 = nuanced multi-beat storytelling with strong identity challenge required.`,
      signal,
      256,
      overrides,
      keepAlive,
    );
    const { text: raw } = sanitizeReasoningOutput(rawIntent);
    try {
      const parsed = parseIntentClassification(raw);
      recordOperatorTrace(ctx, "intent_classification", model, startedAt, true, intentTokens, intentLatency);
      traceRecorded = true;
      return parsed;
    } catch (err) {
      if (loadEnv().SWARMX_VIDEO_ALLOW_UNSTRUCTURED_INTENT === "1") {
        recordOperatorTrace(ctx, "intent_classification", model, startedAt, true, intentTokens, intentLatency);
        traceRecorded = true;
        return { intent: raw.slice(0, 200), complexity: 0.5 };
      }
      recordOperatorTrace(ctx, "intent_classification", model, startedAt, false, intentTokens, intentLatency);
      traceRecorded = true;
      const fallback = buildDeterministicIntentFallback(ctx.job.request);
      log.warn({
        jobId: ctx.job.id,
        stage: "intent_classification",
        model,
        errorCode: "INTENT_VALIDATION_FAILED",
        reason: err instanceof Error ? err.message : String(err),
      }, "intent classification returned malformed JSON — using deterministic request fallback");
      ctx.broadcast({
        type: "video:stream",
        timestamp: new Date().toISOString(),
        data: {
          jobId: ctx.job.id,
          stage: "intent_classification",
          pct: 15,
          operatorTag: model,
          message: "Intent classifier returned malformed JSON; continuing with deterministic brief fallback.",
        },
      });
      return fallback;
    }
  } catch (err) {
    if (!traceRecorded) {
      recordOperatorTrace(
        ctx,
        "intent_classification",
        model,
        startedAt,
        false,
        0,
        Date.now() - attemptStartedMs,
      );
    }
    throw err;
  }
}

function errorCodeOf(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code?: unknown }).code ?? "")
    : "";
}

function shouldFallbackIntentToPilotLite(model: string, err: unknown): boolean {
  if (model !== PILOT_VIDEO_MODEL) {
    return false;
  }
  const code = errorCodeOf(err);
  return code === "OLLAMA_UNAVAILABLE" || code === "TIMEOUT";
}

function hasPriorIntentPilotFailure(job: VideoJob): boolean {
  return (job.operatorTrace ?? []).some(
    (entry) =>
      entry.stage === toPublicStatus("intent_classification") &&
      entry.modelTag === PILOT_VIDEO_MODEL &&
      entry.success === false,
  );
}

function recoveryModelForTextStage(
  ctx: OrchestratorContext,
  stage: Exclude<TextVideoJobStage, "intent_classification">,
): string | undefined {
  const recoveredIntent =
    ctx.modelsUsed["intent_classification"] === LOW_RAM_VIDEO_MODEL ||
    hasPriorIntentPilotFailure(ctx.job);
  if (!recoveredIntent) {
    return undefined;
  }

  log.warn({
    jobId: ctx.job.id,
    stage,
    fallbackModel: LOW_RAM_VIDEO_MODEL,
  }, "video text stage using Pilot-lite recovery profile");
  return LOW_RAM_VIDEO_MODEL;
}

function normalizeStoryboardFrame(text: string): string {
  return text
    .replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
    .replace(/^\s*\[SCENE\s+\d+\s*\|\s*([^\]]+)\]\s*/i, "$1: ")
    .replace(/\s+/g, " ")
    .trim();
}

function appendStoryboardFrame(frames: string[], frame: string): void {
  const normalized = normalizeStoryboardFrame(frame);
  if (normalized.length < 8) {
    return;
  }
  const clamped = normalized.slice(0, 240).trim();
  if (clamped.length < 8) {
    return;
  }
  if (!frames.some((existing) => existing.toLowerCase() === clamped.toLowerCase())) {
    frames.push(clamped);
  }
}

function extractStoryboardFrames(rawStoryboard: string, scriptText: string): string[] {
  const frames: string[] = [];
  for (const line of rawStoryboard.split("\n")) {
    const trimmed = line.trim();
    if (/^(?:[-*]|\d+[.)])\s+/.test(trimmed) || /^\[SCENE\s+\d+\s*\|/i.test(trimmed)) {
      appendStoryboardFrame(frames, trimmed);
    }
  }

  if (frames.length === 0) {
    const visualTagPattern = /\[VISUAL:\s*([^\]]+)\]/gi;
    for (const source of [rawStoryboard, scriptText]) {
      let match: RegExpExecArray | null;
      while ((match = visualTagPattern.exec(source)) !== null) {
        appendStoryboardFrame(frames, match[1] ?? "");
      }
    }
  }

  if (frames.length === 0) {
    for (const chunk of rawStoryboard.split(/[.!?]\s+|\n+/)) {
      appendStoryboardFrame(frames, chunk);
    }
  }

  return frames.slice(0, 7);
}

async function stagePlanning(
  ctx:    OrchestratorContext,
  intent: string
): Promise<{ plan: string[] }> {
  const { modelTag: model, keepAlive, overrides } = await acquireModel(
    "planning",
    ctx.job.request,
    recoveryModelForTextStage(ctx, "planning"),
  );
  const startedAt = new Date().toISOString();
  // [VOT-10] Record actual resolved tag immediately — not re-derived later
  ctx.modelsUsed["planning"] = model;
  trace.getActiveSpan()?.setAttribute("swarmx.model.tag", model);
  const controller = stageController(ctx, "planning");

  try {
    // [VOT-13] Sanitize output before parsing so <think> blocks never
    //          produce hallucinated plan lines.
    const { text: rawPlan, tokenCount: planTokens, latencyMs: planLatency } = await ollamaGenerate(
      model,
      buildPlanningPrompt(ctx.job.request, intent),
      controller.signal,
      320,
      overrides,
      keepAlive,
    );
    const { text: raw } = sanitizeReasoningOutput(rawPlan);
    const lines = raw
      .split("\n")
      .map((l) => l.replace(/^\s*[\d.-]+[\s.)]*/, "").trim())
      .filter(Boolean);
    const validated = runStageValidation(ctx.job, "planning", { plan: lines });
    const result = validated ?? {
      plan: ["Generate visuals", "Add narration", "Assemble final video"],
    };
    recordOperatorTrace(ctx, "planning", model, startedAt, true, planTokens, planLatency);
    return result;
  } finally {
    controller.abort();
    ModelOrchestrator.getInstance().onModelCallComplete(model);
  }
}

async function stageScripting(
  ctx:  OrchestratorContext,
  plan: string[]
): Promise<{ scriptText: string; preliminaryHookScore: number; retentionMap?: RetentionMap }> {
  const { modelTag: model, keepAlive, overrides } = await acquireModel(
    "scripting",
    ctx.job.request,
    recoveryModelForTextStage(ctx, "scripting"),
  );
  const startedAt = new Date().toISOString();
  // [VOT-10] Record actual resolved tag immediately — not re-derived later
  ctx.modelsUsed["scripting"] = model;
  trace.getActiveSpan()?.setAttribute("swarmx.model.tag", model);
  const controller = stageController(ctx, "scripting");

  try {
    let selectedScriptText: string | null = null;
    let selectedWarnings: ScriptQualityWarning[] = [];
    let selectedHookScore = 0;
    let selectedRetentionMap: RetentionMap | null = null;
    let firstValidScriptText: string | null = null;
    let firstValidWarnings: ScriptQualityWarning[] = [];
    let firstValidHookScore = 0;
    let firstValidRetentionMap: RetentionMap | null = null;
    let totalTokens = 0;
    let totalLatencyMs = 0;
    let lastValidationFailed = false;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      // [VOT-13] Sanitize output so <think> artifacts never appear in the
      //          generated script that feeds the storyboard and render stages.
      const { text: rawScript, tokenCount: scriptTokens, latencyMs: scriptLatency } = await ollamaGenerate(
        model,
        buildScriptingPrompt(ctx.job.request, plan, { reinforceHookBlocklist: attempt > 0 }),
        controller.signal,
        1024,
        overrides,
        keepAlive,
      );
      totalTokens += scriptTokens;
      totalLatencyMs += scriptLatency;

      const { text: scriptText } = sanitizeReasoningOutput(rawScript);
      const validated = runStageValidation(ctx.job, "scripting", { scriptText });
      if (!validated) {
        lastValidationFailed = true;
        continue;
      }

      const scriptWarnings = validateScriptSections(validated.scriptText, ctx.job.id, model);
      const hookBlocked = scriptWarnings.some((warning) => warning.code === "hook_blocklist");

      // Pre-render quality gate (ADR-7, v5 finalization directive): both
      // signals below are free, local, deterministic (no LLM call, no I/O)
      // — hook-laboratory.ts and retention-map.ts were already built and
      // exported but never gated anything before this. Catching a weak hook
      // or an unrecovered retention drop-off HERE, before storyboard
      // generation and the GPU/Modal render stage, is strictly cheaper than
      // discovering it after render (the previous behavior — see
      // stageViralityAndCaption, which scored virality only after the full
      // render had already completed).
      const preliminaryHookScore = derivePreliminaryHookScore(validated.scriptText);
      const retentionMap = generateRetentionMap(
        validated.scriptText,
        ctx.job.request.targetDurationSeconds ?? 30,
      );
      const weakHook = preliminaryHookScore < PRELIMINARY_HOOK_REGEN_THRESHOLD;
      // NOTE: retentionMap.unrecoveredHighRiskCount is structurally always 0
      // in the current retention-map.ts — every HIGH-risk beat unconditionally
      // receives a fallback plannedRecovery string, so "unrecovered" never
      // fires as coded. Verified directly against the module rather than
      // trusted from its docstring. Gate on overallRisk === "HIGH" instead,
      // which does vary meaningfully with content density. retention-map.ts
      // itself is left untouched (out of this pass's scope) — flagged as a
      // follow-up micro-fix candidate in the v5 directive.
      const highRetentionRisk = retentionMap.overallRisk === "HIGH";

      if (attempt === 0 && (hookBlocked || weakHook || highRetentionRisk)) {
        firstValidScriptText = validated.scriptText;
        firstValidWarnings = scriptWarnings;
        firstValidHookScore = preliminaryHookScore;
        firstValidRetentionMap = retentionMap;
        log.warn(
          {
            jobId: ctx.job.id,
            model,
            attempt: attempt + 1,
            hookBlocked,
            weakHook,
            preliminaryHookScore,
            unrecoveredRetentionRisk: highRetentionRisk,
            retentionOverallRisk: retentionMap.overallRisk,
          },
          "[script-quality] regenerating script after pre-render quality gate (hook_blocklist / weak_hook / retention_risk)",
        );
        continue;
      }

      selectedScriptText = validated.scriptText;
      selectedWarnings = scriptWarnings;
      selectedHookScore = preliminaryHookScore;
      selectedRetentionMap = retentionMap;
      break;
    }

    if (!selectedScriptText && firstValidScriptText) {
      selectedScriptText = firstValidScriptText;
      selectedWarnings = firstValidWarnings;
      selectedHookScore = firstValidHookScore;
      selectedRetentionMap = firstValidRetentionMap;
    }

    if (!selectedScriptText) {
      recordOperatorTrace(ctx, "scripting", model, startedAt, false, totalTokens, totalLatencyMs);
      throw Object.assign(
        new Error(lastValidationFailed
          ? "Scripting output did not satisfy the stage schema"
          : "Scripting output unavailable"),
        { code: "SCRIPT_SCHEMA_INVALID" },
      );
    }

    if (selectedWarnings.length > 0) {
      ctx.job.scriptQualityWarnings = [...(ctx.job.scriptQualityWarnings ?? []), ...selectedWarnings];
    }

    // Surface unrecovered retention risk through the existing
    // stageValidationTrace mechanism (soft guard, per retention-map.ts's
    // own docstring: it never throws, only warns) so the dashboard and any
    // downstream QC consumer can see WHY a script shipped with residual
    // drop-off risk after both regeneration attempts.
    if (selectedRetentionMap) {
      pushStageValidation(ctx.job, {
        schemaVersion: 1,
        stage: "scripting",
        passed: selectedRetentionMap.overallRisk !== "HIGH",
        ...(selectedRetentionMap.overallRisk === "HIGH"
          ? {
            issues: selectedRetentionMap.beats
              .filter((beat) => beat.dropOffRisk === "HIGH")
              .map((beat) => `${beat.beatLabel}: HIGH drop-off risk — ${beat.plannedRecovery ?? beat.viewerQuestion}`),
          }
          : {}),
      });
    }

    recordOperatorTrace(ctx, "scripting", model, startedAt, true, totalTokens, totalLatencyMs);
    return {
      scriptText: selectedScriptText,
      preliminaryHookScore: selectedHookScore,
      ...(selectedRetentionMap ? { retentionMap: selectedRetentionMap } : {}),
    };
  } finally {
    controller.abort();
    ModelOrchestrator.getInstance().onModelCallComplete(model);
  }
}

async function stageStoryboardGeneration(
  ctx:        OrchestratorContext,
  scriptText: string
): Promise<{ frames: string[] }> {
  const { modelTag: model, keepAlive, overrides } = await acquireModel(
    "storyboard_generation",
    ctx.job.request,
    recoveryModelForTextStage(ctx, "storyboard_generation"),
  );
  const startedAt = new Date().toISOString();
  // [VOT-10] Record actual resolved tag immediately — not re-derived later
  ctx.modelsUsed["storyboard_generation"] = model;
  trace.getActiveSpan()?.setAttribute("swarmx.model.tag", model);
  const controller = stageController(ctx, "storyboard_generation");

  try {
    // [VOT-13] Sanitize raw output before frame extraction so DeepSeek
    //          <think> content never becomes a storyboard frame description.
    const { text: rawStoryboard, tokenCount: sbTokens, latencyMs: sbLatency } = await ollamaGenerate(
      model,
      buildStoryboardPrompt(ctx.job.request, scriptText),
      controller.signal,
      768,
      overrides,
      keepAlive,
    );
    const { text: raw } = sanitizeReasoningOutput(rawStoryboard);
    const frames = extractStoryboardFrames(raw, scriptText);
    const validated = runStageValidation(ctx.job, "storyboard_generation", { frames });
    const result = validated ?? {
      frames: ["Abstract cinematic opener", "Key message frame", "CTA closing frame"],
    };
    recordOperatorTrace(ctx, "storyboard_generation", model, startedAt, true, sbTokens, sbLatency);
    return result;
  } finally {
    controller.abort();
    ModelOrchestrator.getInstance().onModelCallComplete(model);
  }
}

async function stageRenderAssembly(
  ctx:    OrchestratorContext,
  frames: string[]
): Promise<{ outputFilename: string; renderPackage?: FfmpegRenderPackage }> {
  const startedAt = new Date().toISOString();
  const controller = stageController(ctx, "render_assembly");

  try {
    for (const model of Object.values(ctx.modelsUsed)) {
      if (model) {
        await ModelOrchestrator.getInstance().unloadModel(model);
      }
    }

    const _renv = loadEnv();
    const backend = _renv.SWARMX_VIDEO_RENDER_BACKEND;

    const modalConfigured = Boolean(_renv.SWARMX_MODAL_RENDER_URL?.trim());
    if ((backend === "auto" || backend === "modal") && modalConfigured) {
      const modal = new ModalVideoRenderBackend();
      if (!(await modal.isAvailable(controller.signal))) {
        if (backend === "modal") {
          throw Object.assign(new Error("Modal renderer is configured but unavailable"), { code: "MODAL_RENDER_UNAVAILABLE" });
        }
      } else {
        const duration = Math.max(15, Math.min(180, ctx.job.request.targetDurationSeconds ?? 30));
        const count = Math.max(1, Math.min(8, frames.length));
        const perSegment = duration / count;
        const tasks: RenderSegmentTask[] = frames.slice(0, count).map((frame, index) => ({
          jobId: ctx.job.id,
          segmentId: `seg-${String(index + 1).padStart(2, "0")}`,
          prompt: buildCreativeComfyPrompt({ prompt: frame, ...(ctx.job.request.tone ? { tone: ctx.job.request.tone } : {}), ...(ctx.job.request.niche ? { niche: ctx.job.request.niche } : {}), ...(ctx.job.request.style ? { style: ctx.job.request.style } : {}) }),
          negativePrompt: "low quality, blurry, watermark, distorted, text artifacts",
          durationSeconds: Math.max(2, Math.min(12, perSegment)),
          fps: 24,
          width: ctx.job.request.platform === "generic" ? 1080 : 720,
          height: ctx.job.request.platform === "generic" ? 1080 : 1280,
          seed: index + 1 + Math.floor(Date.now() / 1000),
        }));
        const artifacts = await modal.renderSegments(ctx.job.request, tasks, controller.signal);
        const backgroundVideoPaths = artifacts.map((artifact) => artifact.path);
        const ffmpegResult = await renderWithFfmpeg({
          jobId: ctx.job.id,
          request: ctx.job.request,
          storyboardFrames: frames,
          backgroundVideoPaths,
          signal: controller.signal,
          ...(ctx.scriptText !== undefined ? { scriptText: ctx.scriptText } : {}),
        });
        pushOperatorTrace(ctx.job, {
          stage: toPublicStatus("render_assembly"),
          operatorTag: "modal:wan2.2:L4",
          modelTag: "Wan-AI/Wan2.2-TI2V-5B-Diffusers",
          operator: "Remote GPU",
          startedAt,
          completedAt: new Date().toISOString(),
          latencyMs: 0,
          tokenCount: 0,
          success: true,
          timestamp: startedAt,
        });
        return ffmpegResult;
      }
    }

    const comfyClient = getComfyUIClient();
    const comfyAvailable = await comfyClient.isAvailable(controller.signal);
    const comfyConfigured = Boolean(_renv.SWARMX_COMFYUI_OUTPUT_DIR);
    if ((backend === "auto" || backend === "comfyui") && comfyAvailable && comfyConfigured) {
      const ram = ModelOrchestrator.getInstance().getRamSnapshot();
      const workflow = generateLTXWorkflow({
        seed: Math.floor(Math.random() * 1_000_000_000),
        prompt: buildCreativeComfyPrompt({
          prompt: ctx.job.request.prompt,
          ...(ctx.job.request.tone ? { tone: ctx.job.request.tone } : {}),
          ...(ctx.job.request.niche ? { niche: ctx.job.request.niche } : {}),
          ...(ctx.job.request.style ? { style: ctx.job.request.style } : {}),
          ...(frames[0] ? { frame: frames[0] } : {}),
        }),
        negativePrompt: "low quality, blurry, watermark, artifact",
        resolution: "512x896",
        totalFrames: Math.max(16, Math.min(96, frames.length * 8)),
        outputFps: 24,
        availableMb: ram.availableMb,
      });

      const run = await comfyClient.runWorkflow(workflow, {
        signal: controller.signal,
        onProgress: (progress) => {
          const stageProgress: VideoStageProgress = {
            stage: "render_assembly",
            stageProgress: progress.pct,
            overallProgress: Math.round(75 + (progress.pct * 0.2)),
            message: progress.message,
            startedAt: new Date().toISOString(),
          };
          queue.recordStageProgress(ctx.job.id, "render_assembly", stageProgress);
          ctx.broadcast(makeVideoProgressEvent(
            ctx.job.id,
            "render_assembly",
            stageProgress,
            stageProgress.overallProgress,
            progress.message,
          ));
          ctx.broadcast({
            type: "video:stream",
            timestamp: new Date().toISOString(),
            data: {
              jobId: ctx.job.id,
              stage: "generating",
              pct: Math.max(0, Math.min(100, progress.pct)),
              operatorTag: "forge",
              message: progress.message,
            },
          });
        },
      });

      const comfyStartMs = Date.now();
      const outputFilename = await assets.importComfyOutput(run.outputFilename);
      pushOperatorTrace(ctx.job, {
        stage: toPublicStatus("render_assembly"),
        operatorTag: "system",
        modelTag: "system",
        operator: "System",
        startedAt,
        completedAt: new Date().toISOString(),
        latencyMs: Date.now() - comfyStartMs,
        tokenCount: 0,
        success: true,
        timestamp: startedAt,
      });

      return { outputFilename };
    }

    if (backend === "comfyui") {
      throw Object.assign(new Error("ComfyUI is unavailable or SWARMX_COMFYUI_OUTPUT_DIR is not configured"), {
        code: "COMFY_UNAVAILABLE",
      });
    }

    if (backend !== "auto" && backend !== "ffmpeg") {
      throw Object.assign(new Error(`Unknown video render backend: ${backend}`), {
        code: "RENDER_BACKEND_INVALID",
      });
    }

    const ffmpegStartMs = Date.now();
    const rendered = await tracer.startActiveSpan("swarmx.render.ffmpeg", async (span) => {
      span.setAttribute("swarmx.job.id", ctx.job.id);
      try {
        const result = await renderWithFfmpeg({
          jobId: ctx.job.id,
          request: ctx.job.request,
          storyboardFrames: frames,
          signal: controller.signal,
          ...(ctx.scriptText !== undefined ? { scriptText: ctx.scriptText } : {}),
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    });
    pushOperatorTrace(ctx.job, {
      stage: toPublicStatus("render_assembly"),
      operatorTag: "system",
      modelTag: "system",
      operator: "System",
      startedAt,
      completedAt: new Date().toISOString(),
      latencyMs: Date.now() - ffmpegStartMs,
      tokenCount: 0,
      success: true,
      timestamp: startedAt,
    });
    return rendered;
  } finally {
    controller.abort();
  }
}

async function stageFinalizing(
  ctx:            OrchestratorContext,
  scriptText:     string,
  frames:         string[],
  outputFilename: string,
  renderPackage?: FfmpegRenderPackage
): Promise<VideoOutputMetadata> {
  // stageFinalizing calls no model — no modelsUsed entry, no acquireModel().
  const startedAt = new Date().toISOString();
  pushOperatorTrace(ctx.job, {
    stage: toPublicStatus("finalizing"),
    operatorTag: "system",
    modelTag: "system",
    operator: "System",
    startedAt,
    completedAt: new Date().toISOString(),
    latencyMs: 0,
    tokenCount: 0,
    success: true,
    timestamp: startedAt,
  });
  return assets.buildOutputMetadata({
    jobId:            ctx.job.id,
    outputFilename,
    scriptText,
    storyboardFrames: frames,
    modelsUsed:       ctx.modelsUsed as Record<string, string>,
    request:          ctx.job.request,
    ...(renderPackage ? { renderPackage } : {}),
  });
}

async function stageViralityAndCaption(ctx: OrchestratorContext): Promise<void> {
  const targetPlatform =
    ctx.job.request.platform === "youtube_shorts"
      ? "shorts"
      : (ctx.job.request.platform ?? "generic");

  const virality = await scoreVirality({
    topic: ctx.job.request.prompt,
    platform: targetPlatform,
    durationSec: ctx.job.request.targetDurationSeconds ?? 30,
    ...(extractHookLine(ctx.scriptText)
      ? { hook: extractHookLine(ctx.scriptText) as string }
      : {}),
  });

  const viralitySummary = virality?.recommendations.join("; ") ?? "No virality recommendations available";

  let captionDraft = virality?.captionDraft;

  try {
    const captionResult = await generateCaptionDraftWithValidation({
      topic: ctx.job.request.prompt,
      tone: ctx.job.request.tone ?? "educational",
      platform: targetPlatform,
      viralitySummary,
    });
    captionDraft = captionResult.draft;
  } catch (error) {
    ctx.broadcast({
      type: "video:stream",
      timestamp: new Date().toISOString(),
      data: {
        jobId: ctx.job.id,
        stage: "caption_generation",
        pct: 1,
        operatorTag: "system",
        message: error instanceof Error ? error.message : "caption_generation_failed",
      },
    });
  }

  if (virality && captionDraft) {
    ctx.job.viralitySignal = {
      ...virality,
      captionDraft,
    };
    ctx.viralitySummary = virality.recommendations.join("; ");
  } else if (virality) {
    ctx.job.viralitySignal = virality;
    ctx.viralitySummary = virality.recommendations.join("; ");
  } else {
    ctx.viralitySummary = viralitySummary;
  }

  if (captionDraft && !ctx.job.outputArtifacts) {
    ctx.job.outputArtifacts = {};
  }
  if (captionDraft && ctx.job.outputArtifacts) {
    ctx.job.outputArtifacts.captionPath = "inline:caption-draft";
  }
  ctx.job.updatedAt = new Date().toISOString();
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Execute the full video generation pipeline for a job.
 * Emits SSE events at each stage boundary.
 * Handles abort signals from the job controller.
 */
export async function runOrchestration(
  jobId:     string,
  broadcast: BroadcastFn
): Promise<void> {
  return tracer.startActiveSpan(
    "video.orchestration",
    { attributes: { "swarmx.job.id": jobId } },
    async (rootSpan) => {
  const job = queue.getJob(jobId);
  if (!job) {
    rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: "job_not_found" });
    rootSpan.end();
    throw new Error(`Orchestrator: job ${jobId} not found`);
  }

  const jobAbortController = new AbortController();

  const cancelWatcher = setInterval(() => {
    const current = queue.getJob(jobId);
    if (current?.status === "cancelled") {
      jobAbortController.abort();
      clearInterval(cancelWatcher);
    }
  }, 500);

  const ctx: OrchestratorContext = {
    job,
    broadcast,
    jobAbortSignal: jobAbortController.signal,
    startedAt:      Date.now(),
    modelsUsed:     {},
  };
  let retryScheduled = false;

  try {
    const pressure = await readPressure();
    rootSpan.setAttribute("swarmx.pressure.initial", pressure.pressureLevel);

    if (pressure.pressureLevel === "critical") {
      throw makeError(
        "PRESSURE_CRITICAL",
        "System is under critical memory pressure. Try again shortly.",
        false
      );
    }

    // [VOT-11] Apply backoff on "high" pressure before starting the pipeline.
    // On 8 GB RAM, "high" means 1500–2500 MB free — a real signal that a 7B
    // model load could push us into OOM territory without a grace period.
    // After the delay, re-check: if escalated to critical, fail fast.
    // If still high or recovered to normal, proceed (graceful degradation).
    if (pressure.pressureLevel === "high") {
      log.warn(
        { jobId, delayMs: HIGH_PRESSURE_DELAY_MS },
        "video-orchestrator system pressure HIGH — delaying pipeline start",
      );
      await new Promise<void>((resolve) => setTimeout(resolve, HIGH_PRESSURE_DELAY_MS));

      const recheck = await readPressure();
      rootSpan.setAttribute("swarmx.pressure.after_backoff", recheck.pressureLevel);
      if (recheck.pressureLevel === "critical") {
        throw makeError(
          "PRESSURE_CRITICAL",
          "System escalated to critical memory pressure during high-pressure backoff. Try again shortly.",
          true  // retryable: pressure may recover
        );
      }
      // Still "high" or recovered to "normal" — proceed with degraded awareness
      log.warn(
        { jobId, pressureLevel: recheck.pressureLevel },
        "video-orchestrator pressure re-check — proceeding",
      );
    }

    // Sync ModelOrchestrator with live Ollama /api/ps state before starting.
    // This gives the SINGLE-7B LOCK an accurate baseline snapshot.
    // [MOT-05] Names are normalized inside syncFromOllama via resolveCanonicalTag.
    await ModelOrchestrator.getInstance().syncFromOllama();

    job.pressureTierAtStart = pressure.pressureLevel;
    rootSpan.setAttribute("swarmx.job.pressure_tier", pressure.pressureLevel);
    if (job.request.tone) rootSpan.setAttribute("swarmx.job.tone", job.request.tone);
    if (job.request.platform) rootSpan.setAttribute("swarmx.job.platform", job.request.platform);

    let intent = ctx.job.request.prompt;
    await runStage(ctx, "intent_classification", 0, 15, async () => {
      const result = await stageIntentClassification(ctx);
      intent = result.intent;
    });

    let plan: string[] = [];
    await runStage(ctx, "planning", 15, 30, async () => {
      const result = await stagePlanning(ctx, intent);
      plan = result.plan;
    });

    let scriptText = "";
    await runStage(ctx, "scripting", 30, 50, async () => {
      const result = await stageScripting(ctx, plan);
      scriptText = result.scriptText;
      ctx.scriptText = scriptText;
      ctx.job.preliminaryHookScore = result.preliminaryHookScore;
      ctx.job.updatedAt = new Date().toISOString();
      ctx.broadcast({
        type: "video:stream",
        timestamp: new Date().toISOString(),
        data: {
          jobId: ctx.job.id,
          stage: "scripting",
          pct: 50,
          operatorTag: "system",
          message: result.retentionMap
            ? `Pre-render hook confidence ${ctx.job.preliminaryHookScore.toFixed(2)} · retention risk ${result.retentionMap.overallRisk}`
            : `Pre-render hook confidence ${ctx.job.preliminaryHookScore.toFixed(2)}`,
        },
      });
    });

    let frames: string[] = [];
    await runStage(ctx, "storyboard_generation", 50, 75, async () => {
      const result = await stageStoryboardGeneration(ctx, scriptText);
      frames = result.frames;
      ctx.storyboardFrames = frames;
    });

    let outputFilename = "";
    let renderPackage: FfmpegRenderPackage | undefined;
    await runStage(ctx, "render_assembly", 75, 95, async () => {
      const result = await stageRenderAssembly(ctx, frames);
      outputFilename = result.outputFilename;
      renderPackage = result.renderPackage;
    });

    let output: VideoOutputMetadata | undefined;
    await runStage(ctx, "finalizing", 95, 100, async () => {
      output = await stageFinalizing(ctx, scriptText, frames, outputFilename, renderPackage);
    });

    await stageViralityAndCaption(ctx);

    if (!output) {
      throw makeError("UNKNOWN", "finalizing stage did not produce output", false, "finalizing");
    }

    // Store certification blockers so the dashboard can explain why the job
    // did not reach PRODUCTION_PACK_VALID without needing a separate API call.
    const certResult = certifyProductionPack({ output });
    if (certResult.blockers.length > 0) {
      output.certificationBlockers = certResult.blockers;
    }

    if (!ctx.job.outputArtifacts) {
      ctx.job.outputArtifacts = {};
    }
    ctx.job.outputArtifacts.outputPath = output.absolutePath;
    ctx.job.outputArtifacts.outputPublicUrl = output.publicUrl;
    if (output.renderManifestPath) ctx.job.outputArtifacts.manifestPath = output.renderManifestPath;
    if (output.srtPath) ctx.job.outputArtifacts.captionPath = output.srtPath;

    rootSpan.setAttribute("swarmx.job.total_duration_ms", Date.now() - ctx.startedAt);
    rootSpan.setAttribute("swarmx.job.output_size_bytes", output.fileSizeBytes ?? 0);
    rootSpan.setStatus({ code: SpanStatusCode.OK });

    const completedJob = queue.completeJob(jobId, output);
    notifyJobCompleted(ctx.job, output);
    broadcast(makeVideoCompletedEvent(jobId, {
      outputPublicUrl: output.publicUrl,
      durationSeconds: output.durationSeconds,
      fileSizeBytes:   output.fileSizeBytes,
      totalDurationMs: Date.now() - ctx.startedAt,
      modelsUsed:      output.modelsUsed as Record<string, string>,
    }));
    void completedJob;

  } catch (err: unknown) {
    clearInterval(cancelWatcher);
    const current = queue.getJob(jobId);
    if (current?.status === "cancelled") {
      rootSpan.setStatus({ code: SpanStatusCode.OK, message: "cancelled" });
      return;
    }

    const videoError = toVideoJobError(err);
    rootSpan.recordException(err instanceof Error ? err : new Error(String(err)));
    rootSpan.setAttribute("swarmx.job.error_code", videoError.code);
    rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: videoError.code });

    const failedJob  = queue.failJob(jobId, videoError);

    let retryDelayMs: number | undefined;
    let nextRetryAt: string | undefined;
    if (failedJob.status === "queued") {
      retryDelayMs = computeRetryDelayMs(failedJob.retryCount);
      const scheduled = queue.setRetrySchedule(jobId, retryDelayMs);
      nextRetryAt = scheduled?.nextRetryAt;
    }

    broadcast(makeVideoFailedEvent(
      jobId,
      videoError,
      failedJob.retryCount,
      Date.now() - ctx.startedAt,
      ctx.job.currentStage,
      {
        ...(failedJob.errorLog !== undefined ? { errorLog: failedJob.errorLog } : {}),
        ...(failedJob.maxRetries !== undefined ? { maxRetries: failedJob.maxRetries } : {}),
        ...(nextRetryAt !== undefined ? { nextRetryAt } : {}),
        ...(retryDelayMs !== undefined ? { nextRetryDelayMs: retryDelayMs } : {}),
      },
    ));

    if (failedJob.status === "queued") {
      retryScheduled = true;
      broadcast({
        type: "video:stream",
        timestamp: new Date().toISOString(),
        data: {
          jobId,
          stage: "retry",
          pct: 0,
          operatorTag: "system",
          message: `Retry ${failedJob.retryCount}/${failedJob.maxRetries ?? videoConfig.SWARMX_VIDEO_MAX_RETRIES} queued${retryDelayMs !== undefined ? ` · next in ${Math.ceil(retryDelayMs / 1000)}s` : ""}`,
        },
      });
      setTimeout(() => {
        const retryJob = queue.startJob(jobId);
        if (retryJob) {
          void runOrchestration(jobId, broadcast);
        }
      }, retryDelayMs ?? RETRY_BASE_DELAY_MS);
    } else {
      // Terminal failure — no retry scheduled. Notify once here rather than
      // on every transient retry, so the webhook signal means "this job is
      // truly done and needs a human," not "ffmpeg hiccuped once."
      notifyJobFailed(ctx.job, videoError);
    }
  } finally {
    clearInterval(cancelWatcher);
    jobAbortController.abort();
    rootSpan.end();
    if (!retryScheduled) {
      scheduleNextQueuedJob(broadcast);
    }
  }
  }); // tracer.startActiveSpan("video.orchestration")
}

function scheduleNextQueuedJob(broadcast: BroadcastFn): void {
  const next = queue.dequeueNext();
  if (!next) return;
  setImmediate(() => {
    const started = queue.startJob(next.id);
    if (started) {
      void runOrchestration(next.id, broadcast).catch((err) => {
        process.stderr.write(
          `[video-orchestrator] queued job ${next.id} crashed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      });
    }
  });
}

// ─── Stage Runner ─────────────────────────────────────────────────────────────

/**
 * [VOT-10] modelsUsed assignment removed from runStage().
 *
 * Previously: `ctx.modelsUsed[stage] = resolveModelTag(ctx.job.request, stage)`
 * was called here after fn() completed. This caused two problems:
 *   (a) Double tag resolution — the actual model used came from acquireModel()
 *       inside the stage fn, but bookkeeping re-derived it via resolveModelTag().
 *       If resolveCanonicalTag() returns different results between the two calls
 *       (possible during alias map migration), modelsUsed records the wrong tag.
 *   (b) stageFinalizing has no model — a re-derivation call there would silently
 *       record whichever STAGE_MODEL_TAG was configured for "finalizing", even
 *       though no model call was made.
 *
 * Fix: each individual stage fn now sets ctx.modelsUsed[stage] = model
 * immediately after acquireModel() resolves with the actual tag. stageFinalizing
 * sets nothing (correct — it makes no model call).
 */
async function runStage(
  ctx:           OrchestratorContext,
  stage:         VideoJobStage,
  progressStart: number,
  progressEnd:   number,
  fn:            () => Promise<void>
): Promise<void> {
  return tracer.startActiveSpan(
    `video.stage.${stage}`,
    {
      attributes: {
        "swarmx.job.id":              ctx.job.id,
        "swarmx.stage":               stage,
        "swarmx.stage.progress_start": progressStart,
        "swarmx.stage.progress_end":   progressEnd,
        "swarmx.stage.timeout_ms":     STAGE_TIMEOUT_MS[stage],
      },
    },
    async (span) => {
  if (ctx.jobAbortSignal.aborted) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: "aborted" });
    span.end();
    throw new DOMException("Job aborted before stage start", "AbortError");
  }

  const stageStart     = Date.now();
  const stageTimeoutMs = STAGE_TIMEOUT_MS[stage];

  const startProgress: VideoStageProgress = {
    stage,
    stageProgress:   0,
    overallProgress: progressStart,
    startedAt:       new Date().toISOString(),
    message:         `Starting ${stage.replace(/_/g, " ")}…`,
  };
  queue.recordStageProgress(ctx.job.id, stage, startProgress);
  ctx.broadcast(makeVideoProgressEvent(ctx.job.id, stage, startProgress, progressStart));

  try {
    await withTimeout(fn(), stageTimeoutMs, `Stage ${stage} timed out after ${stageTimeoutMs}ms`);
  } catch (err) {
    const durationMs = Date.now() - stageStart;
    span.setAttribute("swarmx.stage.duration_ms", durationMs);
    span.recordException(err instanceof Error ? err : new Error(String(err)));
    span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
    span.end();
    throw err;
  }

  const durationMs = Date.now() - stageStart;
  const completedProgress: VideoStageProgress = {
    stage,
    stageProgress:   100,
    overallProgress: progressEnd,
    completedAt:     new Date().toISOString(),
    durationMs,
    ...(startProgress.startedAt !== undefined
      ? { startedAt: startProgress.startedAt }
      : {}),
  };
  queue.recordStageProgress(ctx.job.id, stage, completedProgress);
  ctx.broadcast(makeVideoProgressEvent(ctx.job.id, stage, completedProgress, progressEnd));

  span.setAttribute("swarmx.stage.duration_ms", durationMs);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
  // [VOT-10] modelsUsed[stage] is now set inside each stage fn after acquireModel(),
  // not re-derived here. See individual stage implementations above.
  }); // tracer.startActiveSpan(`video.stage.${stage}`)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * [VOT-05] Fixed: Both listeners now use { once: true } so they
 * self-remove after firing. Previously anonymous lambdas on jobAbortSignal
 * were never cleaned up — one leaked listener per stage × per job.
 */
function stageController(
  ctx:   OrchestratorContext,
  stage: VideoJobStage
): AbortController {
  const controller = new AbortController();
  const timeout    = STAGE_TIMEOUT_MS[stage];
  const timer      = setTimeout(() => {
    controller.abort(Object.assign(
      new Error(`Stage ${stage} timed out after ${timeout}ms`),
      { code: "TIMEOUT" },
    ));
  }, timeout);

  // Auto-removes after first fire — no manual cleanup needed
  controller.signal.addEventListener(
    "abort",
    () => clearTimeout(timer),
    { once: true }
  );
  ctx.jobAbortSignal.addEventListener(
    "abort",
    () => controller.abort(Object.assign(new Error("Job was cancelled"), { code: "CANCELLED_BY_USER" })),
    { once: true }
  );

  return controller;
}

/**
 * Resolve the model tag for a given stage and request.
 *
 * [VOT-07] resolveCanonicalTag() applied as final pass to normalize any
 * legacy alias that may be supplied via request.modelTier during the
 * migration cutover window. The tierMap keys are human-readable tier names
 * ("fast", "worker", "supervisor", "reasoner") — unknown keys fall through
 * to the STAGE_MODEL_TAG default, which is already canonical. The
 * resolveCanonicalTag() call handles the edge case where a caller injects
 * a legacy tag string directly as the modelTier value.
 */
function resolveModelTag(request: VideoJobRequest, stage: TextVideoJobStage): string {
  return resolveVideoModelTag(request, stage);
}

function traceOperatorFor(model: string): string {
  const operator = resolveOperatorName(model);
  return operator === model ? "System" : operator;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Object.assign(new Error(message), { code: "TIMEOUT" })),
      ms
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

function makeError(
  code:      VideoJobError["code"],
  message:   string,
  retryable: boolean,
  stage?:    VideoJobStage
): VideoJobError {
  return {
    code,
    message,
    retryable,
    ...(stage !== undefined ? { stage } : {}),
  };
}

/**
 * [VOT-06] Fixed: The abort listener reference is now stored so
 * removeEventListener() can clean it up in the finally block.
 * Previously the listener on the incoming signal was never removed.
 */
async function isComfyAvailable(signal: AbortSignal): Promise<boolean> {
  const controller = new AbortController();
  const onAbort    = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetchBackend(`${COMFY_BASE}/system_stats`, {
      backend: "comfyui",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function extractHookLine(scriptText: string | undefined): string | undefined {
  if (!scriptText) return undefined;
  const lines = scriptText.split("\n");
  const hookIdx = lines.findIndex((l) => l.trim().startsWith("[HOOK]"));
  if (hookIdx >= 0) {
    return lines.slice(hookIdx + 1).find((l) => l.trim().length > 0)?.trim();
  }
  return lines[0]?.trim() || undefined;
}

function computeRetryDelayMs(retryCount: number): number {
  const attempt = Math.max(1, retryCount);
  const base = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  const bounded = Math.min(RETRY_MAX_DELAY_MS, base);
  const jitter = RETRY_JITTER_MS > 0 ? Math.floor(Math.random() * (RETRY_JITTER_MS + 1)) : 0;
  return bounded + jitter;
}

// ADR-7 (v5 finalization directive): below this preliminary hook score, the
// pre-render quality gate in stageScripting() triggers one bounded
// regeneration attempt before storyboard/render begins. Tuned conservatively
// (0.45 sits below the ~0.58 floor a HOOK_BLOCKLIST-clean-but-otherwise-flat
// hook scores) so the gate catches genuinely weak hooks without regenerating
// on every borderline pass.
const PRELIMINARY_HOOK_REGEN_THRESHOLD = 0.45;

function derivePreliminaryHookScore(scriptText: string): number {
  const hook = extractHookLine(scriptText);
  if (!hook) return 0.2;

  const validation = validateHookCandidate(hook);
  const family = classifyHookFamily(hook);

  let score = validation.passes ? 0.82 : 0.58;
  score -= Math.min(validation.failedRules.length, 3) * 0.12;
  if (validation.wordCount > 18) score -= 0.1;
  if (validation.violations.length > 0) score -= 0.15;
  score += family === "unknown" ? -0.06 : 0.04;

  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function creativeBriefLines(req: VideoJobRequest): string {
  return [
    `Audience: ${req.audience ?? "general viewers"}`,
    `Tone: ${req.tone ?? "educational"}`,
    `Style: ${req.style ?? "faceless_broll"}`,
    `Caption style: ${req.captionStyle ?? "bold_center"}`,
    `Voice: ${req.voice ?? "default"}`,
  ].join("\n");
}

const TEMPLATE_FAMILY_STRUCTURES: Record<string, string> = {
  "myth-vs-fact": "Structure as a direct debunking. Hook states the myth, Body provides the surprising fact, Resolution explains why the myth persisted.",
  "list/countdown": "Structure as a rapid-fire list. Hook introduces the topic/stakes, Body cycles through 3-5 items quickly, Resolution synthesizes the takeaway.",
  "mystery/reveal": "Structure as a narrative puzzle. Hook presents an anomaly, Body drops breadcrumbs/clues, Resolution reveals the surprising answer.",
  "product-demo": "Structure as a problem/solution showcase. Hook highlights a visceral pain point, Body demonstrates the solution in action, Resolution highlights the outcome.",
  "quote-to-insight": "Structure around a powerful quote. Hook drops the quote, Body analyzes its non-obvious meaning, Resolution applies it to the viewer's life.",
  "chart/data": "Structure around a single striking data point. Hook presents the stat, Body visualizes the trend and context, Resolution explains the implication.",
  "motivational": "Structure as a hero's journey micro-narrative. Hook identifies a moment of defeat, Body shows the pivot/grind, Resolution delivers the triumph.",
  "series-recap": "Structure as a fast-paced catch-up. Hook reminds of the cliffhanger, Body blitzes through key plot points, Resolution sets up the next episode.",
  // Ported from swarmxq-main's `template` taxonomy per ADR-3 (Yap Engine
  // completion directive v4) — ported verbatim as new templateFamily values
  // since neither has an equivalent among the existing eight.
  "pov-immersion": "Structure as first-person immersion. Hook drops the viewer directly into the moment (no scene-setting), Body unfolds in real-time sensory detail, Resolution lands the emotional beat from inside the POV.",
  "reddit-story": "Structure as a found-story readaloud. Hook quotes the provocative title/premise as if pulled from a thread, Body escalates through plot turns with a narrator's aside, Resolution delivers the punchline or moral the thread was known for."
};

function buildPlanningPrompt(req: VideoJobRequest, intent: string): string {
  const dur = req.targetDurationSeconds ?? 60;
  const hookEnd = Math.min(4, Math.round(dur * 0.07));
  const contextEnd = Math.round(dur * 0.25);
  const insightEnd = Math.round(dur * 0.65);
  const proofEnd = dur - 7;
  const templateHint = req.templateFamily && TEMPLATE_FAMILY_STRUCTURES[req.templateFamily] 
    ? `\nTemplate Family [${req.templateFamily}]: ${TEMPLATE_FAMILY_STRUCTURES[req.templateFamily]}\nApply this structural template to the 5 beats.` 
    : "";

  return `You are a short-form video production planner. Plan this ${dur}-second faceless video as 5 precise production beats.

Platform: ${req.platform ?? "tiktok"} | Niche: ${req.niche ?? "general"} | Tone: ${req.tone ?? "educational"} | Style: ${req.style ?? "faceless_broll"}
Audience: ${req.audience ?? "general viewers"}
Intent: ${intent}
Creative brief: "${req.prompt}"${templateHint}

Write exactly 5 numbered beats — not generic labels, but specific production instructions for this topic:
1. HOOK (0-${hookEnd}s): The scroll-stopping opener. What specific claim, question, or visual contrast starts the video?
2. CONTEXT (${hookEnd}-${contextEnd}s): The familiar pain or premise the viewer already feels. How is it framed?
3. INSIGHT (${contextEnd}-${insightEnd}s): The reframe, data point, or unexpected truth. What specifically is revealed?
4. PROOF (${insightEnd}-${proofEnd}s): The concrete illustration — example, stat, or micro-story beat.
5. CTA (last 7s): The specific next action. Not generic — a genuine behavior change or save-worthy moment tied to this topic.

One line per beat.`;
}

const TONE_RULES: Record<string, string> = {
  contrarian: 'Open with "Everyone says X, but..." or a direct inversion of conventional wisdom. Name the belief, then refute it.',
  urgent: "Use present-tense immediacy: 'right now', 'today', 'before it's too late'. Create time pressure without hyperbole.",
  educational: "Open with a curiosity gap: 'Here's why...', 'The reason is...', 'What most people miss...'. Teach, don't preach.",
  cinematic: "Slower pacing. Declarative, atmospheric sentences. Build mood before information. Pauses implied.",
  warm: "Conversational and personal. Speak to one person, not a crowd. Use 'you' and 'your'. No jargon.",
  minimal: "Maximum impact per word. Short sentences. One idea per sentence. Cut every filler word.",
  faceless_broll: "Narration-driven, no on-camera host. Write authoritative voiceover; every sentence pairs with a concrete visual. Avoid first-person entirely. One idea per 3–4 seconds. Pacing is deliberate — trust the b-roll to carry emotion.",
  kinetic_text: "Text-forward, minimal narration. Each idea renders as a high-impact on-screen phrase. Maximum 7 words per visual moment. Strong rhythm — punch-cut cadence. Narration sparse or absent. Think: title card sequence.",
};

function validateScriptSections(
  scriptText: string,
  jobId: string,
  model: string,
): ScriptQualityWarning[] {
  const warnings: ScriptQualityWarning[] = [];
  const hookContent =
    (scriptText.match(/\[HOOK\]([\s\S]*?)(?=\[BODY\]|\[RESOLUTION\]|\[CTA\]|$)/) ?? [])[1]?.trim() ?? "";
  const bodyContent =
    (scriptText.match(/\[BODY\]([\s\S]*?)(?=\[RESOLUTION\]|\[CTA\]|$)/) ?? [])[1]?.trim() ?? "";

  const hookViolations = findHookBlocklistViolations(hookContent);
  if (hookViolations.length > 0) {
    log.warn({ jobId, model, violations: hookViolations }, "[script-quality] HOOK_BLOCKLIST violation");
    warnings.push({
      code: "hook_blocklist",
      message: `Hook opens with a blocked phrase: ${hookViolations.join(", ")}`,
      stage: "scripting",
    });
  }

  const bleedPatterns: Array<[RegExp, ScriptQualityWarning["code"], string]> = [
    [/\(\d+-\d+[-\s]second/i, "duration_bleed", "Body echoes duration instruction (e.g. '30-second section')"],
    [/\(insert \[visual/i, "visual_cue_bleed", "Body echoes '[VISUAL:' instruction template"],
    [/\(\d+-\d+\s*words?\b/i, "word_count_bleed", "Body echoes word-count instruction"],
    [/each (?:sentence )?increases stakes/i, "rule_text_bleed", "Body echoes rule text ('each sentence increases stakes')"],
  ];
  for (const [pattern, code, message] of bleedPatterns) {
    if (pattern.test(bodyContent)) {
      log.warn({ jobId, model, code }, "[script-quality] Instruction bleed detected in [BODY]");
      warnings.push({ code, message, stage: "scripting" });
    }
  }
  return warnings;
}

function buildSeriesContextPreamble(req: VideoJobRequest): string {
  const ctx = req.seriesContext;
  if (!ctx) return "";
  const lines: string[] = [
    `SERIES: "${ctx.seriesTitle}" — Episode ${req.episodeNumber ?? "?"} of ${req.totalEpisodes ?? "?"}`,
    `EPISODE: "${ctx.episodeTitle}" — ${ctx.episodeSummary}`,
  ];
  if (ctx.characterBible.length > 0) {
    lines.push(
      `CHARACTERS: ${ctx.characterBible.map((c) => `${c.name}: ${c.appearance}. AI_SEED: ${c.aiPromptSeed}`).join(" | ")}`,
    );
  }
  lines.push(
    `WORLD: Palette ${ctx.worldGuide.colorPalette.join(", ")}. Camera: ${ctx.worldGuide.cameraLanguage.defaultLens}. ${ctx.worldGuide.cameraLanguage.shotGrammarRules}`,
  );
  if (ctx.previousEpisodeSummaries.length > 0) {
    lines.push(
      `PRIOR EPISODES: ${ctx.previousEpisodeSummaries.map((s, i) => `Ep${i + 1}: ${s}`).join(" | ")}`,
    );
  }
  if (ctx.chekhovGun) {
    lines.push(`PLANT THIS ELEMENT: ${ctx.chekhovGun}`);
  }
  return lines.join("\n") + "\n\n";
}

function buildScriptingPrompt(
  req: VideoJobRequest,
  plan: string[],
  options: { reinforceHookBlocklist?: boolean } = {},
): string {
  const dur = req.targetDurationSeconds ?? 60;
  const toneInstruction = TONE_RULES[req.tone ?? "educational"] ?? TONE_RULES["educational"];
  const seriesPreamble = buildSeriesContextPreamble(req);
  const bodyTargetSecs = Math.round(dur * 0.6);
  const hookBlocklist = HOOK_BLOCKLIST.slice(0, 6)
    .map((p) => `"${p.trim()}"`)
    .join(", ");
  const regenerationInstruction = options.reinforceHookBlocklist
    ? "\nREGENERATION NOTE: The previous hook opened like a generic preamble. Replace it with a specific tension, number, named villain, or identity challenge. Do not start with a greeting, setup phrase, or self-reference.\n"
    : "";

  return `You are an expert short-form video scriptwriter for ${req.platform ?? "tiktok"}.
${seriesPreamble}Niche: ${req.niche ?? "general"} | Tone: ${req.tone ?? "educational"} | Style: ${req.style ?? "faceless_broll"} | Voice: ${req.voice ?? "default"}
Audience: ${req.audience ?? "general viewers"}
Original brief: "${req.prompt}"

Production plan:
${plan.map((p, i) => `${i + 1}. ${p}`).join("\n")}

Tone: ${toneInstruction}
${regenerationInstruction}

WRITING RULES — follow these; do NOT output them:
[HOOK]: At most 18 words. One sentence. Pattern-interrupt opening — contrast, claim, or question. No preamble. Never start with ${hookBlocklist} or similar.
[BODY]: ${bodyTargetSecs} seconds of content. 3–4 sentences; each must increase stakes or deepen understanding. Active voice. After any sentence that implies a visual, add on the next line: [VISUAL: subject + motion + setting + mood + quality keywords].
[RESOLUTION]: 1–2 sentences. Actionable — resolves the hook's tension. Not a summary.
[CTA]: 5–8 words. Specific to this audience. Never "like and subscribe".

Write the script now. Output ONLY the four sections below. No commentary, no rule text, no explanations.

[HOOK]
[BODY]
[RESOLUTION]
[CTA]`;
}

function buildStoryboardPrompt(req: VideoJobRequest, scriptText: string): string {
  const isKinetic = req.style === "kinetic_text" || req.tone === "kinetic_text";
  const styleNote = isKinetic
    ? "Bold typography on dark or high-contrast backgrounds. Text appears in sync with narration. Minimal motion blur."
    : "Abstract b-roll: particles, flowing light, slow-motion textures, data visualizations. No faces, no people.";
  const colorMoods: Record<string, string> = {
    contrarian: "high-contrast black and white with one sharp accent color (red or electric blue)",
    urgent: "warm reds and amber, high saturation, strong vignette",
    educational: "cool blues and greens, clean gradients, trustworthy palette",
    cinematic: "desaturated with warm golden undertone, subtle film grain feel",
    warm: "soft warm tones, gentle gradients, pastel highlights",
    minimal: "pure black or white background, single color accent",
    faceless_broll: "neutral-to-dark tones with selective brightness; let the b-roll footage dictate the palette — no enforced monochrome",
    kinetic_text: "pure black background, high-contrast white typography, single bold accent for emphasis",
  };
  const colorMood = colorMoods[req.tone ?? "educational"] ?? colorMoods["educational"];
  const seriesPreamble = buildSeriesContextPreamble(req);
  // Inject character AI seeds into visual instructions when a character bible exists
  const characterSeedNote = req.seriesContext?.characterBible.length
    ? `\nCharacter visual seeds (copy verbatim for any scene featuring the character):\n${req.seriesContext.characterBible.map((c) => `  ${c.name}: ${c.aiPromptSeed}`).join("\n")}`
    : "";
  return `You are a visual director for ${isKinetic ? "kinetic typography" : "faceless b-roll"} short-form video.
${seriesPreamble}Platform: ${req.platform ?? "tiktok"} | Tone: ${req.tone ?? "educational"}
Visual style: ${styleNote}
Color palette direction: ${colorMood}${characterSeedNote}

Script:
${scriptText.slice(0, 1400)}

Extract 5-7 visual scenes that map in sequence to the script's beats: HOOK → CONTEXT → INSIGHT → PROOF → CTA.

For each scene, output on one line:
- [SCENE N | BEAT] ${isKinetic ? 'Text: "exact words on screen" | ' : ""}Motion: [what moves and how] | Color: [dominant palette note] | Pacing: [fast cut / hold / slow fade]

Be specific to this script's content. No generic descriptions.`;
}

function buildComfyWorkflow(
  req:    VideoJobRequest,
  frames: string[]
): Record<string, unknown> {
  return {
    "1": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: `${frames[0] ?? req.prompt}, vertical 9:16, abstract, cinematic, no faces, ${req.niche ?? "motivational"}`,
        clip: ["2", 1],
      },
    },
    // Additional workflow nodes loaded from workflows/video-generation.yaml
  };
}
