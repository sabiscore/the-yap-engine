/**
 * apps/swarmx-dashboard/src/app/(dashboard)/video/page.tsx
 *
 * VIDEO-ALPHA r1 — Upgraded video workspace.
 *
 * Changes from r0:
 *  - Integrated ViralityMeter, CaptionEditor, PlatformPublishPanel
 *  - Skeleton loading states replace spinners in the job list
 *  - Pure-CSS confetti burst on job completion (1.5s, no deps)
 *  - Retry affordance for failed jobs
 *  - Operator trace table in detail panel
 *
 * NOTE: FIX applies from original file still hold:
 *  - No redundant useEffect that re-applies SSE events (store handles it)
 *  - Sub-components at module scope, never nested inside VideoPage
 */

"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clapperboard,
  Filter,
  GripVertical,
  ListVideo,
  RotateCcw,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiHealth } from "@/hooks/useApiHealth";
import { getRuntimeGuidance, type RuntimeGuidance } from "@/lib/runtime-guidance";
import { formatSubmissionBlockReason } from "@/lib/video-runtime-messaging";
import { useEventsStore } from "@/stores/events";
import { useVideoStore } from "../../../stores/video";
import { VideoJobForm } from "../../../components/video/VideoJobForm";
import { VideoJobCard } from "../../../components/video/VideoJobCard";
import type { VideoJob } from "../../../lib/video-dashboard";

// ─── Skeleton loading row ─────────────────────────────────────────────────────

function JobSkeleton() {
  return (
    <div className="rounded border border-border bg-bg-elevated/60 p-4" role="status" aria-live="polite" aria-label="Loading video jobs">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-4 w-14 rounded bg-bg-input" />
        <div className="h-4 w-10 rounded bg-bg-input" />
      </div>
      <div className="mb-1 h-3 w-4/5 rounded bg-bg-input" />
      <div className="mb-3 h-3 w-3/5 rounded bg-bg-input" />
      <div className="h-1 w-full rounded bg-bg-input" />
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyJobList({ onShowPresets }: { onShowPresets: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded border border-dashed border-border bg-bg-surface/50 px-4 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded border border-border bg-bg-elevated">
        <ListVideo className="h-7 w-7 text-text-muted" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-text-secondary">No Yaps yet</p>
      <p className="max-w-72 text-xs leading-5 text-text-muted">
        Start with a brief above. Your Yap appears here immediately and updates live as production moves through each stage.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onShowPresets}>
        <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />
        Make your first Yap
      </Button>
    </div>
  );
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-bg-elevated px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-text-muted">
      <span className="text-text-primary tabular-nums">{value}</span>
      {label}
    </span>
  );
}

