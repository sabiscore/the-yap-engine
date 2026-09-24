/**
 * apps/swarmx-dashboard/src/components/video/VideoJobCard.tsx
 *
 * Milestone 3: Interactive Video Pipeline UX & Queue Triage.
 * Features:
 * 1. Contextual quick actions (retry, cancel, move up/down) revealed on hover AND keyboard focus-within.
 * 2. High-contrast visual indicators for active rendering states (accent strip, border-status-active, ambient glow, subtle pulse).
 * 3. 9-stage active rendering detection (progress bar & timer active across all stages).
 * 4. Full WCAG 2.2 AAA accessibility (role="toolbar", 2px focus rings, e.stopPropagation).
 * 5. Strict adherence to cold-start ETA invariant (no hardcoded fallback values).
 */

"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Download,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useVideoStore } from "../../stores/video";
import { VideoJobTimeline } from "./VideoJobTimeline";
import {
  errorCodeNextAction,
  isTerminalVideoStatus,
  type VideoJob,
} from "../../lib/video-dashboard";
import type { ViralitySignal } from "@swarmx/types/video-types";
import { safeErrorMessage } from "@/lib/utils";
import { useApiHealth } from "@/hooks/useApiHealth";

// ─── Canonical Active Statuses ────────────────────────────────────────────────

export const ACTIVE_VIDEO_STATUSES: ReadonlySet<VideoJob["status"]> = new Set([
  "running",
  "classifying",
  "scripting",
  "staging",
  "generating",
  "interpolating",
  "encoding",
  "reviewing",
  "publishing",
]);

export function isActiveVideoStatus(status: VideoJob["status"]): boolean {
  return ACTIVE_VIDEO_STATUSES.has(status);
}

// ─── Props Contract ───────────────────────────────────────────────────────────

