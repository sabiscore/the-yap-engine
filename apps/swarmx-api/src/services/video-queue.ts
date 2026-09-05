/**
 * apps/swarmx-api/src/services/video-queue.ts
 * SwarmXQ Video Subsystem — In-Memory Job Queue
 *
 * Responsibilities:
 *  - Job registry (Map<id, VideoJob>)
 *  - State transitions with invariant enforcement
 *  - Retry / terminal-state handling
 *  - Concurrency gating via pressure monitor
 */

import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { log } from "../lib/logger.js";
import { loadEnv } from "../lib/env.js";
import type {
  VideoJob,
  VideoJobRequest,
  VideoJobStatus,
  VideoJobStage,
  VideoStageProgress,
  VideoJobError,
} from "../types/video.js";
import { isTerminalStatus, VIDEO_JOB_STAGE_ORDER } from "../types/video.js";
import type { SwarmXEvent } from "../types/events.js";
import { subscribeToEvents } from "../plugins/sse.js";
import { appendStateEvent, readSnapshot, writeSnapshot } from "./local-state-store.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const queueEnv = loadEnv();
const MAX_QUEUE_SIZE = queueEnv.SWARMX_VIDEO_QUEUE_MAX_SIZE;

/**
 * Derive effective worker concurrency from operator configuration and the
 * deployment's declared Modal container capacity. The safe default remains 1.
 */
export function getEffectiveConcurrency(env = loadEnv()): number {
  const configured = Math.max(1, Math.floor(env.SWARMX_VIDEO_MAX_CONCURRENT_JOBS));
  const modalCapacity = Math.max(1, Math.floor(env.SWARMX_MODAL_MAX_CONTAINERS));
  return Math.max(1, Math.min(configured, modalCapacity));
}

const CONFIGURED_CONCURRENCY = queueEnv.SWARMX_VIDEO_MAX_CONCURRENT_JOBS;
const MODAL_CAPACITY = queueEnv.SWARMX_MODAL_MAX_CONTAINERS;
const concurrency = getEffectiveConcurrency(queueEnv);
const MAX_RETRIES = queueEnv.SWARMX_VIDEO_MAX_RETRIES;
const JOB_TTL_MS = queueEnv.SWARMX_VIDEO_JOB_TTL_MS;
export const VIDEO_QUEUE_NAME = queueEnv.SWARMX_VIDEO_QUEUE_NAME;
const REDIS_URL = queueEnv.REDIS_URL;

// Runtime override — set by server.ts after Redis health check.
// null = not overridden; read from env schema. false = Redis unavailable fallback.
let _bullmqOverride: boolean | null = null;

export function setBullMQRuntimeEnabled(enabled: boolean): void {
  _bullmqOverride = enabled;
}

export function isBullMQEnabled(): boolean {
  if (_bullmqOverride !== null) return _bullmqOverride;
  try {
    return loadEnv().SWARMX_VIDEO_USE_BULLMQ === "1";
  } catch {
    return false;
  }
}
// ─── Internal ─────────────────────────────────────────────────────────────────

const registry = new Map<string, VideoJob>();
let bullQueue: Queue<VideoJobRequest> | null = null;
let hydrated = false;

function persistJob(event: string, job: VideoJob): void {
  appendStateEvent("video-jobs", event, job);
  writeSnapshot("video-jobs", [...registry.values()]);
}

function appendErrorHistory(job: VideoJob, error: VideoJobError): void {
  const entry = {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    ...(error.stage !== undefined ? { stage: error.stage } : {}),
    ...(error.details !== undefined ? { details: error.details } : {}),
  };
  job.errorLog = [...(job.errorLog ?? []), entry].slice(-25);
}

