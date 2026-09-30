import * as React from "react";
import { AlertCircle, CheckCircle2, Clock3, Loader2, PauseCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type StateBadgeState =
  | "running"
  | "ready"
  | "queued"
  | "pending_review"
  | "blocked"
  | "qc_failed"
  | "publishing"
  | "published"
  | "degraded"
  | "offline";

const STATE_CONFIG: Record<StateBadgeState, {
  label: string;
  glyph: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone: string;
}> = {
  running: { label: "Running", glyph: Loader2, tone: "text-status-active border-status-active/40" },
  ready: { label: "Ready", glyph: CheckCircle2, tone: "text-status-success border-status-success/40" },
  queued: { label: "Queued", glyph: Clock3, tone: "text-status-queued border-status-queued/40" },
  pending_review: { label: "Pending review", glyph: Clock3, tone: "text-status-warning border-status-warning/40" },
  blocked: { label: "Blocked", glyph: PauseCircle, tone: "text-status-warning border-status-warning/40" },
  qc_failed: { label: "QC failed", glyph: XCircle, tone: "text-status-error border-status-error/40" },
  publishing: { label: "Publishing", glyph: Loader2, tone: "text-status-active border-status-active/40" },
  published: { label: "Published", glyph: CheckCircle2, tone: "text-status-success border-status-success/40" },
  degraded: { label: "Degraded", glyph: AlertCircle, tone: "text-status-warning border-status-warning/40" },
  offline: { label: "Offline", glyph: XCircle, tone: "text-status-error border-status-error/40" },
};

export interface StateBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  state: StateBadgeState;
}

export function StateBadge({ state, className, ...props }: StateBadgeProps) {
  const config = STATE_CONFIG[state];
  const Glyph = config.glyph;

  return (
    <span
      className={cn(
        "nocturne-touch-target inline-flex w-fit items-center justify-center gap-1.5 rounded border px-2 text-[10px] font-mono uppercase tracking-wide",
        config.tone,
        className,
      )}
      data-state={state}
      {...props}
    >
      <Glyph className="size-3.5 shrink-0" aria-hidden />
      <span>{config.label}</span>
    </span>
  );
}

export { STATE_CONFIG };
