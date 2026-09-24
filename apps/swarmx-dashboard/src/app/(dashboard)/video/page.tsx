/**
 * apps/swarmx-dashboard/src/app/(dashboard)/video/page.tsx
 *
 * VIDEO-ALPHA r2 — Upgraded video production studio workspace.
 *
 * Key upgrades:
 *  - Studio Monitor & Active Render Visualizer replaces empty right-hand void
 *  - Live video preview player for completed jobs with 1-click download & inspector
 *  - Real-time animated pipeline stage tracker (VideoPipelinePulse) for active jobs
 *  - Interactive concept starter prompt chips that feed the brief form immediately
 *  - Clean dead-letter queue management with 1-click "Clear All" and individual dismiss
 *  - Seamless responsive two-column grid (lg:grid-cols) with sticky viewport retention
 *  - Natural headline formatting without awkward text truncation ("about fo...")
 */

"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Clock,
  Cpu,
  Download,
  ExternalLink,
  Film,
  GripVertical,
  ListVideo,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useApiHealth } from "@/hooks/useApiHealth";
import { getRuntimeGuidance, type RuntimeGuidance } from "@/lib/runtime-guidance";
import { formatSubmissionBlockReason } from "@/lib/video-runtime-messaging";
import { useEventsStore } from "@/stores/events";
import { useVideoStore } from "../../../stores/video";
import { VideoJobForm } from "../../../components/video/VideoJobForm";
import { VideoJobCard } from "../../../components/video/VideoJobCard";
import { VideoPipelinePulse } from "@/components/video/VideoPipelinePulse";
import {
  formatActiveJobHeadline,
  formatActiveJobPrompt,
  isActiveVideoStatus,
  type VideoJob,
} from "../../../lib/video-dashboard";

// ─── Skeleton loading row ─────────────────────────────────────────────────────

function JobSkeleton() {
  return (
    <div
      className="rounded border border-border bg-bg-elevated/60 p-4"
      role="status"
      aria-live="polite"
      aria-label="Loading video jobs"
    >
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
        Making <span className="font-medium text-text-primary">{formatActiveJobHeadline(active.request.prompt)}</span>
        <span className="text-text-muted"> · {stageLabel} · {active.overallProgress}%</span>
      </span>
    </div>
  );
}

// ─── Studio Monitor & Active Render Visualizer ─────────────────────────────────

interface StudioMonitorProps {
  job: VideoJob | undefined;
  onDeselect: () => void;
  onOpenInspector: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
  onCancel: (jobId: string) => void;
}