export interface VideoJobCardProps {
  job: VideoJob;
  onSelect?: (jobId: string) => void;
  isSelected?: boolean;
  onRetry?: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
  onDismiss?: (jobId: string) => void;
  onMoveUp?: (jobId: string) => void;
  onMoveDown?: (jobId: string) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  className?: string;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_MAP: Record<VideoJob["status"], { label: string; className: string }> = {
  queued: { label: "Queued", className: "border-status-queued/35 bg-status-queued/10 text-status-queued" },
  classifying: {
    label: "Classifying",
    className: "border-status-reload/35 bg-status-reload/10 text-status-reload animate-pulse",
  },
  scripting: {
    label: "Scripting",
    className: "border-status-throttled/35 bg-status-throttled/10 text-status-throttled animate-pulse",
  },
  staging: {
    label: "Staging",
    className: "border-status-reload/35 bg-status-reload/10 text-status-reload animate-pulse",
  },
  generating: {
    label: "Generating",
    className: "border-status-active/35 bg-status-active/10 text-status-active animate-pulse",
  },
  interpolating: {
    label: "Interpolating",
    className: "border-status-warning/35 bg-status-warning/10 text-status-warning animate-pulse",
  },
  encoding: {
    label: "Encoding",
    className: "border-status-active/35 bg-status-active/10 text-status-active animate-pulse",
  },
  reviewing: {
    label: "Reviewing",
    className: "border-status-throttled/35 bg-status-throttled/10 text-status-throttled animate-pulse",
  },
  publishing: {
    label: "Publishing",
    className: "border-status-throttled/35 bg-status-throttled/10 text-status-throttled animate-pulse",
  },
  running: {
    label: "Running",
    className: "border-status-active/35 bg-status-active/10 text-status-active animate-pulse",
  },
  done: {
    label: "Done",
    className: "border-status-success/35 bg-status-success/10 text-status-success",
  },
  completed: {
    label: "Done",
    className: "border-status-success/35 bg-status-success/10 text-status-success",
  },
  failed: { label: "Render Failed", className: "border-status-error/35 bg-status-error/10 text-status-error" },
  cancelled: {
    label: "Cancelled",
    className: "border-border bg-bg-surface text-text-muted",
  },
};

function StatusBadge({ status }: { status: VideoJob["status"] }) {
  const { label, className } = STATUS_MAP[status];
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}

// ─── Score Colour Helper ──────────────────────────────────────────────────────

function scoreColor(value: number): string {
  if (value < 0.4) return "text-status-error";
  if (value <= 0.7) return "text-status-warning";
  return "text-status-success";
}

function hookConfidenceLabel(value: number): "low" | "medium" | "high" {
  if (value < 0.4) return "low";
  if (value <= 0.7) return "medium";
  return "high";
}

function viralityBorderBg(value: number): string {
  if (value < 0.4) return "border-status-error/35 bg-status-error/10";
  if (value <= 0.7) return "border-status-warning/35 bg-status-warning/10";
  return "border-status-success/35 bg-status-success/10";
}

function ViralityBadge({ overall }: { overall: number }) {
  const bounded = Math.max(0, Math.min(1, overall));
  const rounded = Math.round(bounded * 100) / 100;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${viralityBorderBg(bounded)} ${scoreColor(bounded)}`}
      title={`Virality overall score: ${rounded.toFixed(2)}`}
      aria-label={`Virality overall score ${rounded.toFixed(2)}`}
    >
      <span className="opacity-70">viral</span>
      <span className="font-mono tabular-nums">{rounded.toFixed(2)}</span>
    </span>
  );
}

function ViralityBreakdown({ signal }: { signal: ViralitySignal }) {
  const metrics: { key: string; label: string; value: number }[] = [
    { key: "hook", label: "Hook", value: signal.hookStrength },
    { key: "compl", label: "Compl", value: signal.completionProxy },
    { key: "share", label: "Share", value: signal.shareability },
    { key: "seo", label: "SEO", value: signal.seoScore },
  ];
  return (
    <div
      className="grid grid-cols-4 gap-1 rounded border border-border/60 bg-bg-input/40 px-2 py-1.5"
      aria-label="Virality component scores"
    >
      {metrics.map(({ key, label, value }) => (
        <div key={key} className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] font-mono uppercase tracking-wide text-text-muted">{label}</span>
          <span className={`text-xs font-mono tabular-nums ${scoreColor(value)}`}>{value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function CertTierBadge({ tier }: { tier: string }) {
  const label = tier.replace(/_/g, " ");
  const cls =
    tier === "PRODUCTION_PACK_VALID" || tier === "READY_TO_POST" || tier === "PUBLISHED_VERIFIED"
      ? "border-status-success/35 bg-status-success/10 text-status-success"
      : tier === "TECHNICALLY_VALID"
        ? "border-status-warning/35 bg-status-warning/10 text-status-warning"
        : tier === "PUBLISHING"
          ? "border-status-throttled/35 bg-status-throttled/10 text-status-throttled"
          : "border-border bg-bg-surface text-text-muted";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
      title={`Certification tier: ${label}`}
      aria-label={`Certification tier: ${label}`}
    >
      {label}
    </span>
  );
}

function PlatformTag({ platform }: { platform?: string }) {
  if (!platform || platform === "generic") return null;
  const labels: Record<string, string> = {
    tiktok: "TikTok",
    youtube_shorts: "YT Shorts",
    reels: "Reels",
  };
  return (
    <span className="font-mono text-[10px] font-medium uppercase tracking-wide text-text-muted">
      {labels[platform] ?? platform}
    </span>
  );
}

function PublishSummary({ job }: { job: VideoJob }) {
  const history = job.publishHistory ?? job.outputArtifacts?.publishHistory ?? [];
  if (history.length === 0) return null;

  const latest = history[0];
  if (!latest) return null;

  const labelMap: Record<string, string> = {
    pending_review: "Pending review",
    scheduled: "Scheduled",
    published: "Published",
    failed: "Publish failed",
  };

  return (
    <div className="rounded border border-status-throttled/35 bg-status-throttled/10 px-2.5 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wide text-status-throttled">Publish</span>
        <span className="text-[10px] font-medium text-text-muted">{history.length} event{history.length === 1 ? "" : "s"}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-text-primary">{labelMap[latest.status] ?? latest.status}</span>
        <span className="font-mono uppercase tracking-wide text-text-muted">{latest.platform}</span>
      </div>
    </div>
  );
}

// ─── Main Card Component ──────────────────────────────────────────────────────

export function VideoJobCard({
  job,
  onSelect,
  isSelected,
  onRetry,
  onCancel,
  onDismiss,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  className = "",
}: VideoJobCardProps) {
  const cancelJob = useVideoStore((s) => s.cancelJob);
  const dismissJob = useVideoStore((s) => s.dismissJob);
  const retryFromStage = useVideoStore((s) => s.retryFromStage);
  const router = useRouter();

  const maxRetries = job.maxRetries ?? 3;
  const retryExhausted = job.status === "failed" && job.retryCount >= maxRetries;
  const isActive = isActiveVideoStatus(job.status);
  const canCancel = job.status === "queued" || isActive;
  const isComplete = job.status === "completed" || job.status === "done";
  const isQueued = job.status === "queued";
  const isFailed = job.status === "failed";

  const promptSnippet = job.request.prompt.trim()
    ? job.request.prompt.trim().slice(0, 48)
    : `Job ${job.id.slice(0, 8)}`;

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCancel) {
      onCancel(job.id);
    } else {
      void cancelJob(job.id);
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDismiss) {
      onDismiss(job.id);
    } else {
      void dismissJob(job.id);
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRetry) {
      onRetry(job.id);
    } else {
      void retryFromStage(job.id, "failed");
    }
  };

  const handleMoveUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canMoveUp) {
      onMoveUp?.(job.id);
    }
  };

  const handleMoveDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canMoveDown) {
      onMoveDown?.(job.id);
    }
  };

  // Pure elapsed time tracking across all 9 active stages
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive || !job.startedAt) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActive, job.startedAt]);

  const elapsed = job.startedAt
    ? Math.max(0, Math.round((nowMs - Date.parse(job.startedAt)) / 1000))
    : null;
  const statusAnnouncement = buildStatusAnnouncement(job);

  const { warmup } = useApiHealth();
  const healthEtaSecs = warmup?.coldStartEtaSecs ?? null;
  const coldStartRemainingSecs: number | null = warmup?.done
    ? 0
    : healthEtaSecs !== null
      ? Math.max(0, healthEtaSecs)
      : null;
  const coldStartHint = healthEtaSecs !== null
    ? `~${Math.max(healthEtaSecs, 30)}s`
    : "unknown";

  return (
    <article
      data-job-id={job.id}
      data-status={job.status}
      data-active={isActive ? "true" : undefined}
      className={`
        group relative rounded-lg border transition-all duration-200 overflow-hidden
        ${isActive
          ? "border-status-active/40 bg-bg-elevated/95 shadow-[0_0_16px_rgba(19,217,141,0.08)] ring-1 ring-status-active/20 motion-safe:animate-[pulse_4s_cubic-bezier(0.4,0,0.6,1)_infinite]"
          : isSelected
            ? "border-border-accent ring-1 ring-accent/25 bg-bg-elevated"
            : isFailed
              ? "border-status-error/30 bg-bg-elevated/80 hover:border-status-error/50"
              : "border-border bg-bg-elevated/80 hover:border-border-active hover:bg-bg-elevated"
        }
        ${isSelected && isActive ? "border-status-active ring-1 ring-status-active/50 shadow-[0_0_20px_rgba(19,217,141,0.18)]" : ""}
        ${className}
      `}
    >
      {/* High-contrast status accent strip */}
      {isActive && (
        <div
          className="absolute inset-y-0 left-0 w-1 bg-status-active shadow-[0_0_8px_var(--color-status-active)]"
          aria-hidden="true"
        />
      )}
      {isFailed && (
        <div
          className="absolute inset-y-0 left-0 w-1 bg-status-error shadow-[0_0_6px_var(--color-status-error)]"
          aria-hidden="true"
        />
      )}

      {statusAnnouncement && (
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {statusAnnouncement}
        </p>
      )}

      {/* Primary Card Button (W3C card pattern: primary action first) */}
      <button
        type="button"
        aria-label={`Open video job: ${promptSnippet}`}
        className="
          flex w-full cursor-pointer flex-col gap-3 rounded-lg p-4 pr-28 text-left
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
        "
        onClick={() => onSelect?.(job.id)}
      >
        {/* Header Badges & Prompt */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={job.status} />
              <PlatformTag {...(job.request.platform !== undefined ? { platform: job.request.platform } : {})} />
              {job.request.niche && (
                <span className="text-[10px] font-medium text-text-muted">
                  #{job.request.niche}
                </span>
              )}
              {job.viralitySignal && typeof job.viralitySignal.overall === "number" && (
                <ViralityBadge overall={job.viralitySignal.overall} />
              )}
              {job.output?.certificationTier && (
                <CertTierBadge tier={job.output.certificationTier} />
              )}
              {retryExhausted && (
                <span
                  className="inline-flex items-center gap-1 rounded border border-status-warning/35 bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-warning"
                  title="Retry budget exhausted; move to dead-letter triage"
                  aria-label="Retry budget exhausted"
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  dead letter
                </span>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-text-primary">
              {job.request.prompt}
            </p>
          </div>
        </div>

        {/* Pre-render hook confidence signal */}
        {job.preliminaryHookScore !== undefined && job.viralitySignal == null && (
          <div
            className="rounded border border-status-throttled/35 bg-status-throttled/8 px-2.5 py-1.5"
            role="status"
            aria-live="polite"
            aria-label={`Pre-render hook confidence ${Math.round(Math.max(0, Math.min(1, job.preliminaryHookScore)) * 100)} percent`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wide text-text-muted">pre-render signal</span>
              <span className={`text-[11px] font-semibold uppercase tracking-wide ${scoreColor(job.preliminaryHookScore)}`}>
                {hookConfidenceLabel(job.preliminaryHookScore)} confidence
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border/70" aria-hidden="true">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  job.preliminaryHookScore < 0.4
                    ? "bg-status-error"
                    : job.preliminaryHookScore <= 0.7
                      ? "bg-status-warning"
                      : "bg-status-success"
                }`}
                style={{ width: `${Math.round(Math.max(0, Math.min(1, job.preliminaryHookScore)) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-text-muted">
              Hook {Math.round(Math.max(0, Math.min(1, job.preliminaryHookScore)) * 100)}% — review before full render spend.
            </p>
          </div>
        )}

        {/* Progress bar — visible across ALL active rendering stages */}
        {isActive && job.overallProgress != null && job.overallProgress > 0 && (
          <div
            className="relative h-1 w-full overflow-hidden rounded-full bg-border/60"
            role="progressbar"
            aria-valuenow={job.overallProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall pipeline progress"
          >
            <div
              className="h-full rounded-full bg-status-active transition-[width] duration-700 ease-out"
              style={{ width: `${job.overallProgress}%` }}
            />
          </div>
        )}

        {/* Stage Timeline */}
        <VideoJobTimeline job={job} compact />

        {/* Failed stage recovery hint */}
        {job.status === "failed" && job.error?.code && (
          <p className="rounded border border-status-error/25 bg-status-error/8 px-2.5 py-1.5 text-[10px] leading-4 text-text-secondary">
            <span className="font-mono uppercase tracking-wide text-status-error">Next</span>{" "}
            {errorCodeNextAction(job.error.code)}
          </p>
        )}

        <PublishSummary job={job} />

        {/* Certification blockers */}
        {job.output?.certificationBlockers && job.output.certificationBlockers.length > 0 && (
          <div
            className="rounded border border-status-warning/30 bg-status-warning/10 px-2.5 py-1.5"
            role="status"
            aria-label={`${job.output.certificationBlockers.length} certification blocker${job.output.certificationBlockers.length === 1 ? "" : "s"}`}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-status-warning">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              <span>Cert blockers · {job.output.certificationBlockers.length}</span>
            </div>
            <ul className="mt-1 space-y-0.5 pl-4 text-[10px] text-text-secondary">
              {job.output.certificationBlockers.slice(0, 3).map((blocker, i) => (
                <li key={i} className="list-disc marker:text-status-warning/60">
                  {blocker}
                </li>
              ))}
              {job.output.certificationBlockers.length > 3 && (
                <li className="list-none pl-0 font-mono text-text-muted">
                  +{job.output.certificationBlockers.length - 3} more
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Virality Breakdown */}
        {isComplete && job.viralitySignal && (
          <ViralityBreakdown signal={job.viralitySignal} />
        )}

        {/* Script Quality Warnings */}
        {job.scriptQualityWarnings && job.scriptQualityWarnings.length > 0 && (
          <div
            className="rounded border border-status-warning/30 bg-status-warning/10 px-2.5 py-1.5"
            role="status"
            aria-label={`${job.scriptQualityWarnings.length} script quality warning${job.scriptQualityWarnings.length === 1 ? "" : "s"}`}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-status-warning">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              <span>Script quality · {job.scriptQualityWarnings.length} warning{job.scriptQualityWarnings.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="mt-1 space-y-0.5 pl-4 text-[10px] text-text-secondary">
              {job.scriptQualityWarnings.slice(0, 3).map((w, i) => (
                <li key={`${w.code}-${i}`} className="list-disc marker:text-status-warning/60">
                  {w.message}
                </li>
              ))}
              {job.scriptQualityWarnings.length > 3 && (
                <li className="list-none pl-0 font-mono text-text-muted">
                  +{job.scriptQualityWarnings.length - 3} more
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Retry History */}
        {retryExhausted && job.errorLog && job.errorLog.length > 0 && (
          <div
            className="rounded border border-status-error/35 bg-status-error/10 px-2.5 py-1.5"
            role="status"
            aria-label="Retry history"
          >
            <p className="text-[10px] font-mono uppercase tracking-wide text-status-error">retry history</p>
            <ul className="mt-1 space-y-0.5 text-[10px] text-text-secondary">
              {job.errorLog.slice(-3).reverse().map((entry, index) => (
                <li key={`${entry.code}-${index}`} className="font-mono">
                  {entry.code}: {safeErrorMessage(entry.message, "See operator trace for details.")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cold-start hint (invariants strictly preserved) */}
        {elapsed != null && elapsed > 30 &&
          (job.status === "classifying" || job.status === "running") && (
            <p
              className="rounded border border-status-warning/30 bg-status-warning/8 px-2.5 py-1.5 text-[10px] leading-4 text-status-warning"
              role="status"
              aria-live="polite"
            >
              Loading Model — health ETA {coldStartHint}.{" "}
              {coldStartRemainingSecs !== null && coldStartRemainingSecs > 0
                ? <>~<span className="font-mono tabular-nums">{coldStartRemainingSecs}s</span> remaining. Wait; do not cancel.</>
                : coldStartRemainingSecs === 0
                  ? <>Warmup reported ready — first inference should complete shortly.</>
                  : <>ETA unavailable from system health — wait; do not cancel during cold load.</>}
            </p>
          )}

        {/* Footer Metadata */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-text-muted">
          <span title="Job ID" className="max-w-[8rem] truncate">
            {job.id.slice(0, 8)}…
          </span>
          {job.retryCount > 0 && (
            <span className="text-status-warning">retry {job.retryCount}/{maxRetries}</span>
          )}
          {job.nextRetryAt && job.status === "queued" && (
            <span className="text-status-warning/80">
              next {new Date(job.nextRetryAt).toLocaleTimeString()}
            </span>
          )}
          {elapsed != null && isActive && (
            <span className="ml-auto text-status-active">{elapsed}s elapsed</span>
          )}
          {job.completedAt && (
            <span className="ml-auto">
              {new Date(job.completedAt).toLocaleTimeString()}
            </span>
          )}
          {job.output && (
            <span>
              {(job.output.fileSizeBytes / 1024 / 1024).toFixed(1)} MB ·{" "}
              {job.output.durationSeconds.toFixed(0)}s
            </span>
          )}
        </div>

        {/* Action Row for Failed or Dead-Letter Jobs */}
        {isFailed && (
          <div
            className="mt-1 flex items-center gap-2 pt-2 border-t border-border/50"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-1.5 rounded border border-status-warning/40 bg-status-warning/10 px-2.5 py-1 text-xs font-medium text-status-warning hover:bg-status-warning/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-warning transition-colors"
              aria-label={`Retry failed job: ${promptSnippet}`}
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Retry from Failed Stage
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="flex items-center gap-1.5 rounded border border-border bg-bg-surface px-2.5 py-1 text-xs text-text-muted hover:border-status-error/40 hover:bg-status-error/10 hover:text-status-error focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-error transition-colors"
              aria-label={`Dismiss failed job: ${promptSnippet}`}
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Dismiss
            </button>
          </div>
        )}
      </button>

      {/* Contextual Quick Actions Toolbar */}
      <div
        role="toolbar"
        aria-label={`Quick actions for ${promptSnippet}`}
        className="
          absolute right-2.5 top-2.5 z-10 flex items-center gap-1 rounded-md
          border border-border/80 bg-bg-surface/90 p-0.5 shadow-sm backdrop-blur-sm
          opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100
          transition-opacity duration-150 ease-out
          pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto focus-within:pointer-events-auto
        "
      >
        {/* Move Up (Queue) */}
        {isQueued && onMoveUp !== undefined && (
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={handleMoveUp}
            className="
              rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary
              disabled:opacity-30 disabled:pointer-events-none transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
            "
            title="Move up in queue"
            aria-label={`Move up in queue: ${promptSnippet}`}
          >
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}

        {/* Move Down (Queue) */}
        {isQueued && onMoveDown !== undefined && (
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={handleMoveDown}
            className="
              rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary
              disabled:opacity-30 disabled:pointer-events-none transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
            "
            title="Move down in queue"
            aria-label={`Move down in queue: ${promptSnippet}`}
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}

        {/* Quick Retry (Failed) */}
        {isFailed && (
          <button
            type="button"
            onClick={handleRetry}
            className="
              rounded p-1 text-status-warning hover:bg-status-warning/15 hover:text-status-warning
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-warning
            "
            title="Retry from failed stage"
            aria-label={`Retry from failed stage: ${promptSnippet}`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}

        {/* View Error Details (Failed) */}
        {isFailed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/video/${job.id}`);
            }}
            className="
              rounded p-1 text-text-muted hover:bg-status-error/10 hover:text-status-error
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-error
            "
            title="View error and retry options"
            aria-label={`View error and retry options for: ${promptSnippet}`}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}

        {/* Download Output (Completed) */}
        {isComplete && job.output?.publicUrl && (
          <a
            href={job.output.publicUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="
              rounded p-1 text-text-muted hover:bg-status-success/10 hover:text-status-success
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-success
            "
            title="Download video"
            aria-label={`Download video: ${promptSnippet}`}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}

        {/* Cancel (Queued or Active) */}
        {canCancel && (
          <button
            type="button"
            onClick={handleCancel}
            className="
              rounded p-1 text-text-muted hover:bg-status-error/10 hover:text-status-error
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-error
            "
            title="Cancel job"
            aria-label={`Cancel job: ${promptSnippet}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}

        {/* Dismiss / Remove (Terminal states: failed, cancelled, completed, done) */}
        {(isFailed || job.status === "cancelled" || isComplete) && (
          <button
            type="button"
            onClick={handleDismiss}
            className="
              rounded p-1 text-text-muted hover:bg-status-error/10 hover:text-status-error
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-error
            "
            title="Dismiss job from queue"
            aria-label={`Dismiss job from queue: ${promptSnippet}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}

function buildStatusAnnouncement(job: VideoJob): string | null {
  if (!isTerminalVideoStatus(job.status)) {
    return null;
  }

  const prompt = job.request.prompt.trim();
  const subject = prompt.length > 72 ? `${prompt.slice(0, 69)}...` : prompt;

  if (job.status === "completed" || job.status === "done") {
    return `Video job completed: ${subject}`;
  }

  if (job.status === "failed") {
    const code = job.error?.code ? ` [${job.error.code}]` : "";
    const detail = job.error ? safeErrorMessage(job.error.message, "") : "";
    return `Video job failed: ${subject}${code}${detail ? `. ${detail}` : ""}`;
  }

  if (job.status === "cancelled") {
    return `Video job cancelled: ${subject}`;
  }

  return null;
}
