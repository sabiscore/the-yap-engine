/**
 * apps/swarmx-dashboard/src/stores/video.ts
 * SwarmXQ Dashboard — Video Zustand Store
 *
 * Single source of truth for video jobs. The store subscribes to the global SSE
 * stream and applies video job events directly — no secondary useEffect needed
 * in page components. Components should read from this store only.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  VideoJob,
  VideoJobRequest,
  VideoJobStage,
  VideoStageProgress,
} from "../lib/video-dashboard";
import type {
  CaptionDraft,
  PublishResult,
  ViralitySignal,
  VideoArtifacts,
  VideoExportPlatform,
} from "@swarmx/types/video-types";
import {
  isIsoTimestampNewerOrEqual,
  isTerminalVideoStatus,
  normalizeVideoJob,
  normalizeVideoJobs,
} from "../lib/video-dashboard";
import type {
  SwarmXEvent,
  VideoEvent,
} from "../../../swarmx-api/src/types/events";

// ─── State ────────────────────────────────────────────────────────────────────

export interface VideoState {
  /** All known jobs, keyed by id. */
  jobs: Map<string, VideoJob>;
  /** Event fingerprints to avoid duplicate SSE application on reconnect/replay. */
  recentEventKeys: string[];
  /** Currently selected job for detail view. */
  selectedJobId: string | null;
  /** True while the initial job list is loading. */
  isLoading: boolean;
  /** True while a new job is being submitted. */
  isSubmitting: boolean;
  /** Non-null when the list fetch failed. */
  listError: string | null;
  /** Non-null when job submission failed. */
  submitError: string | null;
}

export interface VideoActions {
  // ── Remote ──────────────────────────────────────────────────────────────────
  fetchJobs: () => Promise<void>;
  fetchJobDetail: (jobId: string) => Promise<void>;
  submitJob: (request: VideoJobRequest) => Promise<string | null>;
  cancelJob: (jobId: string) => Promise<void>;
  publishJob: (jobId: string, input: { platform: "tiktok" | "reels" | "shorts" | "generic"; scheduledAt?: string }) => Promise<PublishResult | null>;
  recordJobSseStream: (jobId: string) => (() => void) | void;
  retryFromStage: (jobId: string, stage: string) => Promise<boolean>;
  reorderQueue: (orderedIds: string[]) => Promise<void>;
  scoreCaption: (draft: CaptionDraft, platform: VideoExportPlatform) => Promise<ViralitySignal | null>;

  // ── SSE ingestion ───────────────────────────────────────────────────────────
  /** Called by the top-level SSE hook to route events into the store. */
  ingestEvent: (event: SwarmXEvent) => void;
  /** Apply compact progress-style updates emitted on shared dashboard stream. */
  applyProgressEvent: (data: {
    jobId: string;
    correlationId: string;
    status: string;
    degradeMode: string;
    progress: number;
    timestamp: string;
    error?: string;
  }) => void;

  // ── Selection ───────────────────────────────────────────────────────────────
  selectJob: (jobId: string | null) => void;

  // ── Derived helpers ─────────────────────────────────────────────────────────
  getJob: (jobId: string) => VideoJob | undefined;
  listJobs: () => VideoJob[];
  selectedJob: () => VideoJob | undefined;

  // ── Reset ────────────────────────────────────────────────────────────────────
  clearErrors: () => void;
}

type VideoStore = VideoState & VideoActions;

