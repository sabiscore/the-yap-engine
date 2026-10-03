"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Clapperboard, Play, Sparkles } from "lucide-react";
import type { VideoJob } from "@/lib/video-dashboard";
import { isActiveVideoStatus } from "@/lib/video-dashboard";

export interface YapStudioProps {
  readonly form: ReactNode;
  readonly jobs: VideoJob[];
  readonly visibleJobs: VideoJob[];
  readonly renderJob: (job: VideoJob) => ReactNode;
  readonly queueControls?: ReactNode;
  readonly runtimeStatus?: ReactNode;
  readonly isLoading?: boolean;
  readonly listError?: string | null;
  readonly loadingState?: ReactNode;
  readonly emptyState?: ReactNode;
  readonly showHeader?: boolean;
}

export function YapStudio({
  form,
  jobs,
  visibleJobs,
  renderJob,
  queueControls,
  runtimeStatus,
  isLoading = false,
  listError = null,
  loadingState,
  emptyState,
  showHeader = true,
}: YapStudioProps) {
  const activeCount = jobs.filter((job) => isActiveVideoStatus(job.status)).length;
  const queuedCount = jobs.filter((job) => job.status === "queued").length;
  const processedCount = jobs.filter(
    (job) => job.status === "completed" || job.status === "done",
  ).length;

  return (
    <section className="flex min-h-0 flex-col gap-4" aria-label="Yap Studio workspace">
      {showHeader && (
        <header className="rounded-xl border border-border bg-bg-surface p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-accent bg-[var(--color-accent-dim)] text-accent">
                  <Clapperboard className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">
                    Creative workspace
                  </p>
                  <h1 className="font-heading text-lg font-semibold tracking-tight text-text-primary">
                    Yap Studio
                  </h1>
                </div>
              </div>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-text-secondary">
                Turn a high-signal brief into a production-ready short while the queue and runtime stay visible.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:flex">
              <StudioStat label="Active" value={String(activeCount)} />
              <StudioStat label="Queued" value={String(queuedCount)} />
              <StudioStat label="Processed" value={String(processedCount)} />
            </div>
          </div>
        </header>
      )}

      <div className="space-y-5">
        <section className="min-w-0 rounded-xl border border-border bg-bg-surface p-3 sm:p-4" aria-label="New video job">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-accent" aria-hidden="true" />
            <div>
              <h2 className="font-heading text-sm font-semibold text-text-primary">New Video Job</h2>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                Touch-ready brief intake
              </p>
            </div>
          </div>
          {form}
        </section>

        <section
          className="min-w-0 rounded-xl border border-border bg-bg-surface p-3 sm:p-4"
          aria-label="Video job gallery"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-heading text-sm font-semibold text-text-primary">Yap Gallery</h2>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                Swipe horizontally to review jobs
              </p>
            </div>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-muted">
              {visibleJobs.length}/{jobs.length}
            </span>
          </div>

          {runtimeStatus && <div className="mt-3">{runtimeStatus}</div>}
          {queueControls && <div className="mt-3">{queueControls}</div>}

          {isLoading && (
            <div
              className="mt-3 grid grid-flow-col auto-cols-[minmax(82vw,320px)] gap-3 overflow-x-auto pb-2 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:auto-cols-[320px] md:auto-cols-[340px]"
              aria-busy="true"
              aria-label="Loading video jobs"
            >
              {loadingState ?? (
                <>
                  <div className="h-40 rounded-lg border border-border bg-bg-elevated" />
                  <div className="h-40 rounded-lg border border-border bg-bg-elevated" />
                </>
              )}
            </div>
          )}

          {!isLoading && listError && (
            <div
              className="mt-3 rounded-lg border border-status-error/25 bg-status-error/[0.05] px-3 py-2.5 text-xs text-status-error"
              role="alert"
            >
              {listError}
            </div>
          )}

          {!isLoading && !listError && visibleJobs.length === 0 && (
            emptyState ?? (
              <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <p className="text-sm font-medium text-text-secondary">No video jobs yet</p>
                <p className="mt-1 text-xs text-text-muted">
                  Create a brief above to start the production queue.
                </p>
              </div>
            )
          )}

          {!isLoading && visibleJobs.length > 0 && (
            <div
              className="mt-3 grid grid-flow-col auto-cols-[minmax(82vw,320px)] gap-3 overflow-x-auto overscroll-x-contain pb-3 pr-2 snap-x snap-mandatory [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden sm:auto-cols-[320px] md:auto-cols-[340px]"
              role="list"
              aria-label="Scrollable video job gallery"
            >
              {visibleJobs.map((job) => (
                <article
                  key={job.id}
                  className="relative min-w-0 snap-start overflow-hidden rounded-xl border border-border bg-bg-elevated/70"
                  role="listitem"
                >
                  <div className="pointer-events-none absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg-base/90 text-[color:var(--color-accent-cyan)]" aria-hidden="true">
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </div>
                  {renderJob(job)}
                </article>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center justify-end gap-1 font-mono text-[9px] uppercase tracking-wide text-text-muted">
            <CheckCircle2 className="size-3 text-status-success" aria-hidden="true" />
            Touch carousel enabled
          </div>
        </section>
      </div>
    </section>
  );
}

function StudioStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-bg-elevated/70 px-3 py-2 text-center">
      <p className="font-mono text-[9px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-text-primary" data-metric>
        {value}
      </p>
    </div>
  );
}
