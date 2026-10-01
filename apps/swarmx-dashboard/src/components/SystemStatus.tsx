"use client";

import { useMemo } from "react";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Gauge,
  ListChecks,
  type LucideIcon,
  Server,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiHealth } from "@/hooks/useApiHealth";
import { useEventsStore } from "@/stores/events";
import { useVideoStore } from "@/stores/video";

function formatAge(timestamp: number | null): string {
  if (!timestamp) return "awaiting telemetry";
  const age = Math.max(0, Date.now() - timestamp);
  if (age < 1000) return "just now";
  if (age < 60_000) return `${Math.round(age / 1000)}s ago`;
  return `${Math.round(age / 60_000)}m ago`;
}

export function SystemStatus() {
  const apiHealth = useApiHealth();
  const connectionStatus = useEventsStore((state) => state.connectionStatus);
  const lastEventAt = useEventsStore((state) => state.lastEventAt);
  const activeAgentCount = useEventsStore((state) => state.activeAgentCount);
  const totalAgentCount = useEventsStore((state) => state.totalAgentCount);
  const queues = useEventsStore((state) => state.queues);
  const governorState = useEventsStore((state) => state.governorState);
  const startupSummary = useEventsStore((state) => state.startupSummary);
  const jobs = useVideoStore((state) => state.jobs);

  const videoJobs = useMemo(() => [...jobs.values()], [jobs]);

  const videoQueue = queues.get("swarmx-video");
  const queuedJobs = videoQueue
    ? videoQueue.waiting + videoQueue.active
    : videoJobs.filter((job) =>
        job.status === "queued" ||
        ["running", "classifying", "scripting", "staging", "generating", "interpolating", "encoding", "reviewing", "publishing"].includes(job.status),
      ).length;

  const processedJobs = videoQueue?.completed ??
    videoJobs.filter((job) => job.status === "completed" || job.status === "done").length;

  const pressureLevel =
    governorState?.pressureLevel ??
    startupSummary?.pressureLevel ??
    "normal";

  const pipelineHealth = useMemo<"healthy" | "degraded" | "offline">(() => {
    if (apiHealth.apiOnline === false) return "offline";
    if (apiHealth.ollamaOnline === false || pressureLevel === "critical") return "degraded";
    return "healthy";
  }, [apiHealth.apiOnline, apiHealth.ollamaOnline, pressureLevel]);

  const connected =
    apiHealth.apiOnline === true ||
    (apiHealth.apiOnline === null && connectionStatus === "connected");

  const statusLabel = connected ? "Connected" : apiHealth.apiOnline === false ? "Reconnecting" : "Checking";
  const StatusIcon = connected ? Wifi : WifiOff;

  return (
    <section className="space-y-2 border-b border-border bg-bg-base px-3 py-3 sm:px-5" aria-label="System live status">
      <div
        className={cn(
          "flex min-h-11 items-center justify-between gap-3 rounded border px-3 py-2",
          connected
            ? "border-status-success/35 bg-status-success/8"
            : "border-status-warning/35 bg-status-warning/8",
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("status-dot h-2 w-2", connected ? "bg-status-success" : "bg-status-warning")} />
          <StatusIcon className={cn("h-4 w-4 shrink-0", connected ? "text-status-success" : "text-status-warning")} aria-hidden="true" />
          <div className="min-w-0">
            <p className={cn("text-xs font-semibold", connected ? "text-status-success" : "text-status-warning")}>
              {statusLabel}
            </p>
            <p className="truncate font-mono text-[10px] text-text-muted">
              API {apiHealth.apiStatus ?? "pending"} · telemetry {formatAge(lastEventAt)}
            </p>
          </div>
        </div>
        <span className="hidden shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted sm:inline-flex">
          <Activity className="h-3 w-3" aria-hidden="true" />
          Live
        </span>
      </div>

      <div className="rounded border border-border bg-bg-surface p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              System Live Status
            </p>
            <p className="mt-1 text-sm font-semibold tracking-tight text-text-primary">
              Production telemetry
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded border border-border bg-bg-elevated px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-text-muted">
            <Server className="h-3 w-3" aria-hidden="true" />
            {totalAgentCount} nodes
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <TelemetryMetric icon={Cpu} label="Active Nodes" value={activeAgentCount} detail={`${totalAgentCount} registered`} />
          <TelemetryMetric icon={ListChecks} label="Job Queue" value={queuedJobs} detail={videoQueue ? `${videoQueue.waiting} waiting` : "video jobs"} />
          <TelemetryMetric icon={CheckCircle2} label="Processed Jobs" value={processedJobs} detail="completed" />
          <TelemetryMetric
            icon={Gauge}
            label="Pipeline Health"
            value={pipelineHealth.toUpperCase()}
            detail={
              pipelineHealth === "healthy"
                ? "runtime nominal"
                : pipelineHealth === "degraded"
                  ? `pressure ${pressureLevel}`
                  : "API unavailable"
            }
            valueClassName={
              pipelineHealth === "healthy"
                ? "text-status-success"
                : pipelineHealth === "degraded"
                  ? "text-status-warning"
                  : "text-status-error"
            }
          />
        </div>
      </div>
    </section>
  );
}

function TelemetryMetric({
  icon: Icon,
  label,
  value,
  detail,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-h-24 rounded border border-border bg-bg-elevated/60 p-3">
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </div>
      <p className={cn("mt-2 text-lg font-semibold tabular-nums", valueClassName ?? "font-mono text-text-primary")}>
        {value}
      </p>
      <p className="mt-1 font-mono text-[9px] text-text-muted">{detail}</p>
    </div>
  );
}
