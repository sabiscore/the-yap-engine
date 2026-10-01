"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Clock3,
  Loader2,
  PlayCircle,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VideoJobForm } from "@/components/video/VideoJobForm";
import { isActiveVideoStatus, type VideoJob } from "@/lib/video-dashboard";
import { useVideoStore } from "@/stores/video";

function statusLabel(status: VideoJob["status"]): string {
  if (status === "completed" || status === "done") return "Done";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "queued") return "Queued";
  return status.replace(/_/g, " ");
}

function statusTone(status: VideoJob["status"]): string {
  if (status === "completed" || status === "done") {
    return "border-status-success/35 bg-status-success/10 text-status-success";
  }
  if (status === "failed") {
    return "border-status-error/35 bg-status-error/10 text-status-error";
  }
  if (status === "cancelled") {
    return "border-border bg-bg-elevated text-text-muted";
  }
  if (isActiveVideoStatus(status)) {
    return "border-accent/30 bg-accent/10 text-accent";
  }
  return "border-accent-cyan/25 bg-accent-cyan/10 text-accent-cyan";
}

function JobPreview({ job }: { readonly job: VideoJob }) {
  const outputUrl = job.output?.publicUrl;

  return (
    <div className="yap-video-frame relative aspect-[9/16] overflow-hidden rounded-lg border border-border/80 bg-bg-base">
      {outputUrl ? (
        <video
          src={outputUrl}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
          aria-label="Generated video preview"
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-bg-base">
          <Clapperboard className="h-10 w-10 text-text-muted" aria-hidden="true" />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-2.5">
        <span className={cn("rounded-md border px-2 py-1 font-mono text-[9px] uppercase tracking-wider", statusTone(job.status))}>
          {statusLabel(job.status)}
        </span>
        <span className="rounded-full border border-white/10 bg-black/60 p-1.5 text-white">
          {isActiveVideoStatus(job.status) ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : job.status === "failed" ? (
            <XCircle className="h-4 w-4" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </div>

      <Link
        href={"/video/" + job.id}
        aria-label={"Open " + statusLabel(job.status) + " video job"}
        className="absolute inset-0 flex items-center justify-center"
      >
        <span className="flex min-h-14 min-w-14 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white transition-transform hover:scale-105">
          <PlayCircle className="h-8 w-8" aria-hidden="true" />
        </span>
      </Link>
    </div>
  );
}

function JobCard({ job }: { readonly job: VideoJob }) {
  const headline = job.request.prompt.trim().replace(/\s+/g, " ");
  const shortHeadline = headline.length > 88 ? headline.slice(0, 85) + "…" : headline;

  return (
    <article className="w-[78vw] max-w-[21rem] shrink-0 snap-start rounded-xl border border-border bg-bg-surface p-2.5 sm:w-[19rem]">
      <JobPreview job={job} />
      <div className="px-1 pb-1 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 font-heading text-sm font-semibold leading-5 text-text-primary">
              {shortHeadline || "Untitled Yap"}
            </h3>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-text-muted">
              {job.request.platform ?? "generic"} · {job.request.targetDurationSeconds ?? 30}s
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-text-secondary">
            {Math.round(job.overallProgress)}%
          </span>
        </div>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-bg-elevated" aria-hidden="true">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: Math.max(2, Math.min(100, job.overallProgress)) + "%" }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-text-muted">
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            {job.currentStage?.replace(/_/g, " ") ?? "pipeline"}
          </span>
          <Link
            href={"/video/" + job.id}
            className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border px-2.5 text-[10px] font-semibold text-text-secondary hover:border-border-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
          >
            Inspect
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function YapStudio() {
  const jobsMap = useVideoStore((s) => s.jobs);
  const isLoading = useVideoStore((s) => s.isLoading);
  const fetchJobs = useVideoStore((s) => s.fetchJobs);
  const selectJob = useVideoStore((s) => s.selectJob);

  const jobs = useMemo(
    () =>
      [...jobsMap.values()].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [jobsMap],
  );

  const activeJobs = jobs.filter((job) => isActiveVideoStatus(job.status));
  const queuedJobs = jobs.filter((job) => job.status === "queued");
  const completedJobs = jobs.filter(
    (job) => job.status === "completed" || job.status === "done",
  );

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  return (
    <div className="yap-surface space-y-5" id="studio">
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <span className="ai-chip">Creative Hub</span>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Yap Studio
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-text-secondary">
            Turn a high-signal brief into a low-RAM-safe short-form production job.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-md border border-border bg-bg-surface px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-text-muted">
            {activeJobs.length} active
          </span>
          <span className="rounded-md border border-border bg-bg-surface px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-text-muted">
            {queuedJobs.length} queued
          </span>
          <span className="rounded-md border border-status-success/25 bg-status-success/10 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-status-success">
            {completedJobs.length} processed
          </span>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <VideoJobForm
            onSubmitted={(jobId) => {
              selectJob(jobId);
              requestAnimationFrame(() => {
                document.getElementById("queue")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              });
            }}
          />
        </div>

        <section
          id="queue"
          className="min-w-0 rounded-xl border border-border bg-bg-surface p-4 sm:p-5"
          aria-labelledby="queue-title"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-heading text-sm font-semibold text-text-primary" id="queue-title">
                <ListVideoIcon />
                Production Queue
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Swipe through the latest jobs. Live progress arrives through the shared event stream.
              </p>
            </div>
            <Link
              href="/video"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-[10px] font-semibold text-text-secondary hover:border-border-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
            >
              Open queue
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          {isLoading && jobs.length === 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-bg-base px-3 py-6 font-mono text-[10px] text-text-muted" role="status">
              <RefreshCw className="h-4 w-4 animate-spin text-accent-cyan" aria-hidden="true" />
              Loading production jobs…
            </div>
          ) : jobs.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border bg-bg-base px-4 py-10 text-center">
              <Sparkles className="mx-auto h-7 w-7 text-text-muted" aria-hidden="true" />
              <p className="mt-3 font-heading text-sm font-semibold text-text-primary">
                Your queue is ready
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-text-muted">
                Submit a brief above and the first render will appear here with live stage progress.
              </p>
            </div>
          ) : (
            <div
              className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Horizontal video job carousel"
            >
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function ListVideoIcon() {
  return <Clapperboard className="h-4 w-4 text-accent-cyan" aria-hidden="true" />;
}
