"use client";

import { useEffect, useMemo, useState } from "react";
import { Clapperboard, ExternalLink, Play, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { VideoJobForm } from "@/components/video/VideoJobForm";
import { VideoJobCard } from "@/components/video/VideoJobCard";
import { useApiHealth } from "@/hooks/useApiHealth";
import { getRuntimeGuidance } from "@/lib/runtime-guidance";
import { formatSubmissionBlockReason } from "@/lib/video-runtime-messaging";
import { isActiveVideoStatus, type VideoJob } from "@/lib/video-dashboard";
import { useVideoStore } from "@/stores/video";
import { useEventsStore } from "@/stores/events";
import { cn } from "@/lib/utils";

type ViewFilter = "all" | "active" | "queued" | "history";

function isHistory(job: VideoJob): boolean {
  return job.status === "completed" || job.status === "done" || job.status === "cancelled";
}

export function YapStudio() {
  const router = useRouter();
  const apiHealth = useApiHealth();
  const governorState = useEventsStore((state) => state.governorState);
  const startupSummary = useEventsStore((state) => state.startupSummary);
  const {
    jobs,
    selectedJobId,
    isLoading,
    listError,
    fetchJobs,
    selectJob,
    retryFromStage,
    cancelJob,
    dismissJob,
  } = useVideoStore();

  const [filter, setFilter] = useState<ViewFilter>("all");

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const allJobs = useMemo(() => [...jobs.values()].sort((a, b) => {
    const aTime = new Date(a.updatedAt).getTime() || 0;
    const bTime = new Date(b.updatedAt).getTime() || 0;
    return bTime - aTime;
  }), [jobs]);

  const filteredJobs = useMemo(() => {
    switch (filter) {
      case "active":
        return allJobs.filter((job) => isActiveVideoStatus(job.status));
      case "queued":
        return allJobs.filter((job) => job.status === "queued");
      case "history":
        return allJobs.filter(isHistory);
      default:
        return allJobs;
    }
  }, [allJobs, filter]);

  const activeJob = selectedJobId ? jobs.get(selectedJobId) : allJobs[0];

  const pressureLevel = governorState?.pressureLevel ?? startupSummary?.pressureLevel;
  const availableMb = governorState?.availableMb ?? startupSummary?.availableMb ?? null;
  const ollamaOnline = apiHealth.ollamaOnline ?? startupSummary?.ollamaReachable ?? null;
  const runtimeGuidance = getRuntimeGuidance({
    apiOnline: apiHealth.apiOnline,
    ollamaOnline,
    pressureLevel,
    availableMb,
    healthStatus: apiHealth.apiStatus,
    modelReadiness: apiHealth.models,
    runtimeAvailableMb: apiHealth.runtimeProfile?.availableRamMb ?? null,
    runtimeBlockers: apiHealth.runtimeProfile?.blockers ?? [],
    runtimeWarnings: [...apiHealth.warnings, ...(apiHealth.runtimeProfile?.warnings ?? [])],
    voiceBenchmarkRecommendedProviderId: apiHealth.voiceBenchmarkRecommendedProviderId,
  });

  const counts = {
    all: allJobs.length,
    active: allJobs.filter((job) => isActiveVideoStatus(job.status)).length,
    queued: allJobs.filter((job) => job.status === "queued").length,
    history: allJobs.filter(isHistory).length,
  };

  return (
    <div className="yap-surface flex min-h-full flex-col">
      <div className="border-b border-border px-3 py-4 sm:px-5">
        <div className="mx-auto flex max-w-[1600px] items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded border border-border-accent bg-[var(--color-accent-dim)] text-accent">
                <Clapperboard className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">Creative Hub</p>
                <h1 className="font-heading text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">Yap Studio</h1>
              </div>
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-text-secondary">
              Prompt → plan → voice → render. A low-RAM-safe workspace for short-form production.
            </p>
          </div>
          <span className="hidden shrink-0 rounded border border-border bg-bg-surface px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-text-muted sm:inline-flex">
            Horizontal studio
          </span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-3 pb-24 sm:p-5 sm:pb-8">
        <section aria-label="New video job">
          <VideoJobForm
            onSubmitted={(jobId) => selectJob(jobId)}
            submissionBlocked={runtimeGuidance?.blocksSubmission ?? false}
            submissionBlockReason={formatSubmissionBlockReason(runtimeGuidance)}
          />
        </section>

        <section id="queue" aria-labelledby="studio-queue-title" className="scroll-mt-20">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">Production queue</p>
              <h2 id="studio-queue-title" className="mt-1 text-base font-semibold text-text-primary">
                Your Yaps
              </h2>
            </div>
            <span className="font-mono text-[10px] text-text-muted">
              {counts.all} total · {counts.active} active
            </span>
          </div>

          <div className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-5 sm:px-5" role="tablist" aria-label="Video filters">
            {([
              ["all", "All"],
              ["active", "Active"],
              ["queued", "Queued"],
              ["history", "History"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "min-h-11 shrink-0 rounded border px-3 text-[10px] font-mono uppercase tracking-wide",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  filter === value
                    ? "border-border-accent bg-[var(--color-accent-dim)] text-accent"
                    : "border-border bg-bg-surface text-text-muted hover:text-text-primary",
                )}
              >
                {label} <span className="ml-1 tabular-nums">{counts[value]}</span>
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="mt-3 flex gap-3 overflow-hidden" role="status" aria-label="Loading video jobs">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-64 min-w-[82vw] animate-pulse rounded border border-border bg-bg-surface sm:min-w-[22rem]" />
              ))}
            </div>
          ) : listError ? (
            <div className="mt-3 rounded border border-status-error/30 bg-status-error/6 px-3 py-3 text-xs text-status-error" role="alert">
              {listError}
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="mt-3 rounded border border-dashed border-border bg-bg-surface/60 px-4 py-12 text-center">
              <Clapperboard className="mx-auto h-8 w-8 text-text-muted" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-text-primary">No Yaps in this view</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-text-muted">
                Start with the brief above. New jobs appear here as soon as the API accepts them.
              </p>
            </div>
          ) : (
            <div
              className="-mx-3 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3 sm:-mx-5 sm:px-5"
              role="list"
              aria-label="Horizontally scrollable video gallery"
            >
              {filteredJobs.map((job) => (
                <article
                  key={job.id}
                  role="listitem"
                  className={cn(
                    "relative min-w-[82vw] snap-start sm:min-w-[24rem] lg:min-w-[28rem]",
                    "rounded-xl border border-border bg-bg-surface/65 p-2",
                    selectedJobId === job.id && "border-border-accent",
                  )}
                >
                  <div className="pointer-events-none absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg-base/90 text-accent-cyan">
                    <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true" />
                  </div>
                  <VideoJobCard
                    job={job}
                    onSelect={(jobId) => selectJob(jobId)}
                    isSelected={selectedJobId === job.id}
                    onRetry={(jobId) => void retryFromStage(jobId, job.currentStage ?? "scripting")}
                    onCancel={(jobId) => void cancelJob(jobId)}
                    onDismiss={(jobId) => void dismissJob(jobId)}
                    canMoveUp={false}
                    canMoveDown={false}
                  />
                </article>
              ))}
            </div>
          )}
        </section>

        {activeJob ? (
          <section
            className="grid gap-3 rounded border border-border bg-bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-4"
            aria-label="Selected studio output"
          >
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">Selected output</p>
              <h2 className="mt-1 truncate text-sm font-semibold text-text-primary">
                {activeJob.request.prompt}
              </h2>
              <p className="mt-1 font-mono text-[10px] text-text-muted">
                {activeJob.status} · {activeJob.overallProgress}% · {activeJob.request.platform ?? "generic"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => router.push(`/video/${activeJob.id}`)}
                className="inline-flex min-h-11 items-center gap-2 rounded border border-border bg-bg-elevated px-3 text-xs font-medium text-text-primary hover:border-border-active"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Inspect
              </button>
              {activeJob.output?.publicUrl ? (
                <a
                  href={activeJob.output.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded border border-border bg-bg-elevated px-3 text-xs font-medium text-text-primary hover:border-border-active"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Preview
                </a>
              ) : null}
              {isActiveVideoStatus(activeJob.status) ? (
                <button
                  type="button"
                  onClick={() => void cancelJob(activeJob.id)}
                  className="inline-flex min-h-11 items-center gap-2 rounded border border-status-error/30 px-3 text-xs font-medium text-status-error hover:bg-status-error/6"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Cancel
                </button>
              ) : activeJob.status === "failed" ? (
                <button
                  type="button"
                  onClick={() => void retryFromStage(activeJob.id, activeJob.currentStage ?? "scripting")}
                  className="inline-flex min-h-11 items-center gap-2 rounded border border-status-warning/30 px-3 text-xs font-medium text-status-warning hover:bg-status-warning/6"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Retry
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
