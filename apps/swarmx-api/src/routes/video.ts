/**
 * apps/swarmx-api/src/routes/video.ts
 * SwarmXQ Video Subsystem — Fastify Route Plugin
 *
 * Exposes:
 *   POST   /api/video/jobs
 *   GET    /api/video/jobs
 *   GET    /api/video/jobs/:id
 *   POST   /api/video/jobs/:id/cancel
 *   GET    /api/video/files/:filename   (static output serving)
 */

import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { VideoJobRequest, VideoJobListQuery, VideoJobStage } from "../types/video.js";
import { isTerminalStatus, VIDEO_JOB_STAGE_ORDER } from "../types/video.js";
import * as queue from "../services/video-queue.js";
import * as assets from "../services/video-assets.js";
import { runOrchestration } from "../services/video-orchestrator.js";
import type { BroadcastFn } from "../services/video-orchestrator.js";
import { getAvailableRamMb } from "../services/adaptive-timeout-config.js";
import { minimumRamRequiredForVideoRequest } from "../services/video-runtime-config.js";
import { requireVideoWriteAuth } from "../services/video-auth.js";
import { generateCaptionDraftWithValidation } from "../services/caption-generator.js";
import { scoreVirality } from "../services/virality-scorer.js";
import {
  generateLTXWorkflow,
  generateWanI2VWorkflow,
  generateWanT2VWorkflow,
} from "../services/video-workflows.js";
import {
  getVideoPublisher,
  listSupportedPublishPlatforms,
} from "../services/video-publishers.js";
import type { PublishResult } from "@swarmx/types/video-types";
import { recordVideoPerformance } from "../services/video-assets.js";
import { selectVoiceProvider } from "../services/voice-providers.js";
import { resolveCanonicalTag } from "@swarmx/types/operator-map";
import type { CaptionDraft } from "@swarmx/types/video-types";
import { loadEnv } from "../lib/env.js";