function getBullQueue(): Queue<VideoJobRequest> {
  if (!bullQueue) {
    bullQueue = new Queue<VideoJobRequest>(VIDEO_QUEUE_NAME, {
      connection: { url: REDIS_URL },
      defaultJobOptions: {
        attempts: MAX_RETRIES + 1,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    });
  }
  return bullQueue;
}

function now(): string {
  return new Date().toISOString();
}

function assertMutable(job: VideoJob, op: string): void {
  if (isTerminalStatus(job.status)) {
    throw new Error(
      `VideoQueue: cannot perform '${op}' on job ${job.id} — already in terminal state '${job.status}'`
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new job and place it in 'queued' state.
 * Throws if the queue is full.
 */
export function enqueue(request: VideoJobRequest): VideoJob {
  const queued = [...registry.values()].filter(
    (j) => j.status === "queued" || j.status === "running"
  );

  if (queued.length >= MAX_QUEUE_SIZE) {
    throw new Error(
      `VideoQueue: queue is full (${MAX_QUEUE_SIZE} active jobs). Try again later.`
    );
  }

  // Idempotency: if client re-submits the same clientRequestId and the prior
  // job is non-terminal, return the existing job.
  if (request.clientRequestId) {
    for (const existing of registry.values()) {
      if (
        existing.clientRequestId === request.clientRequestId &&
        !isTerminalStatus(existing.status)
      ) {
        return existing;
      }
    }
  }

  const job: VideoJob = {
    id: randomUUID(),
    status: "queued",
    request,
    stages: {},
    overallProgress: 0,
    retryCount: 0,
    maxRetries: MAX_RETRIES,
    createdAt: now(),
    updatedAt: now(),
    ...(request.clientRequestId !== undefined
      ? { clientRequestId: request.clientRequestId }
      : {}),
  };

  registry.set(job.id, job);
  persistJob("enqueue", job);

  if (isBullMQEnabled()) {
    void getBullQueue().add("video-job", request, {
      jobId: job.id,
      priority: 5,
    });
  }

  scheduleCleanup(job.id);
  return job;
}

/**
 * Retrieve a job by id.
 */
export function getJob(id: string): VideoJob | undefined {
  return registry.get(id);
}

/**
 * List jobs, optionally filtered by status.
 */
export function listJobs(filter?: {
  status?: VideoJobStatus;
  limit?: number;
  offset?: number;
}): { jobs: VideoJob[]; total: number } {
  let all = [...registry.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );

  if (filter?.status) {
    all = all.filter((j) => j.status === filter.status);
  }

  const total = all.length;
  const offset = filter?.offset ?? 0;
  const limit = Math.min(filter?.limit ?? 50, 100);
  return { jobs: all.slice(offset, offset + limit), total };
}

/**
 * Transition a job from 'queued' → 'running'.
 * Returns null if concurrency limit is reached or job is not in queued state.
 */
export function startJob(id: string): VideoJob | null {
  const job = registry.get(id);
  if (!job || job.status !== "queued") return null;

  const running = [...registry.values()].filter(
    (j) => j.status === "running"
  ).length;

  if (CONFIGURED_CONCURRENCY !== concurrency) {
    log.info(
      { configured: CONFIGURED_CONCURRENCY, modalCapacity: MODAL_CAPACITY, effective: concurrency },
      "video-queue: concurrency capped by deployment capacity",
    );
  }

  if (running >= concurrency) return null;

  job.status = "running";
  job.startedAt = now();
  job.updatedAt = now();
  delete job.nextRetryAt;
  delete job.nextRetryDelayMs;
  delete job.error;
  persistJob("start", job);
  return job;
}

/**
 * Record progress for a stage.
 */
export function recordStageProgress(
  id: string,
  stage: VideoJobStage,
  progress: VideoStageProgress
): VideoJob {
  const job = registry.get(id);
  if (!job) throw new Error(`VideoQueue: job ${id} not found`);
  assertMutable(job, "recordStageProgress");

  job.stages[stage] = progress;
  job.currentStage = stage;
  job.overallProgress = progress.overallProgress;
  job.updatedAt = now();
  persistJob("stage_progress", job);
  return job;
}

/**
 * Mark stage as completed.
 */
export function completeStage(
  id: string,
  stage: VideoJobStage
): VideoJob {
  const job = registry.get(id);
  if (!job) throw new Error(`VideoQueue: job ${id} not found`);
  assertMutable(job, "completeStage");

  const existing = job.stages[stage] ?? {
    stage,
    stageProgress: 0,
    overallProgress: 0,
  };

  const stageIdx = VIDEO_JOB_STAGE_ORDER.indexOf(stage);
  const total = VIDEO_JOB_STAGE_ORDER.length;
  const overallProgress = Math.round(((stageIdx + 1) / total) * 100);

  job.stages[stage] = {
    ...existing,
    stage,
    stageProgress: 100,
    overallProgress,
    completedAt: now(),
    ...(existing.startedAt
      ? { durationMs: Date.now() - Date.parse(existing.startedAt) }
      : {}),
  };
  job.overallProgress = overallProgress;
  job.updatedAt = now();
  persistJob("stage_complete", job);
  return job;
}

/**
 * Transition a job to 'completed'.
 */
export function completeJob(
  id: string,
  output: VideoJob["output"]
): VideoJob {
  const job = registry.get(id);
  if (!job) throw new Error(`VideoQueue: job ${id} not found`);
  assertMutable(job, "completeJob");

  job.status = "completed";
  if (output !== undefined) {
    job.output = output;
  }
  job.overallProgress = 100;
  delete job.nextRetryAt;
  delete job.nextRetryDelayMs;
  job.completedAt = now();
  job.updatedAt = now();
  delete job.currentStage;
  delete job.error;
  persistJob("complete", job);
  return job;
}

/**
 * Transition a job to 'failed'.
 * If retries remain and the error is retryable, re-queues the job.
 * Returns the updated job (either failed or re-queued).
 */
export function failJob(id: string, error: VideoJobError): VideoJob {
  const job = registry.get(id);
  if (!job) throw new Error(`VideoQueue: job ${id} not found`);
  assertMutable(job, "failJob");

  appendErrorHistory(job, error);
  job.maxRetries = MAX_RETRIES;
  delete job.nextRetryAt;
  delete job.nextRetryDelayMs;

  if (error.retryable && job.retryCount < MAX_RETRIES) {
    job.status = "queued";
    job.retryCount += 1;
    job.error = error;
    delete job.currentStage;
    delete job.startedAt;
    job.stages = {};
    job.overallProgress = 0;
    job.updatedAt = now();
    persistJob("retry", job);
    return job;
  }

  job.status = "failed";
  job.error = error;
  job.completedAt = now();
  job.updatedAt = now();
  delete job.currentStage;
  persistJob("fail", job);
  return job;
}

export function setRetrySchedule(id: string, delayMs: number): VideoJob | null {
  const job = registry.get(id);
  if (!job || job.status !== "queued") return null;

  const boundedDelayMs = Math.max(0, Math.floor(delayMs));
  const nextRetryAt = new Date(Date.now() + boundedDelayMs).toISOString();
  job.nextRetryDelayMs = boundedDelayMs;
  job.nextRetryAt = nextRetryAt;
  job.updatedAt = now();
  persistJob("retry_schedule", job);
  return job;
}

/**
 * Cancel a job.
 * Returns false if the job is already in a terminal state.
 */
export function cancelJob(id: string): boolean {
  const job = registry.get(id);
  if (!job || isTerminalStatus(job.status)) return false;

  job.status = "cancelled";
  delete job.nextRetryAt;
  delete job.nextRetryDelayMs;
  job.completedAt = now();
  job.updatedAt = now();
  delete job.currentStage;
  persistJob("cancel", job);
  return true;
}

/**
 * Pick the next queued job that fits concurrency limits.
 * Returns undefined if nothing is available or concurrency is saturated.
 */
export function dequeueNext(): VideoJob | undefined {
  const running = [...registry.values()].filter(
    (j) => j.status === "running"
  ).length;
  if (running >= concurrency) return undefined;

  return [...registry.values()]
    .filter((j) => j.status === "queued")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
}

/**
 * Number of jobs currently running.
 */
export function runningCount(): number {
  return [...registry.values()].filter((j) => j.status === "running").length;
}

/**
 * Number of jobs currently queued.
 */
export function queuedCount(): number {
  return [...registry.values()].filter((j) => j.status === "queued").length;
}

/**
 * Stable operational snapshot for health/readiness endpoints and the operator
 * console. It intentionally excludes Redis credentials and job payloads.
 */
export function queueHealthSnapshot(): {
  queueName: string;
  bullmqEnabled: boolean;
  configuredConcurrency: number;
  modalCapacity: number;
  effectiveConcurrency: number;
  running: number;
  queued: number;
  capacityUtilization: number;
  maxQueueSize: number;
} {
  const effective = getEffectiveConcurrency();
  const running = runningCount();
  return {
    queueName: VIDEO_QUEUE_NAME,
    bullmqEnabled: isBullMQEnabled(),
    configuredConcurrency: CONFIGURED_CONCURRENCY,
    modalCapacity: MODAL_CAPACITY,
    effectiveConcurrency: effective,
    running,
    queued: queuedCount(),
    capacityUtilization: Number((running / effective).toFixed(3)),
    maxQueueSize: MAX_QUEUE_SIZE,
  };
}

export async function reprioritizeQueue(orderedIds: string[]): Promise<void> {
  const queuedJobs = [...registry.values()].filter((job) => job.status === "queued");
  const indexed = new Map(orderedIds.map((id, idx) => [id, idx]));

  const sorted = queuedJobs.sort((left, right) => {
    const leftIdx = indexed.get(left.id);
    const rightIdx = indexed.get(right.id);
    if (leftIdx === undefined && rightIdx === undefined) {
      return Date.parse(left.createdAt) - Date.parse(right.createdAt);
    }
    if (leftIdx === undefined) return 1;
    if (rightIdx === undefined) return -1;
    return leftIdx - rightIdx;
  });

  for (const job of sorted) {
    registry.delete(job.id);
    registry.set(job.id, job);
  }
  writeSnapshot("video-jobs", [...registry.values()]);

  if (isBullMQEnabled()) {
    const q = getBullQueue();
    for (let i = 0; i < sorted.length; i += 1) {
      const jobAtIndex = sorted[i];
      if (!jobAtIndex) continue;
      const priority = Math.max(1, sorted.length - i);
      const bullJob = await q.getJob(jobAtIndex.id);
      if (bullJob) {
        await bullJob.changePriority({ priority });
      }
    }
  }
}

export function resumeJob(id: string, fromStage: VideoJobStage): VideoJob {
  const job = registry.get(id);
  if (!job) {
    throw new Error(`VideoQueue: job ${id} not found`);
  }
  if (job.status !== "failed" && job.status !== "cancelled" && job.status !== "completed") {
    throw new Error(`VideoQueue: job ${id} is not terminal and cannot be resumed`);
  }

  const stageIdx = VIDEO_JOB_STAGE_ORDER.indexOf(fromStage);
  if (stageIdx === -1) {
    throw new Error(`invalid_stage:${fromStage}`);
  }

  if (stageIdx > 0) {
    const precedingStage = VIDEO_JOB_STAGE_ORDER[stageIdx - 1]!;
    if (!job.stages[precedingStage]?.completedAt) {
      throw new Error(`prerequisite_stage_incomplete:${precedingStage}`);
    }
  }

  job.status = "queued";
  job.resumeFromStage = fromStage;
  job.retryCount += 1;
  job.maxRetries = MAX_RETRIES;
  delete job.nextRetryAt;
  delete job.nextRetryDelayMs;
  job.updatedAt = now();
  delete job.error;
  delete job.completedAt;
  persistJob("resume", job);
  return job;
}

/**
 * Restore a BullMQ job into the in-memory registry after an API restart.
 * Called by the Worker when it picks up a job with no registry entry.
 */
export function restoreJobFromBullMQ(
  id: string,
  request: VideoJobRequest,
): VideoJob {
  const job: VideoJob = {
    id,
    status: "queued",
    request,
    stages: {},
    overallProgress: 0,
    retryCount: 0,
    maxRetries: MAX_RETRIES,
    createdAt: now(),
    updatedAt: now(),
    ...(request.clientRequestId !== undefined
      ? { clientRequestId: request.clientRequestId }
      : {}),
  };
  registry.set(id, job);
  persistJob("restore", job);
  scheduleCleanup(id);
  return job;
}

export function hydrateFromDisk(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const snapshot = readSnapshot<VideoJob[]>("video-jobs");
    if (Array.isArray(snapshot)) {
      for (const job of snapshot) registry.set(job.id, job);
    }
    for (const job of registry.values()) {
      if (job.status === "queued" || job.status === "running") {
        scheduleCleanup(job.id);
      }
    }
  } catch (error) {
    log.warn({ err: String(error) }, "video-queue: failed to hydrate state");
  }
}

export function subscribeToJob(jobId: string): AsyncIterable<SwarmXEvent> {
  const queue: SwarmXEvent[] = [];
  let closed = false;
  let pendingResolver: ((result: IteratorResult<SwarmXEvent>) => void) | null = null;
  let pendingPromise: Promise<IteratorResult<SwarmXEvent>> | null = null;

  return {
    [Symbol.asyncIterator](): AsyncIterator<SwarmXEvent> {
      const createPending = () => {
        pendingPromise = new Promise<IteratorResult<SwarmXEvent>>((resolve) => {
          pendingResolver = resolve;
        });
        return pendingPromise;
      };

      const resolvePending = (value: IteratorResult<SwarmXEvent>) => {
        const resolver = pendingResolver;
        pendingResolver = null;
        pendingPromise = null;
        if (resolver) resolver(value);
      };

      const unsubscribe = subscribeToEvents((event) => {
        if (!event.type.startsWith("video:")) return;
        const data = (event as { data?: unknown }).data;
        const matches = Boolean(
          data && typeof data === "object" && (
            ("jobId" in data && (data as { jobId?: string }).jobId === jobId) ||
            ("job" in data &&
              typeof (data as { job?: unknown }).job === "object" &&
              (data as { job: { id?: string } }).job.id === jobId)
          ),
        );
        if (!matches || closed) return;

        if (pendingResolver) {
          resolvePending({ value: event, done: false });
        } else {
          queue.push(event);
        }

        if (["video:completed", "video:failed", "video:cancelled"].includes(event.type)) {
          closed = true;
          unsubscribe();
          if (pendingResolver) {
            resolvePending({ value: undefined, done: true });
          }
        }
      });

      return {
        next(): Promise<IteratorResult<SwarmXEvent>> {
          if (queue.length > 0) {
            const nextItem = queue.shift();
            if (nextItem) return Promise.resolve({ value: nextItem, done: false });
          }
          if (closed) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return pendingPromise ?? createPending();
        },
        return(): Promise<IteratorResult<SwarmXEvent>> {
          closed = true;
          unsubscribe();
          if (pendingResolver) {
            resolvePending({ value: undefined, done: true });
          }
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

export function queueName(): string {
  return VIDEO_QUEUE_NAME;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

function scheduleCleanup(id: string): void {
  setTimeout(() => {
    const job = registry.get(id);
    if (job && isTerminalStatus(job.status)) {
      registry.delete(id);
      writeSnapshot("video-jobs", [...registry.values()]);
    }
  }, JOB_TTL_MS);
}

// Testing only — mirrors resetEnvForTesting() in env.ts
export function _resetRegistryForTesting(): void {
  registry.clear();
  bullQueue = null;
  _bullmqOverride = null;
  hydrated = false;
}