function VideoRuntimeBanner({
  guidance,
}: {
  guidance: RuntimeGuidance | null;
}) {
  if (!guidance) {
    return null;
  }

  const Icon = guidance.tone === "critical" ? WifiOff : AlertTriangle;
  const toneClasses =
    guidance.tone === "critical"
      ? {
          container: "border-status-error/35 bg-status-error/10",
          iconShell: "border-status-error/35 bg-status-error/12",
          icon: "text-status-error",
          title: "text-status-error",
        }
      : {
          container: "border-status-warning/35 bg-status-warning/10",
          iconShell: "border-status-warning/35 bg-status-warning/12",
          icon: "text-status-warning",
          title: "text-status-warning",
        };

  return (
    <div
      className={`flex items-start gap-3 rounded border px-3 py-3 ${toneClasses.container}`}
      role={guidance.tone === "critical" ? "alert" : "status"}
      aria-live={guidance.tone === "critical" ? "assertive" : "polite"}
    >
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border ${toneClasses.iconShell}`}
      >
        <Icon className={`h-4 w-4 ${toneClasses.icon}`} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className={`text-xs font-semibold ${toneClasses.title}`}>{guidance.title}</p>
        <p className="mt-1 text-xs leading-5 text-text-secondary">{guidance.detail}</p>
        <p className="mt-1 text-xs leading-5 text-text-muted">{guidance.recoveryHint}</p>
      </div>
    </div>
  );
}

// ─── Live queue pulse ─────────────────────────────────────────────────────────
function LiveQueuePulse({ jobs }: { jobs: VideoJob[] }) {
  const active = jobs.find((job) =>
    ["running", "classifying", "scripting", "staging", "generating", "interpolating", "encoding", "reviewing", "publishing"].includes(job.status),
  );
  if (!active) return null;
  const stageLabel = active.currentStage
    ? active.currentStage.replace(/_/g, " ")
    : active.status;
  return (
    <div
      className="hidden min-w-0 items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1.5 text-[10px] text-text-secondary sm:flex"
      role="status"
      aria-live="polite"
    >
      <span className="status-dot" data-status="running" aria-hidden="true" />
      <span className="truncate">
        Making <span className="font-medium text-text-primary">{active.request.prompt.slice(0, 42)}</span>
        <span className="text-text-muted"> · {stageLabel} · {active.overallProgress}%</span>
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VideoPage() {
  const router = useRouter();
  const governorState = useEventsStore((s) => s.governorState);
  const startupSummary = useEventsStore((s) => s.startupSummary);
  const systemMetrics = useEventsStore((s) => s.systemMetrics);
  const apiHealth = useApiHealth();
  const { fetchJobs, listJobs, isLoading, listError, selectedJobId, reorderQueue, retryFromStage } =
    useVideoStore();
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [showFailedOnly, setShowFailedOnly] = useState(false);
  const [showDeadLetterOnly, setShowDeadLetterOnly] = useState(false);
  const [presetFocusSignal, setPresetFocusSignal] = useState(0);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const handleSubmitted = useCallback(
    (jobId: string) => { router.push(`/video/${jobId}`); },
    [router],
  );

  const jobs = listJobs();
  const deadLetterJobs = jobs.filter(
    (job) =>
      job.status === "failed" &&
      job.maxRetries !== undefined &&
      job.retryCount >= job.maxRetries,
  );
  const visibleJobs = showDeadLetterOnly
    ? deadLetterJobs
    : showFailedOnly
      ? jobs.filter((j) => j.status === "failed")
      : jobs;
  const hasJobs = jobs.length > 0;
  const runningCount = jobs.filter((j) => j.status === "running").length;
  const queuedCount = jobs.filter((j) => j.status === "queued").length;
  const doneCount = jobs.filter((j) => j.status === "completed").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;
  const deadLetterCount = deadLetterJobs.length;
  const queuedJobIds = jobs.filter((job) => job.status === "queued").map((job) => job.id);
  const pressureLevel = governorState?.pressureLevel ?? startupSummary?.pressureLevel;
  const availableMb = governorState?.availableMb ?? startupSummary?.availableMb ?? null;
  const ollamaOnline = apiHealth.ollamaOnline ?? startupSummary?.ollamaReachable ?? null;
  const runtimeWarnings = [...apiHealth.warnings, ...(apiHealth.runtimeProfile?.warnings ?? [])];
  const videoRuntimeGuidance = getRuntimeGuidance({
    apiOnline: apiHealth.apiOnline,
    ollamaOnline,
    pressureLevel,
    availableMb,
    healthStatus: apiHealth.apiStatus,
    modelReadiness: apiHealth.models,
    runtimeAvailableMb: apiHealth.runtimeProfile?.availableRamMb ?? null,
    runtimeBlockers: apiHealth.runtimeProfile?.blockers ?? [],
    runtimeWarnings,
    voiceBenchmarkRecommendedProviderId: apiHealth.voiceBenchmarkRecommendedProviderId,
    voiceFallbackWarning: apiHealth.voiceFallbackWarning,
    cpuLoad: systemMetrics?.cpu.load1m ?? null,
    cpuCoreCount: systemMetrics?.cpu.coreCount ?? null,
  });

  const handleRetry = useCallback(
    async (jobId: string) => {
      await retryFromStage(jobId, "failed");
    },
    [retryFromStage],
  );

  const handleDropOn = useCallback(
    async (targetJobId: string) => {
      if (!draggedJobId || draggedJobId === targetJobId) {
        setDraggedJobId(null);
        return;
      }

      // [V5.9-FIX-11] Read queued jobs inside the callback via store accessor
      // instead of closing over the `queuedJobs` snapshot. This avoids a
      // mutable-dependency warning from React Compiler that caused the callback
      // memoization to be skipped entirely.
      const currentQueued = useVideoStore
        .getState()
        .listJobs()
        .filter((j) => j.status === "queued");

      const fromIndex = currentQueued.findIndex((job) => job.id === draggedJobId);
      const toIndex = currentQueued.findIndex((job) => job.id === targetJobId);
      if (fromIndex < 0 || toIndex < 0) {
        setDraggedJobId(null);
        return;
      }

      const ordered = [...currentQueued];
      const [moved] = ordered.splice(fromIndex, 1);
      if (!moved) {
        setDraggedJobId(null);
        return;
      }

      ordered.splice(toIndex, 0, moved);
      await reorderQueue(ordered.map((job) => job.id));
      setDraggedJobId(null);
    },
    [draggedJobId, reorderQueue],
  );

  const handleMoveQueuedJob = useCallback(
    async (jobId: string, direction: "up" | "down") => {
      const currentQueued = useVideoStore
        .getState()
        .listJobs()
        .filter((job) => job.status === "queued");
      const fromIndex = currentQueued.findIndex((job) => job.id === jobId);
      const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;

      if (fromIndex < 0 || toIndex < 0 || toIndex >= currentQueued.length) {
        return;
      }

      const ordered = [...currentQueued];
      const [moved] = ordered.splice(fromIndex, 1);
      if (!moved) return;

      ordered.splice(toIndex, 0, moved);
      await reorderQueue(ordered.map((job) => job.id));
    },
    [reorderQueue],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border bg-bg-surface/80 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Clapperboard className="h-5 w-5 text-accent" aria-hidden="true" />
              <h1 className="text-base font-semibold tracking-tight text-text-primary">
                Yap Studio
              </h1>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-text-secondary">
              Build, watch, review, and ship short-form content from one low-RAM-safe production workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LiveQueuePulse jobs={jobs} />
            <QueueMetric label="running" value={runningCount} />
            <QueueMetric label="queued" value={queuedCount} />
            <QueueMetric label="done" value={doneCount} />
            {failedCount > 0 && <QueueMetric label="failed" value={failedCount} />}
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(360px,540px)_1fr]">
        <section className="flex min-h-0 flex-col gap-4 overflow-y-auto border-b border-border p-4 sm:p-5 xl:border-b-0 xl:border-r">
          <VideoJobForm
            onSubmitted={handleSubmitted}
            submissionBlocked={videoRuntimeGuidance?.blocksSubmission ?? false}
            submissionBlockReason={formatSubmissionBlockReason(videoRuntimeGuidance)}
            presetFocusSignal={presetFocusSignal}
          />

          <VideoRuntimeBanner guidance={videoRuntimeGuidance} />

          <div className="flex flex-col gap-2" aria-busy={isLoading}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                <GripVertical className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                Queue
              </div>
              <div className="flex items-center gap-2">
                {failedCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant={showFailedOnly && !showDeadLetterOnly ? "default" : "outline"}
                    onClick={() => {
                      setShowDeadLetterOnly(false);
                      setShowFailedOnly((s) => !s);
                    }}
                    aria-pressed={showFailedOnly && !showDeadLetterOnly}
                    aria-label={showFailedOnly && !showDeadLetterOnly ? "Show all jobs" : "Show failed jobs only"}
                  >
                    <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                    {showFailedOnly && !showDeadLetterOnly ? "All Jobs" : `Failed (${failedCount})`}
                  </Button>
                )}
                {deadLetterCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant={showDeadLetterOnly ? "default" : "outline"}
                    onClick={() => {
                      setShowFailedOnly(false);
                      setShowDeadLetterOnly((s) => !s);
                    }}
                    aria-pressed={showDeadLetterOnly}
                    aria-label={showDeadLetterOnly ? "Show all jobs" : "Show retry-exhausted jobs only"}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    {showDeadLetterOnly ? "All Jobs" : `Dead Letter (${deadLetterCount})`}
                  </Button>
                )}
                {queuedCount > 1 && !showFailedOnly && (
                  <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
                    Drag or use move controls to reorder
                  </span>
                )}
              </div>
            </div>

            {isLoading && (
              <>
                <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                  Loading video jobs…
                </p>
                <JobSkeleton />
                <JobSkeleton />
                <JobSkeleton />
              </>
            )}

            {listError && (
              <div className="rounded border border-status-error/35 bg-status-error/10 px-3 py-2" role="alert">
                <p className="text-xs text-status-error">{listError}</p>
              </div>
            )}

            {!isLoading && !hasJobs && <EmptyJobList onShowPresets={() => setPresetFocusSignal((value) => value + 1)} />}

            {!isLoading && hasJobs && showFailedOnly && failedCount === 0 && !showDeadLetterOnly && (
              <div className="rounded border border-dashed border-border bg-bg-surface/60 px-4 py-8 text-center text-xs text-text-muted">
                No failed jobs right now.
              </div>
            )}

            {!isLoading && hasJobs && showDeadLetterOnly && deadLetterCount === 0 && (
              <div className="rounded border border-dashed border-border bg-bg-surface/60 px-4 py-8 text-center text-xs text-text-muted">
                No retry-exhausted jobs right now.
              </div>
            )}

            {!isLoading && deadLetterCount > 0 && !showDeadLetterOnly && (
              <div className="rounded border border-status-warning/35 bg-status-warning/10 px-3 py-2.5" role="status" aria-live="polite">
                <p className="text-xs text-status-warning">
                  {deadLetterCount} retry-exhausted job{deadLetterCount === 1 ? "" : "s"} in dead-letter triage.
                </p>
              </div>
            )}

            {!isLoading && failedCount > 0 && !showFailedOnly && !showDeadLetterOnly && (
              <div className="rounded border border-status-error/35 bg-status-error/10 px-3 py-2.5" role="status" aria-live="polite">
                <p className="text-xs text-status-error">
                  {failedCount} failed job{failedCount === 1 ? "" : "s"} detected. Use the Failed filter for focused triage.
                </p>
              </div>
            )}

            {hasJobs && visibleJobs.length > 0 && (
              <div className="flex flex-col gap-2" role="list" aria-label="Video job queue">
                {visibleJobs.map((job) => {
                  const queuedIndex = queuedJobIds.indexOf(job.id);
                  const canMoveQueued = job.status === "queued" && queuedCount > 1;

                  return (
                    <div
                      key={job.id}
                      role="listitem"
                      draggable={job.status === "queued"}
                      onDragStart={() => setDraggedJobId(job.id)}
                      onDragOver={(event) => {
                        if (job.status === "queued") {
                          event.preventDefault();
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (job.status === "queued") {
                          void handleDropOn(job.id);
                        }
                      }}
                      aria-label={
                        job.status === "queued"
                          ? `Queued video job: ${job.request.prompt.slice(0, 40)}`
                          : undefined
                      }
                      className={job.status === "queued" ? "cursor-grab" : ""}
                    >
                      <VideoJobCard
                        job={job}
                        onSelect={(jobId) => router.push(`/video/${jobId}`)}
                        isSelected={selectedJobId === job.id}
                      />
                      {canMoveQueued && (
                        <div className="mt-2 grid grid-cols-2 gap-2" aria-label="Queue reorder controls">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={queuedIndex <= 0}
                            aria-label={`Move queued job up: ${job.request.prompt.slice(0, 50)}`}
                            onClick={() => void handleMoveQueuedJob(job.id, "up")}
                          >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            Move Up
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={queuedIndex < 0 || queuedIndex >= queuedJobIds.length - 1}
                            aria-label={`Move queued job down: ${job.request.prompt.slice(0, 50)}`}
                            onClick={() => void handleMoveQueuedJob(job.id, "down")}
                          >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                            Move Down
                          </Button>
                        </div>
                      )}
                      {job.status === "failed" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`Retry failed job: ${job.request.prompt.slice(0, 50)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRetry(job.id);
                          }}
                          className="mt-2 w-full border-status-warning/35 bg-status-warning/8 text-status-warning hover:bg-status-warning/15"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          Retry from Failed Stage
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="hidden min-h-0 items-center justify-center px-8 text-center xl:flex">
          <div className="max-w-md space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded border border-border bg-bg-elevated">
              <Clapperboard className="h-7 w-7 text-text-muted" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-text-secondary">Select a Yap to inspect it</p>
            <p className="text-xs leading-5 text-text-muted">
              Inspect the preview, creative signal, captions, quality gates, and publishing state without leaving the production flow.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