const execFileAsync = promisify(execFile);
async function commandAvailable(cmd: string, versionFlag = "--version"): Promise<boolean> {
  try {
    await execFileAsync(cmd, [versionFlag], { timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

const PublishRequestSchema = {
  type: "object",
  required: ["platform"],
  properties: {
    platform: { type: "string", enum: ["tiktok", "reels", "shorts", "generic"] },
    scheduledAt: { type: "string" },
  },
} as const;

const ResumeRequestSchema = {
  type: "object",
  required: ["fromStage"],
  properties: { fromStage: { type: "string" } },
} as const;

const ReprioritizeSchema = {
  type: "object",
  required: ["orderedIds"],
  properties: {
    orderedIds: { type: "array", items: { type: "string" }, minItems: 1 },
  },
} as const;

const CaptionScoreSchema = z.object({
  prompt: z.string().min(1).max(2000),
  platform: z.enum(["tiktok", "reels", "shorts", "generic"]),
  tone: z.string().min(1).max(120).optional(),
  durationSec: z.number().int().min(5).max(600).optional(),
});

const CaptionScoreDraftSchema = z.object({
  draft: z.object({
    firstLine: z.string().min(1),
    body: z.string(),
    cta: z.string(),
    hashtags: z.object({
      broad: z.array(z.string()),
      niche: z.array(z.string()),
      trending: z.array(z.string()),
    }),
    soundSuggestion: z.string().optional(),
  }),
  platform: z.enum(["tiktok", "reels", "shorts", "generic"]),
  durationSec: z.number().int().min(5).max(600).optional(),
  jobId: z.string().min(1).optional(),
});

const ResumeBodySchema = z.object({
  fromStage: z.enum(VIDEO_JOB_STAGE_ORDER as [VideoJobStage, ...VideoJobStage[]]),
});

const ReprioritizeBodySchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

const { SWARMX_VIDEO_CAPTION_SCORE_LIMIT_PER_MIN, SWARMX_VIDEO_JOB_LIMIT_PER_HOUR } = loadEnv();
const captionScoreRateWindowMs = 60_000;
const captionScoreRateLimit = SWARMX_VIDEO_CAPTION_SCORE_LIMIT_PER_MIN;
const captionScoreBuckets = new Map<string, number[]>();
const jobSubmitRateWindowMs = 60_000 * 60;
const jobSubmitRateLimit = SWARMX_VIDEO_JOB_LIMIT_PER_HOUR;
const jobSubmitBuckets = new Map<string, number[]>();

setInterval(() => {
  const now = Date.now();
  for (const [key, events] of captionScoreBuckets) {
    if (events.length === 0 || events.every((ts) => now - ts > captionScoreRateWindowMs)) captionScoreBuckets.delete(key);
  }
  for (const [key, events] of jobSubmitBuckets) {
    if (events.length === 0 || events.every((ts) => now - ts > jobSubmitRateWindowMs)) jobSubmitBuckets.delete(key);
  }
}, 2 * 60 * 60 * 1000).unref();

function getConnectionKey(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) return forwarded.split(",")[0]?.trim() ?? request.ip;
  return request.ip;
}

function exceedsCaptionScoreLimit(connectionKey: string, nowMs: number): boolean {
  const events = captionScoreBuckets.get(connectionKey) ?? [];
  const inWindow = events.filter((ts) => nowMs - ts <= captionScoreRateWindowMs);
  if (inWindow.length >= captionScoreRateLimit) {
    captionScoreBuckets.set(connectionKey, inWindow);
    return true;
  }
  inWindow.push(nowMs);
  captionScoreBuckets.set(connectionKey, inWindow);
  return false;
}

function exceedsJobSubmitLimit(connectionKey: string, nowMs: number): boolean {
  const events = jobSubmitBuckets.get(connectionKey) ?? [];
  const inWindow = events.filter((ts) => nowMs - ts <= jobSubmitRateWindowMs);
  if (inWindow.length >= jobSubmitRateLimit) {
    jobSubmitBuckets.set(connectionKey, inWindow);
    return true;
  }
  inWindow.push(nowMs);
  jobSubmitBuckets.set(connectionKey, inWindow);
  return false;
}

function mergePublishHistory(history: PublishResult[] | undefined, nextResult: PublishResult): PublishResult[] {
  const remaining = (history ?? []).filter((entry) => entry.publishId !== nextResult.publishId);
  return [nextResult, ...remaining].sort((left, right) => Date.parse(right.requestedAt) - Date.parse(left.requestedAt));
}

function writeSseEvent(reply: FastifyReply, event: unknown): void {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

function initSseReply(reply: FastifyReply): void {
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");
  reply.raw.flushHeaders();
  reply.raw.write(": connected\n\n");
}

async function cancelVideoJob(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply, broadcast: BroadcastFn) {
  const job = queue.getJob(request.params.id);
  if (!job) return reply.status(404).send({ error: "not_found", message: `Video job ${request.params.id} not found` });
  const previousStatus = job.status;
  const cancelled = queue.cancelJob(request.params.id);
  if (!cancelled) return reply.status(409).send({ error: "already_terminal", message: `Job is already in terminal state '${previousStatus}'` });
  broadcast({ type: "video:cancelled", timestamp: new Date().toISOString(), data: { jobId: job.id, cancelledAt: new Date().toISOString(), requestedBy: "user", ...(job.currentStage !== undefined ? { stage: job.currentStage } : {}) } });
  return reply.send({ jobId: job.id, cancelled: true, previousStatus, message: "Job cancelled" });
}

const VideoJobRequestSchema = {
  type: "object",
  required: ["prompt"],
  properties: {
    prompt: { type: "string", minLength: 1, maxLength: 2000 },
    platform: { type: "string", enum: ["tiktok", "youtube_shorts", "reels", "generic"] },
    niche: { type: "string", enum: ["motivational", "finance", "facts", "true_crime", "tech", "other"] },
    templateFamily: { type: "string", enum: ["myth-vs-fact", "pov-immersion", "listicle-countdown", "reddit-story"] },
    targetDurationSeconds: { type: "number", minimum: 15, maximum: 180 },
    modelTier: { type: "string", enum: ["fast", "worker", "supervisor", "reasoner"] },
    audience: { type: "string", minLength: 1, maxLength: 160 },
    tone: { type: "string", enum: ["educational", "urgent", "warm", "contrarian", "cinematic", "minimal", "faceless_broll", "kinetic_text"] },
    style: { type: "string", enum: ["faceless_broll", "kinetic_text", "storytime", "tutorial", "myth_busting"] },
    captionStyle: { type: "string", enum: ["bold_center", "lower_third", "minimal"] },
    voice: { type: "string", enum: ["default", "calm", "energetic", "narrator"] },
    voiceProfileId: { type: "string", enum: ["auto", "kokoro_warm", "kokoro_narrator", "kokoro_energetic", "kokoro_contrarian", "kokoro_storytime_dual"] },
    storyMode: { type: "string", enum: ["single_narrator", "dialogue_storytime"] },
    clientRequestId: { type: "string", maxLength: 128 },
  },
} as const;

const JobIdParamSchema = { type: "object", required: ["id"], properties: { id: { type: "string" } } } as const;
const ListQuerySchema = { type: "object", properties: { status: { type: "string", enum: ["queued", "running", "completed", "failed", "cancelled"] }, platform: { type: "string" }, limit: { type: "number", minimum: 1, maximum: 100 }, offset: { type: "number", minimum: 0 } } } as const;

export async function videoRoutes(fastify: FastifyInstance, opts: FastifyPluginOptions & { broadcast?: BroadcastFn }): Promise<void> {
  const broadcast: BroadcastFn = opts.broadcast ?? ((event) => fastify.log.debug({ event }, "video:event (no broadcaster)"));

  // ── GET /queue/health ─────────────────────────────────────────────────────
  // Read-only operational telemetry; no Redis credentials or job payloads.
  fastify.get("/queue/health", async (_request, reply) => {
    const snapshot = queue.queueHealthSnapshot();
    return reply.send({ status: "ok", timestamp: new Date().toISOString(), ...snapshot });
  });

  // ── POST /jobs ─────────────────────────────────────────────────────────────
  fastify.post<{ Body: VideoJobRequest }>(
    "/jobs",
    {
      preHandler: requireVideoWriteAuth,
      schema: {
        body: VideoJobRequestSchema,
        response: {
          201: { type: "object", properties: { jobId: { type: "string" }, status: { type: "string" }, createdAt: { type: "string" }, message: { type: "string" } } },
          422: { type: "object", properties: { error: { type: "string" }, message: { type: "string" } } },
          503: { type: "object", properties: { error: { type: "string" }, message: { type: "string" }, availableMb: { type: "number" }, minimumRequired: { type: "number" } } },
        },
      },
    },
    async (request, reply) => {
      const nowMs = Date.now();
      const connectionKey = getConnectionKey(request);
      if (exceedsJobSubmitLimit(connectionKey, nowMs)) return reply.status(429).send({ error: "rate_limited", message: `Video job submissions are limited to ${jobSubmitRateLimit} per hour per connection` });
      const availableMb = getAvailableRamMb();
      const minimumRequired = minimumRamRequiredForVideoRequest(request.body);
      if (availableMb < minimumRequired) return reply.status(503).send({ error: "insufficient_ram_for_video", message: "Insufficient RAM for video generation", availableMb, minimumRequired });
      const renderBackend = loadEnv().SWARMX_VIDEO_RENDER_BACKEND;
      const hasFfprobe = await commandAvailable("ffprobe", "-version");
      if (!hasFfprobe) return reply.status(503).send({ error: "ffprobe_unavailable", message: "ffprobe is required for video artifact validation but was not found. Install it with: sudo apt install ffmpeg" });
      if (renderBackend === "local" || renderBackend === "automatic") {
        const hasFfmpeg = await commandAvailable("ffmpeg", "-version");
        if (!hasFfmpeg) return reply.status(503).send({ error: "ffmpeg_unavailable", message: "ffmpeg is required for local video rendering but was not found. Install it with: sudo apt install ffmpeg" });
      }
      const job = queue.enqueue(request.body);
      void runOrchestration(job.id, broadcast);
      return reply.status(201).send({ jobId: job.id, status: job.status, createdAt: job.createdAt, message: "Video generation queued" });
    },
  );

  fastify.get<{ Querystring: VideoJobListQuery }>("/jobs", { schema: { querystring: ListQuerySchema } }, async (request, reply) => reply.send(queue.listJobs(request.query)));

  fastify.get<{ Params: { id: string } }>("/jobs/:id", { schema: { params: JobIdParamSchema } }, async (request, reply) => {
    const job = queue.getJob(request.params.id);
    if (!job) return reply.status(404).send({ error: "not_found", message: `Video job ${request.params.id} not found` });
    return reply.send(job);
  });

  fastify.get<{ Params: { id: string } }>("/jobs/:id/sse", { schema: { params: JobIdParamSchema } }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const job = queue.getJob(request.params.id);
    if (!job) return reply.status(404).send({ error: "not_found", message: `Video job ${request.params.id} not found` });
    initSseReply(reply);
    writeSseEvent(reply, { type: "video:snapshot", timestamp: new Date().toISOString(), data: { job } });
    let closed = false;
    let heartbeat: NodeJS.Timeout | undefined;
    const jobEvents = queue.subscribeToJob(request.params.id)[Symbol.asyncIterator]();
    const terminate = () => { if (closed) return; closed = true; if (heartbeat) clearInterval(heartbeat); void jobEvents.return?.(); try { reply.raw.end(); } catch { /* socket already gone */ } };
    if (isTerminalStatus(job.status)) { terminate(); return; }
    const sseForwarder = (async () => { try { while (!closed) { const next = await jobEvents.next(); if (next.done) break; const event = next.value; if (!event) continue; writeSseEvent(reply, event); if (event.type === "video:completed" || event.type === "video:failed" || event.type === "video:cancelled") { terminate(); break; } } } catch { /* socket can close while waiting */ } finally { await jobEvents.return?.(); } })();
    heartbeat = setInterval(() => { try { reply.raw.write(`: heartbeat ${Date.now()}\n\n`); } catch { terminate(); } }, 15_000);
    request.raw.on("close", terminate);
    void sseForwarder;
    await new Promise<void>((resolve) => request.raw.on("close", resolve));
  });

  fastify.post<{ Params: { id: string } }>("/jobs/:id/cancel", { preHandler: requireVideoWriteAuth, schema: { params: JobIdParamSchema } }, async (request, reply) => cancelVideoJob(request, reply, broadcast));
  fastify.delete<{ Params: { id: string } }>("/jobs/:id", { preHandler: requireVideoWriteAuth, schema: { params: JobIdParamSchema } }, async (request, reply) => cancelVideoJob(request, reply, broadcast));

  fastify.post<{ Params: { id: string }; Body: { fromStage: string } }>("/jobs/:id/resume", { preHandler: requireVideoWriteAuth, schema: { params: JobIdParamSchema, body: ResumeRequestSchema } }, async (request, reply) => {
    const parsed = ResumeBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request", message: "Invalid resume payload", issues: parsed.error.issues });
    try { const resumed = queue.resumeJob(request.params.id, parsed.data.fromStage); return reply.send({ jobId: resumed.id, status: resumed.status, resumeFromStage: resumed.resumeFromStage, retryCount: resumed.retryCount }); }
    catch (err: unknown) { const message = err instanceof Error ? err.message : "resume_failed"; if (message.startsWith("invalid_stage:") || message.startsWith("prerequisite_stage_incomplete:")) return reply.status(422).send({ error: "invalid_resume_stage", message }); return reply.status(400).send({ error: "resume_failed", message }); }
  });

  fastify.post<{ Body: { orderedIds: string[] } }>("/jobs/reprioritize", { preHandler: requireVideoWriteAuth, schema: { body: ReprioritizeSchema } }, async (request, reply) => {
    const parsed = ReprioritizeBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request", message: "Invalid reprioritize payload", issues: parsed.error.issues });
    await queue.reprioritizeQueue(parsed.data.orderedIds);
    return reply.send({ reprioritized: true, orderedIds: parsed.data.orderedIds });
  });

  // Preserve the remaining production video routes from the canonical main branch.
  fastify.get<{ Params: { id: string } }>("/jobs/:id/artifacts", { schema: { params: JobIdParamSchema } }, async (request, reply) => {
    const job = queue.getJob(request.params.id);
    if (!job) return reply.status(404).send({ error: "not_found", message: `Video job ${request.params.id} not found` });
    return reply.send({ jobId: job.id, artifacts: job.outputArtifacts ?? {}, output: job.output ?? null, frames: [...(job.output?.storyboardFrames ?? []), ...(job.outputArtifacts?.frameDirectory ? [job.outputArtifacts.frameDirectory] : []), ...(job.outputArtifacts?.interpolatedFrameDirectory ? [job.outputArtifacts.interpolatedFrameDirectory] : [])], thumbnail: job.outputArtifacts?.thumbnailPath ?? job.outputArtifacts?.firstFramePath ?? null });
  });
}