function isApiVideoLifecycleEvent(event: SwarmXEvent): event is VideoEvent {
  return event.type.startsWith("video:") && "timestamp" in event;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const API_BASE = "";

/** Structured error thrown by apiFetch so callers can map error codes. Exported for testing. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    let code: string | null = null;
    let message = res.statusText;
    try {
      const body = await res.json() as { error?: string; message?: string };
      code = typeof body?.error === "string" ? body.error : null;
      message = typeof body?.message === "string" ? body.message : message;
    } catch {
      // non-JSON body — use statusText
    }
    throw new ApiError(res.status, message, code);
  }
  return res.json() as Promise<T>;
}

/**
 * Map a thrown API error to a calm, operator-safe user message.
 * Never exposes raw paths, stack traces, or internal server details.
 * Exported for testing.
 */
export function sanitizeApiError(err: unknown, fallback = "Something went wrong. Check that the API and Ollama are running."): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "rate_limited":
        return "Too Many Submissions — the hourly limit is reached. Wait ~1 hour before submitting again.";
      case "insufficient_ram_for_video":
        return "Admission Denied — not enough available RAM to start a video job. Free memory or wait for the current workload to finish.";
      case "admission_denied":
        return "Admission Denied — the job was rejected before queuing. Check RAM, queue depth, and binary availability.";
      case "queue_full":
        return "Admission Denied — the video queue is full. Wait for a running job to complete before submitting another.";
      case "ffmpeg_unavailable":
        return "Missing: ffmpeg — install with: sudo apt install ffmpeg";
      case "ffprobe_unavailable":
        return "Missing: ffprobe — install with: sudo apt install ffmpeg";
      case "voice_provider_unavailable":
        return "Voice Provider Unavailable — start Kokoro TTS, configure Piper, or install espeak-ng for local fallback narration.";
      case "unauthorized":
        return "Video write access is not authorized. Configure SWARMX_VIDEO_API_TOKEN on the dashboard and API server.";
      case "queue_error":
        return "The video queue could not accept this job. Wait a moment and try again.";
      case "not_found":
        return "That video job is no longer available. Refresh the queue and try again.";
      default:
        if (err.status === 503) return "The API or a required service is temporarily unavailable. Retry in a moment.";
        if (err.status === 429) return "Too Many Submissions — wait before retrying.";
        if (err.status === 409) return "This action cannot be performed on a job in its current state.";
        return fallback;
    }
  }
  // Network-level or unknown errors — guard message access; some TypeError subclasses omit it.
  if (err instanceof TypeError && typeof err.message === "string" && err.message.toLowerCase().includes("fetch")) {
    return "Unable to reach the Yap Engine API. Check that the API is running on port 3001.";
  }
  return fallback;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useVideoStore = create<VideoStore>()(
  devtools(
    (set, get) => ({
      // ── Initial state ────────────────────────────────────────────────────────
      jobs: new Map(),
      recentEventKeys: [],
      selectedJobId: null,
      isLoading: false,
      isSubmitting: false,
      listError: null,
      submitError: null,

      // ── fetchJobs ─────────────────────────────────────────────────────────────
      fetchJobs: async () => {
        set({ isLoading: true, listError: null }, false, "video/fetchJobs/start");
        try {
          const data = await apiFetch<{ jobs: VideoJob[] }>("/api/video/jobs");
          const jobs = new Map<string, VideoJob>();
          for (const job of normalizeVideoJobs(data.jobs)) {
            jobs.set(job.id, job);
          }
          set({ jobs, isLoading: false }, false, "video/fetchJobs/done");
        } catch (err) {
          set(
            {
              isLoading: false,
              listError: sanitizeApiError(err, "Unable to load video jobs. Check that the API is running."),
            },
            false,
            "video/fetchJobs/error"
          );
        }
      },

      fetchJobDetail: async (jobId) => {
        try {
          const [job, artifacts, analysis] = await Promise.all([
            apiFetch<VideoJob>(`/api/video/jobs/${jobId}`),
            apiFetch<{ artifacts: VideoArtifacts; output: VideoJob["output"] | null }>(`/api/video/jobs/${jobId}/artifacts`),
            apiFetch<{ viralitySignal: ViralitySignal | null; captionDraft: CaptionDraft | null }>(`/api/video/jobs/${jobId}/analysis`),
          ]);

          set(
            (state) => {
              const jobs = new Map(state.jobs);
              jobs.set(jobId, normalizeVideoJob({
                ...job,
                ...(artifacts.artifacts ? { outputArtifacts: artifacts.artifacts } : {}),
                ...(job.publishHistory ? { publishHistory: job.publishHistory } : {}),
                ...(analysis.viralitySignal ? { viralitySignal: analysis.viralitySignal } : {}),
              }));
              return { jobs };
            },
            false,
            "video/fetchJobDetail",
          );
        } catch (err) {
          set(
            { listError: sanitizeApiError(err, "Unable to refresh video job details.") },
            false,
            "video/fetchJobDetail/error",
          );
        }
      },

      // ── submitJob ────────────────────────────────────────────────────────────
      submitJob: async (request) => {
        set({ isSubmitting: true, submitError: null }, false, "video/submit/start");
        try {
          const data = await apiFetch<{ jobId: string; status: string; createdAt: string }>(
            "/api/video/jobs",
            { method: "POST", body: JSON.stringify(request) }
          );

          // Seed the store with a pending job so the UI updates immediately.
          const seedJob: VideoJob = {
            id: data.jobId,
            status: "queued",
            request,
            stages: {},
            overallProgress: 0,
            retryCount: 0,
            createdAt: data.createdAt,
            updatedAt: data.createdAt,
          };
          set(
            (state) => {
              const jobs = new Map(state.jobs);
              jobs.set(data.jobId, normalizeVideoJob(seedJob));
              return { jobs, isSubmitting: false, selectedJobId: data.jobId };
            },
            false,
            "video/submit/done"
          );
          return data.jobId;
        } catch (err) {
          set(
            {
              isSubmitting: false,
              submitError: sanitizeApiError(err, "Failed to submit video job. Check that the API is running."),
            },
            false,
            "video/submit/error"
          );
          return null;
        }
      },

      // ── cancelJob ────────────────────────────────────────────────────────────
      cancelJob: async (jobId) => {
        try {
          await apiFetch(`/api/video/jobs/${jobId}/cancel`, { method: "POST" });
          // Optimistic update — SSE will confirm.
          set(
            (state) => {
              const jobs = new Map(state.jobs);
              const job = jobs.get(jobId);
              if (job) {
                jobs.set(jobId, {
                  ...job,
                  status: "cancelled",
                  updatedAt: new Date().toISOString(),
                });
              }
              return { jobs };
            },
            false,
            "video/cancel"
          );
        } catch (err) {
          set(
            { listError: sanitizeApiError(err, "Unable to cancel this video job.") },
            false,
            "video/cancel/error",
          );
        }
      },

      publishJob: async (jobId, input) => {
        try {
          const data = await apiFetch<{ result: PublishResult; job: VideoJob }>(
            `/api/video/jobs/${jobId}/publish`,
            {
              method: "POST",
              body: JSON.stringify(input),
            },
          );

          set(
            (state) => {
              const jobs = new Map(state.jobs);
              jobs.set(jobId, normalizeVideoJob(data.job));

              return { jobs };
            },
            false,
            "video/publish",
          );

          return data.result;
        } catch (err) {
          set(
            { listError: sanitizeApiError(err, "Unable to publish this video package.") },
            false,
            "video/publish/error",
          );
          return null;
        }
      },

      recordJobSseStream: (jobId) => {
        if (typeof window === "undefined") return;
        const eventSource = new EventSource(`${API_BASE}/api/video/jobs/${jobId}/sse`);
        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data) as SwarmXEvent;
            get().ingestEvent(payload);
          } catch {
            // Ignore malformed SSE chunks.
          }
        };
        eventSource.onerror = () => {
          eventSource.close();
        };
        return () => {
          eventSource.close();
        };
      },

      retryFromStage: async (jobId, stage) => {
        try {
          await apiFetch(`/api/video/jobs/${jobId}/resume`, {
            method: "POST",
            body: JSON.stringify({ fromStage: stage }),
          });
          await get().fetchJobDetail(jobId);
          return true;
        } catch (err) {
          set(
            { listError: sanitizeApiError(err, "Unable to retry this video job.") },
            false,
            "video/retryFromStage/error",
          );
          return false;
        }
      },

      reorderQueue: async (orderedIds) => {
        try {
          await apiFetch("/api/video/jobs/reprioritize", {
            method: "POST",
            body: JSON.stringify({ orderedIds }),
          });
          await get().fetchJobs();
        } catch (err) {
          set(
            { listError: sanitizeApiError(err, "Unable to reorder the queued video jobs.") },
            false,
            "video/reorderQueue/error",
          );
        }
      },

      scoreCaption: async (draft, platform) => {
        try {
          const response = await apiFetch<{ viralitySignal?: ViralitySignal }>(
            "/api/video/caption/score",
            {
              method: "POST",
              body: JSON.stringify({
                draft,
                platform,
                durationSec: 30,
              }),
            },
          );
          return response.viralitySignal ?? null;
        } catch (err) {
          set(
            { listError: sanitizeApiError(err, "Unable to rescore this caption.") },
            false,
            "video/scoreCaption/error",
          );
          return null;
        }
      },

      // ── ingestEvent ───────────────────────────────────────────────────────────
      /**
       * Route SSE events into the store.
       *
       * IMPORTANT: This is the ONLY place video events are applied to state.
       * Components must NOT have their own useEffect that listens to the SSE
       * stream and re-applies video events — that causes double-application.
       * Subscribe to this store's derived state instead.
       */
      ingestEvent: (event) => {
        if (!isApiVideoLifecycleEvent(event)) return;

        const eventKey = [
          event.type,
          event.timestamp,
          "data" in event && event.data && "jobId" in event.data ? String(event.data.jobId) : "-",
          "data" in event && event.data && "status" in event.data ? String(event.data.status) : "-",
        ].join("|");

        set(
          (state) => {
            if (state.recentEventKeys.includes(eventKey)) {
              return state;
            }

            const jobs = new Map(state.jobs);
            const recentEventKeys = [...state.recentEventKeys, eventKey].slice(-300);

            switch (event.type) {
              case "video:created": {
                // If we don't have this job yet (e.g. submitted from another tab),
                // seed a minimal record.
                if (!jobs.has(event.data.jobId)) {
                  const seed: VideoJob = {
                    id: event.data.jobId,
                    status: "queued",
                    request: { prompt: event.data.prompt },
                    stages: {},
                    overallProgress: 0,
                    retryCount: 0,
                    createdAt: event.timestamp,
                    updatedAt: event.timestamp,
                  };
                  jobs.set(seed.id, seed);
                }
                break;
              }

              case "video:queued": {
                const job = jobs.get(event.data.jobId);
                if (job) {
                  if (!isIsoTimestampNewerOrEqual(event.timestamp, job.updatedAt)) {
                    break;
                  }
                  jobs.set(job.id, {
                    ...job,
                    status: "queued",
                    updatedAt: event.timestamp,
                  });
                }
                break;
              }

              case "video:stage_started": {
                const job = jobs.get(event.data.jobId);
                if (job) {
                  if (!isIsoTimestampNewerOrEqual(event.timestamp, job.updatedAt)) {
                    break;
                  }
                  const stage = event.data.stage;
                  const stageProgress: VideoStageProgress = {
                    stage,
                    stageProgress: 0,
                    overallProgress: job.overallProgress,
                    startedAt: event.timestamp,
                    message: `${stage.replace(/_/g, " ")} started`,
                  };
                  jobs.set(job.id, {
                    ...job,
                    status: "running",
                    currentStage: stage,
                    stages: { ...job.stages, [stage]: stageProgress },
                    updatedAt: event.timestamp,
                  });
                }
                break;
              }

              case "video:progress": {
                const job = jobs.get(event.data.jobId);
                if (job) {
                  if (!isIsoTimestampNewerOrEqual(event.timestamp, job.updatedAt)) {
                    break;
                  }
                  const { stage, stageProgress, overallProgress } = event.data;
                  jobs.set(job.id, {
                    ...job,
                    status: event.data.status,
                    currentStage: stage as VideoJobStage,
                    overallProgress,
                    stages: {
                      ...job.stages,
                      [stage]: stageProgress,
                    },
                    updatedAt: event.timestamp,
                  });
                }
                break;
              }

              case "video:completed": {
                const job = jobs.get(event.data.jobId);
                if (job) {
                  if (!isIsoTimestampNewerOrEqual(event.timestamp, job.updatedAt)) {
                    break;
                  }
                  const next: VideoJob = {
                    ...job,
                    status: "completed",
                    overallProgress: 100,
                    completedAt: event.timestamp,
                    updatedAt: event.timestamp,
                    output: job.output ?? {
                      relativePath: "",
                      absolutePath: "",
                      publicUrl: event.data.outputPublicUrl,
                      fileSizeBytes: event.data.fileSizeBytes,
                      durationSeconds: event.data.durationSeconds,
                      widthPx: 720,
                      heightPx: 1280,
                      fps: 24,
                      format: "mp4",
                      checksum: "",
                      generatedAt: event.timestamp,
                      modelsUsed: event.data.modelsUsed,
                    },
                  };
                  delete next.currentStage;
                  jobs.set(job.id, next);
                }
                break;
              }

              case "video:failed": {
                const job = jobs.get(event.data.jobId);
                if (job) {
                  if (!isIsoTimestampNewerOrEqual(event.timestamp, job.updatedAt)) {
                    break;
                  }
                  const next: VideoJob = {
                    ...job,
                    status: job.retryCount < event.data.retryCount ? "queued" : "failed",
                    retryCount: event.data.retryCount,
                    ...(event.data.maxRetries !== undefined ? { maxRetries: event.data.maxRetries } : {}),
                    ...(event.data.nextRetryAt !== undefined ? { nextRetryAt: event.data.nextRetryAt } : {}),
                    ...(event.data.nextRetryDelayMs !== undefined ? { nextRetryDelayMs: event.data.nextRetryDelayMs } : {}),
                    ...(event.data.errorLog !== undefined ? { errorLog: event.data.errorLog } : {}),
                    error: event.data.error,
                    updatedAt: event.timestamp,
                  };
                  if (next.status === "failed") {
                    delete next.nextRetryAt;
                    delete next.nextRetryDelayMs;
                  }
                  delete next.currentStage;
                  jobs.set(job.id, next);
                }
                break;
              }

              case "video:cancelled": {
                const job = jobs.get(event.data.jobId);
                if (job) {
                  if (!isIsoTimestampNewerOrEqual(event.timestamp, job.updatedAt)) {
                    break;
                  }
                  const next: VideoJob = {
                    ...job,
                    status: "cancelled",
                    completedAt: event.timestamp,
                    updatedAt: event.timestamp,
                  };
                  delete next.currentStage;
                  jobs.set(job.id, next);
                }
                break;
              }

              case "video:snapshot": {
                const current = jobs.get(event.data.job.id);
                const normalized = normalizeVideoJob(event.data.job);
                if (!current || isIsoTimestampNewerOrEqual(normalized.updatedAt, current.updatedAt)) {
                  jobs.set(event.data.job.id, normalized);
                }
                break;
              }
            }

            return { jobs, recentEventKeys };
          },
          false,
          `video/sse/${event.type}`
        );
      },

      applyProgressEvent: (data) => {
        set(
          (state) => {
            const jobs = new Map(state.jobs);
            const job = jobs.get(data.jobId);
            if (!job) {
              return { jobs };
            }

            if (!isIsoTimestampNewerOrEqual(data.timestamp, job.updatedAt)) {
              return { jobs };
            }

            const nextStatus =
              data.status === "queued" || data.status === "running" || data.status === "classifying" || data.status === "scripting" || data.status === "staging" || data.status === "generating" || data.status === "interpolating" || data.status === "encoding" || data.status === "reviewing" || data.status === "publishing" || data.status === "done" || data.status === "completed" || data.status === "failed" || data.status === "cancelled"
                ? (data.status as VideoJob["status"])
                : "running";

            const next: VideoJob = {
              ...job,
              status: nextStatus,
              overallProgress: Math.max(0, Math.min(100, data.progress)),
              updatedAt: data.timestamp,
              ...(data.error !== undefined ? { error: { code: "UNKNOWN", message: data.error, retryable: false } } : {}),
              ...(isTerminalVideoStatus(nextStatus)
                ? { completedAt: data.timestamp }
                : {}),
            };

            if (!isTerminalVideoStatus(nextStatus)) {
              delete next.nextRetryAt;
              delete next.nextRetryDelayMs;
            }

            jobs.set(job.id, next);
            return { jobs };
          },
          false,
          "video/progressEvent"
        );
      },

      // ── Selection ─────────────────────────────────────────────────────────────
      selectJob: (jobId) => {
        set({ selectedJobId: jobId }, false, "video/select");
      },

      // ── Derived ───────────────────────────────────────────────────────────────
      getJob: (jobId) => get().jobs.get(jobId),
      listJobs: () =>
        [...get().jobs.values()].sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
        ),
      selectedJob: () => {
        const { selectedJobId, jobs } = get();
        return selectedJobId ? jobs.get(selectedJobId) : undefined;
      },

      // ── Reset ─────────────────────────────────────────────────────────────────
      clearErrors: () => {
        set({ listError: null, submitError: null }, false, "video/clearErrors");
      },
    }),
    { name: "VideoStore" }
  )
);
