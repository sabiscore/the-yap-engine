"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  CircleDot,
  Film,
  Mic2,
  PenLine,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import {
  VIDEO_JOB_STAGE_LABELS,
  VIDEO_JOB_STAGE_ORDER,
  type VideoJob,
  type VideoJobStage,
} from "@/lib/video-dashboard";
import { cn } from "@/lib/utils";

const STAGE_ICONS: Record<VideoJobStage, typeof Sparkles> = {
  intent_classification: Sparkles,
  planning: WandSparkles,
  scripting: PenLine,
  storyboard_generation: Film,
  render_assembly: Film,
  finalizing: Mic2,
};

function currentStageIndex(job: VideoJob): number {
  if (!job.currentStage) return -1;
  return VIDEO_JOB_STAGE_ORDER.indexOf(job.currentStage);
}

function elapsedLabel(job: VideoJob): string {
  const start = Date.parse(job.startedAt ?? job.createdAt);
  if (Number.isNaN(start)) return "starting";
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  if (seconds < 60) return `${seconds}s active`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s active`;
}

export function VideoPipelinePulse({ job }: { job: VideoJob }) {
  const reduceMotion = useReducedMotion();
  const activeIndex = currentStageIndex(job);
  const terminal = job.status === "completed" || job.status === "failed" || job.status === "cancelled";

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border bg-bg-elevated/75"
      aria-label="Live production pipeline"
      aria-live="polite"
    >
      <div className="relative overflow-hidden border-b border-border px-4 py-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgb(19_217_141_/_10%),transparent_42%),radial-gradient(circle_at_90%_30%,rgb(73_168_255_/_7%),transparent_40%)]" />
        <div className="relative flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">Live production</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={job.currentStage ?? job.status}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
                className="mt-1 text-sm font-semibold text-text-primary"
              >
                {terminal
                  ? job.status === "completed"
                    ? "Your short is ready."
                    : job.status === "failed"
                      ? "Production needs attention."
                      : "Production was cancelled."
                  : job.currentStage
                    ? VIDEO_JOB_STAGE_LABELS[job.currentStage]
                    : "Preparing your creative brief"}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-semibold tabular-nums text-text-primary">{job.overallProgress}%</p>
            <p className="text-[10px] text-text-muted">{elapsedLabel(job)}</p>
          </div>
        </div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-bg-input" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.overallProgress}>
          <motion.div
            className="h-full origin-left rounded-full bg-accent"
            animate={{ scaleX: Math.max(0.01, job.overallProgress / 100) }}
            transition={reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 230, damping: 28, mass: 0.5 }}
          />
        </div>
      </div>

      <ol className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
        {VIDEO_JOB_STAGE_ORDER.map((stage, index) => {
          const StageIcon = STAGE_ICONS[stage];
          const stageData = job.stages[stage];
          const done = stageData?.stageProgress === 100 || (activeIndex > index && !stageData);
          const active = activeIndex === index;
          return (
            <li
              key={stage}
              className={cn(
                "relative rounded-xl border px-3 py-3 transition-colors",
                done
                  ? "border-status-success/25 bg-status-success/6"
                  : active
                    ? "border-accent/35 bg-accent/7"
                    : "border-border/70 bg-bg-surface/45",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex size-6 items-center justify-center rounded-lg bg-bg-base text-text-muted">
                  {done ? <Check className="size-3.5 text-status-success" aria-hidden="true" /> : active ? <CircleDot className="size-3.5 text-accent" aria-hidden="true" /> : <StageIcon className="size-3.5" aria-hidden="true" />}
                </span>
                <span className="font-mono text-[9px] tabular-nums text-text-muted">
                  {done ? "done" : active ? `${stageData?.stageProgress ?? 0}%` : "—"}
                </span>
              </div>
              <p className={cn("mt-2 text-[10px] leading-4", active ? "font-semibold text-text-primary" : "text-text-muted")}>
                {VIDEO_JOB_STAGE_LABELS[stage]}
              </p>
              {active && stageData?.message && (
                <p className="mt-1 truncate text-[9px] text-text-secondary">{stageData.message}</p>
              )}
              {active && (
                <motion.div
                  className="absolute inset-x-3 bottom-1 h-px origin-left bg-accent"
                  animate={{ scaleX: [0.25, 1, 0.25] }}
                  transition={reduceMotion
                    ? { duration: 0 }
                    : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
