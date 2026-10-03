"use client";

import { Activity, CheckCircle2, CircleAlert, ListVideo, Server, Zap } from "lucide-react";
import { useApiHealth } from "@/hooks/useApiHealth";
import { useEventsStore } from "@/stores/events";
import { cn } from "@/lib/utils";

function formatCount(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-NG");
}

function derivePipelineHealth(input: {
  apiOnline: boolean | null;
  ollamaOnline: boolean | null;
  pressureLevel: string | undefined;
}): { label: string; className: string; icon: typeof CheckCircle2 } {
  if (input.apiOnline === false) {
    return {
      label: "Attention",
      className: "text-status-error",
      icon: CircleAlert,
    };
  }

  if (
    input.ollamaOnline === false ||
    input.pressureLevel === "high" ||
    input.pressureLevel === "critical"
  ) {
    return {
      label: "Degraded",
      className: "text-status-warning",
      icon: Activity,
    };
  }

  if (input.apiOnline === null) {
    return {
      label: "Checking",
      className: "text-text-muted",
      icon: Activity,
    };
  }

  return {
    label: "Healthy",
    className: "text-status-success",
    icon: CheckCircle2,
  };
}

export function SystemStatus() {
  const apiHealth = useApiHealth();
  const activeAgentCount = useEventsStore((state) => state.activeAgentCount);
  const queues = useEventsStore((state) => state.queues);
  const governorState = useEventsStore((state) => state.governorState);
  const startupSummary = useEventsStore((state) => state.startupSummary);

  const videoQueue =
    queues.get("swarmx-video") ??
    [...queues.values()].find((queue) => queue.name.includes("video"));

  const jobQueue =
    videoQueue != null ? videoQueue.waiting + videoQueue.active : null;
  const processedJobs = videoQueue?.completed ?? null;

  const pipeline = derivePipelineHealth({
    apiOnline: apiHealth.apiOnline,
    ollamaOnline: apiHealth.ollamaOnline ?? startupSummary?.ollamaReachable ?? null,
    pressureLevel: governorState?.pressureLevel ?? startupSummary?.pressureLevel,
  });

  const PipelineIcon = pipeline.icon;
  const connected = apiHealth.apiOnline === true;
  const checking = apiHealth.apiOnline === null;

  return (
    <section className="shrink-0 border-b border-border bg-bg-base" aria-label="System status">
      <div
        className={cn(
          "flex min-h-10 items-center justify-between gap-3 border-b px-3 py-2 sm:px-5",
          connected
            ? "border-status-success/25 bg-status-success/[0.06]"
            : checking
              ? "border-border bg-bg-surface/[0.55]"
              : "border-status-warning/25 bg-status-warning/[0.05]",
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              connected
                ? "bg-status-success"
                : checking
                  ? "bg-text-muted"
                  : "bg-status-warning",
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              "truncate font-mono text-[10px] font-semibold uppercase tracking-[0.16em]",
              connected
                ? "text-status-success"
                : checking
                  ? "text-text-secondary"
                  : "text-status-warning",
            )}
          >
            {connected ? "Connected" : checking ? "Checking connection" : "Offline · Reconnecting"}
          </span>
          <span className="hidden truncate text-[10px] text-text-muted sm:inline">
            {connected && apiHealth.latencyMs != null
              ? `API ${apiHealth.latencyMs} ms`
              : checking
                ? "Checking control plane"
                : "Fastify API offline (port 3001)"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 font-mono text-[9px] uppercase tracking-wide text-text-muted">
          {apiHealth.lastChecked != null && (
            <span className="hidden sm:inline">
              {new Date(apiHealth.lastChecked).toLocaleTimeString("en-NG", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </span>
          )}
          <span className={connected ? "text-status-success" : checking ? "text-text-muted" : "text-status-warning"}>
            {connected ? "Live" : checking ? "Checking" : "Offline"}
          </span>
        </div>
      </div>

      <div className="px-3 py-3 sm:px-5">
        <div className="rounded-xl border border-border bg-bg-surface p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-accent bg-[var(--color-accent-dim)] text-accent">
                  <Zap className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-heading text-sm font-semibold text-text-primary">
                    System Live Status
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
                    Control plane telemetry
                  </p>
                </div>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 py-1 font-mono text-[9px] uppercase tracking-wide">
              <PipelineIcon className={cn("size-3.5", pipeline.className)} aria-hidden="true" />
              <span className={pipeline.className}>{pipeline.label}</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <TelemetryMetric
              icon={Server}
              label="Active Nodes"
              value={formatCount(activeAgentCount)}
            />
            <TelemetryMetric
              icon={ListVideo}
              label="Job Queue"
              value={formatCount(jobQueue)}
            />
            <TelemetryMetric
              icon={CheckCircle2}
              label="Processed Jobs"
              value={formatCount(processedJobs)}
            />
            <TelemetryMetric
              icon={Activity}
              label="Pipeline Health"
              value={pipeline.label}
              valueClassName={pipeline.className}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function TelemetryMetric({
  icon: Icon,
  label,
  value,
  valueClassName = "text-text-primary",
}: {
  readonly icon: typeof Server;
  readonly label: string;
  readonly value: string;
  readonly valueClassName?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-bg-elevated/70 px-3 py-2.5">
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <p className={cn("mt-1 font-mono text-sm font-semibold tabular-nums", valueClassName)} data-metric>
        {value}
      </p>
    </div>
  );
}