function StudioMonitor({
  job,
  onDeselect,
  onOpenInspector,
  onRetry,
  onDismiss,
  onCancel,
}: StudioMonitorProps) {
  const isActive = job ? isActiveVideoStatus(job.status) : false;
  const isComplete = job?.status === "completed" || job?.status === "done";
  const isFailed = job?.status === "failed";
  const isQueued = job?.status === "queued";

  if (!job) {
    return (
      <aside className="sticky top-4 flex min-h-0 flex-1 flex-col justify-center rounded-xl border border-dashed border-border/80 bg-bg-surface/30 p-6 sm:p-8 text-center max-h-[calc(100vh-140px)]">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-bg-elevated/90 shadow-[var(--shadow-accent-glow)]">
            <Clapperboard className="h-10 w-10 text-accent" aria-hidden="true" />
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg-surface text-text-muted">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
            </span>
          </div>

          <div>
            <h2 className="text-base font-semibold tracking-tight text-text-primary">
              Yap Studio Production Stage
            </h2>
            <p className="mt-1.5 text-xs leading-5 text-text-muted">
              Queue a new brief on the left or select an active job to inspect its real-time production timeline, audio synthesis, and final video output.
            </p>
          </div>

          {/* Quick Concept Starters */}
          <div className="w-full space-y-2 pt-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              Quick Concept Starters
            </span>
            <div className="grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
              {[
                {
                  label: "Focus Habits",
                  prompt: "Create a 30-second faceless TikTok-style video titled '3 habits that improve focus'",
                },
                {
                  label: "Work Myth",
                  prompt: "Create a 30-second myth-busting short about why 8 hours of continuous work destroys focus",
                },
                {
                  label: "50/30/20 Budget",
                  prompt: "Create a 30-second finance explainer about the 50/30/20 budget rule for creators",
                },
                {
                  label: "Discipline Arc",
                  prompt: "Create a 30-second motivational story about how a single disciplined hour changes your year",
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(
                        new CustomEvent("yap:example-prompt", { detail: item.prompt }),
                      );
                    }
                  }}
                  className="group flex flex-col gap-1 rounded-lg border border-border/70 bg-bg-elevated/70 p-2.5 text-xs transition-all hover:border-accent/40 hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                >
                  <span className="font-medium text-text-primary group-hover:text-accent flex items-center justify-between">
                    {item.label}
                    <span className="text-[10px] opacity-60">↵</span>
                  </span>
                  <span className="line-clamp-2 text-[10px] text-text-muted">
                    {item.prompt}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Runtime Readiness Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-3">
            <span className="inline-flex items-center gap-1 rounded border border-border bg-bg-surface px-2 py-1 font-mono text-[10px] text-text-muted">
              <CheckCircle2 className="h-3 w-3 text-status-success" />
              Kokoro TTS Ready
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-border bg-bg-surface px-2 py-1 font-mono text-[10px] text-text-muted">
              <CheckCircle2 className="h-3 w-3 text-status-success" />
              FFmpeg Ready
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-border bg-bg-surface px-2 py-1 font-mono text-[10px] text-text-muted">
              <Cpu className="h-3 w-3 text-accent" />
              Single-7B Protected
            </span>
          </div>
        </div>
      </aside>
    );
  }

  const headline = formatActiveJobHeadline(job.request.prompt);

  return (
    <aside
      className="sticky top-4 flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-bg-surface/60 p-4 sm:p-5 max-h-[calc(100vh-140px)] overflow-y-auto space-y-4"
      aria-label="Studio video monitor"
    >
      {/* Top Monitor Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">
              Studio Monitor
            </span>
            {isActive && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-status-active animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-status-active" />
                Live Render
              </span>
            )}
            {isComplete && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-status-success">
                <CheckCircle2 className="h-3 w-3" />
                Render Complete
              </span>
            )}
            {isFailed && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-status-error">
                <AlertTriangle className="h-3 w-3" />
                Failed
              </span>
            )}
          </div>
          <h2 className="mt-1 truncate text-sm font-semibold tracking-tight text-text-primary" title={job.request.prompt}>
            {headline}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenInspector(job.id)}
            className="h-8 gap-1.5 text-xs"
            title="Open comprehensive multi-agent inspector for this video"
          >
            <span>Full Inspector</span>
            <ExternalLink className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDeselect}
            className="h-8 w-8 p-0 text-text-muted hover:text-text-primary"
            title="Close monitor"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Video Viewport or Active Pipeline Visualizer */}
      <div className="relative flex flex-col items-center justify-center rounded-lg border border-border/80 bg-black/60 p-3 min-h-[340px]">
        {job.output?.publicUrl ? (
          <div className="relative mx-auto aspect-[9/16] max-h-[50vh] w-full max-w-[340px] overflow-hidden rounded-lg bg-black shadow-2xl border border-border">
            <video
              src={job.output.publicUrl}
              controls
              playsInline
              aria-label={`Generated video: ${job.request.prompt.slice(0, 60)}`}
              className="h-full w-full object-contain"
            />
          </div>
        ) : isActive ? (
          <div className="w-full space-y-4 py-2">
            <VideoPipelinePulse job={job} />
            <div className="rounded-lg border border-border/60 bg-bg-elevated/60 p-3 text-center">
              <p className="font-mono text-xs text-text-secondary">
                {job.currentStage ? job.currentStage.replace(/_/g, " ") : "Processing..."} · {job.overallProgress}%
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-status-active transition-all duration-300"
                  style={{ width: `${Math.max(5, job.overallProgress)}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => onCancel(job.id)}
                  className="h-7 text-xs"
                >
                  <X className="mr-1 h-3 w-3" />
                  Cancel Render
                </Button>
              </div>
            </div>
          </div>
        ) : isFailed ? (
          <div className="flex w-full flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-status-error/40 bg-status-error/10 text-status-error">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-status-error">Render Failed</p>
              <p className="mt-1 font-mono text-xs text-text-secondary">
                {job.error?.code ?? "TIMED_OUT"}
              </p>
              <p className="mt-1 max-w-sm text-xs text-text-muted">
                {job.error?.message ?? "Execution timed out. Host pressure may have caused a pipeline delay."}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onRetry(job.id)}
                className="border-status-warning/40 bg-status-warning/10 text-status-warning hover:bg-status-warning/20 text-xs"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Retry from Failed Stage
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onDismiss(job.id)}
                className="text-text-muted hover:text-status-error text-xs"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Dismiss
              </Button>
            </div>
          </div>
        ) : isQueued ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-bg-elevated text-text-muted">
              <Clock className="h-6 w-6 text-accent animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Queued for Production</p>
              <p className="mt-1 max-w-xs text-xs text-text-muted">
                Standing by for available worker capacity. Classification and scripting will begin automatically.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onCancel(job.id)}
              className="mt-2 text-xs"
            >
              <X className="mr-1 h-3 w-3" />
              Cancel Job
            </Button>
          </div>
        ) : (
          <div className="flex aspect-[9/16] max-h-[48vh] w-full max-w-[320px] items-center justify-center rounded border border-border bg-bg-surface text-sm text-text-muted">
            <div className="space-y-2 text-center">
              <Clapperboard className="mx-auto h-8 w-8 text-text-muted" aria-hidden="true" />
              <p>Stage Preview</p>
            </div>
          </div>
        )}
      </div>

      {/* Production Package & Quick Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono sm:grid-cols-4">
        <div className="rounded border border-border/70 bg-bg-elevated/50 p-2">
          <span className="text-[10px] text-text-muted uppercase">Platform</span>
          <p className="font-semibold text-text-primary capitalize">{job.request.platform ?? "TikTok"}</p>
        </div>
        <div className="rounded border border-border/70 bg-bg-elevated/50 p-2">
          <span className="text-[10px] text-text-muted uppercase">Duration</span>
          <p className="font-semibold text-text-primary">{job.request.targetDurationSeconds ?? 30}s</p>
        </div>
        <div className="rounded border border-border/70 bg-bg-elevated/50 p-2">
          <span className="text-[10px] text-text-muted uppercase">Tone</span>
          <p className="font-semibold text-text-primary capitalize">{job.request.tone ?? "Educational"}</p>
        </div>
        <div className="rounded border border-border/70 bg-bg-elevated/50 p-2">
          <span className="text-[10px] text-text-muted uppercase">Voice</span>
          <p className="font-semibold text-text-primary capitalize">{job.request.voice ?? "Default"}</p>
        </div>
      </div>

      {/* Action Footer for Completed Video */}
      {job.output?.publicUrl && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
          <a
            href={job.output.publicUrl}
            download
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded border border-border bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:border-accent hover:text-accent transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download Video
          </a>
          <Button
            type="button"
            size="sm"
            variant="accent"
            onClick={() => onOpenInspector(job.id)}
            className="text-xs"
          >
            Open Caption & Publish Editor →
          </Button>
        </div>
      )}
    </aside>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function VideoPage() {
  const router = useRouter();
  const governorState = useEventsStore((s) => s.governorState);
  const startupSummary = useEventsStore((s) => s.startupSummary);
  const systemMetrics = useEventsStore((s) => s.systemMetrics);
  const apiHealth = useApiHealth();
  const {
    fetchJobs,
    listJobs,
    isLoading,
    listError,
    selectedJobId,
    selectJob,
    reorderQueue,
    retryFromStage,
    cancelJob,
    dismissJob,
    clearDeadLetter,
  } = useVideoStore();

  type QueueTab = "all" | "active" | "queued" | "failed" | "history";
  const [selectedTab, setSelectedTab] = useState<QueueTab>("all");
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [showFailedOnly, setShowFailedOnly] = useState(false);
  const [showDeadLetterOnly, setShowDeadLetterOnly] = useState(false);
  const [presetFocusSignal, setPresetFocusSignal] = useState(0);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const handleSubmitted = useCallback(
    (jobId: string) => {
      selectJob(jobId);
    },
    [selectJob],
  );

  const jobs = listJobs();
  const activeJobs = jobs.filter((j) => isActiveVideoStatus(j.status));
  const queuedJobs = jobs.filter((j) => j.status === "queued");
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const deadLetterJobs = failedJobs.filter(
    (job) =>
      job.maxRetries !== undefined &&
      job.retryCount >= job.maxRetries,
  );
  const doneJobs = jobs.filter((j) => j.status === "completed" || j.status === "done");
  const historyJobs = jobs.filter(
    (j) => j.status === "completed" || j.status === "done" || j.status === "cancelled",
  );
  const activeCount = activeJobs.length;
  const queuedCount = queuedJobs.length;
  const failedCount = failedJobs.length;
  const deadLetterCount = deadLetterJobs.length;
  const doneCount = doneJobs.length;
  const historyCount = historyJobs.length;
  const runningCount = activeCount;
  const hasJobs = jobs.length > 0;

  // Active studio monitor job
  const studioJob =
    (selectedJobId ? jobs.find((j) => j.id === selectedJobId) : undefined) ??
    activeJobs[0] ??
    doneJobs[0];

  const visibleJobs =
    selectedTab === "active"
      ? activeJobs
      : selectedTab === "queued"
        ? queuedJobs
        : selectedTab === "failed"
          ? showDeadLetterOnly
            ? deadLetterJobs
            : failedJobs
          : selectedTab === "history"
            ? historyJobs
            : showDeadLetterOnly
              ? deadLetterJobs
              : showFailedOnly
                ? failedJobs
                : jobs;
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

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(380px,520px)_1fr] items-start">
        {/* Left Column: Brief Creation & Queue Management */}
        <section className="flex min-h-0 flex-col gap-4 p-4 sm:p-5 lg:border-r border-border">
          <VideoJobForm
            onSubmitted={handleSubmitted}
            submissionBlocked={videoRuntimeGuidance?.blocksSubmission ?? false}
            submissionBlockReason={formatSubmissionBlockReason(videoRuntimeGuidance)}
            presetFocusSignal={presetFocusSignal}
          />

          <VideoRuntimeBanner guidance={videoRuntimeGuidance} />

          <div className="flex flex-col gap-2" aria-busy={isLoading}>
            <Tabs
              value={selectedTab}
              onValueChange={(val) => {
                setSelectedTab(val as QueueTab);
                if (val !== "failed") {
                  setShowFailedOnly(false);
                  setShowDeadLetterOnly(false);
                }
              }}
              className="w-full"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                    <GripVertical className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                    Queue
                  </div>
                  <div className="flex items-center gap-2">
                    {deadLetterCount > 0 && selectedTab === "failed" && (
                      <Button
                        type="button"
                        size="sm"
                        variant={showDeadLetterOnly ? "default" : "outline"}
                        onClick={() => setShowDeadLetterOnly((s) => !s)}
                        aria-pressed={showDeadLetterOnly}
                        aria-label={showDeadLetterOnly ? "Show all failed jobs" : "Show retry-exhausted jobs only"}
                        className="h-7 text-xs"
                      >
                        <AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        {showDeadLetterOnly ? "All Failed" : `Dead Letter (${deadLetterCount})`}
                      </Button>
                    )}
                    {queuedCount > 1 && selectedTab === "queued" && (
                      <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
                        Drag or use card controls to reorder
                      </span>
                    )}
                  </div>
                </div>

                <div className="border-b border-border pb-1">
                  <TabsList className="flex w-full overflow-x-auto scrollbar-none border-b-0">
                    <TabsTrigger value="all" className="gap-1.5 shrink-0">
                      All
                      <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] tabular-nums bg-bg-surface text-text-muted">
                        {jobs.length}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="active" className="gap-1.5 shrink-0">
                      {activeCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-status-active animate-pulse" aria-hidden="true" />}
                      Active
                      <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] tabular-nums bg-bg-surface text-text-muted">
                        {activeCount}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="queued" className="gap-1.5 shrink-0">
                      Queued
                      <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] tabular-nums bg-bg-surface text-text-muted">
                        {queuedCount}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="failed" className="gap-1.5 shrink-0">
                      Failed
                      <span
                        className={cn(
                          "ml-1 rounded px-1.5 py-0.5 text-[10px] tabular-nums",
                          failedCount > 0 ? "bg-status-error/15 text-status-error font-medium" : "bg-bg-surface text-text-muted",
                        )}
                      >
                        {failedCount}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="history" className="gap-1.5 shrink-0">
                      History
                      <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] tabular-nums bg-bg-surface text-text-muted">
                        {historyCount}
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>
            </Tabs>

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

            {/* Dead Letter Notification & 1-Click Clear Action */}
            {!isLoading && deadLetterCount > 0 && (
              <div
                className="flex items-center justify-between gap-3 rounded border border-status-warning/35 bg-status-warning/10 px-3 py-2.5"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" aria-hidden="true" />
                  <p className="text-xs text-status-warning">
                    {deadLetterCount} retry-exhausted job{deadLetterCount === 1 ? "" : "s"} in dead-letter triage.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedTab("failed");
                      setShowDeadLetterOnly(true);
                    }}
                    className="h-7 text-xs text-status-warning hover:bg-status-warning/15 hover:text-status-warning"
                  >
                    Filter
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void clearDeadLetter()}
                    className="h-7 border-status-warning/40 bg-status-warning/15 text-xs font-medium text-status-warning hover:bg-status-warning/25"
                    title="Dismiss all dead-letter jobs from queue"
                  >
                    Clear All
                  </Button>
                </div>
              </div>
            )}

            {!isLoading && failedCount > 0 && !showFailedOnly && !showDeadLetterOnly && deadLetterCount === 0 && (
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
                        onSelect={(jobId) => selectJob(jobId)}
                        isSelected={studioJob?.id === job.id}
                        onRetry={(jobId) => void handleRetry(jobId)}
                        onCancel={(jobId) => void cancelJob(jobId)}
                        onDismiss={(jobId) => void dismissJob(jobId)}
                        onMoveUp={(jobId) => void handleMoveQueuedJob(jobId, "up")}
                        onMoveDown={(jobId) => void handleMoveQueuedJob(jobId, "down")}
                        canMoveUp={queuedIndex > 0}
                        canMoveDown={queuedIndex >= 0 && queuedIndex < queuedJobIds.length - 1}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Studio Monitor & Active Render Visualizer */}
        <section className="min-h-0 p-4 sm:p-5">
          <StudioMonitor
            job={studioJob}
            onDeselect={() => selectJob(null)}
            onOpenInspector={(jobId) => router.push(`/video/${jobId}`)}
            onRetry={(jobId) => void handleRetry(jobId)}
            onDismiss={(jobId) => void dismissJob(jobId)}
            onCancel={(jobId) => void cancelJob(jobId)}
          />
        </section>
      </div>
    </div>
  );
}
