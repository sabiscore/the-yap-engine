"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  CheckCircle2,
  Clock3,
  ListVideo,
  ServerCog,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEventsStore } from "@/stores/events";

type ConnectionState = "connected" | "connecting" | "degraded";

interface HealthSnapshot {
  status?: string;
  ollama?: {
    reachable?: boolean;
  };
}

interface SystemStatusProps {
  readonly compact?: boolean;
}

const HEALTH_POLL_MS = 12_000;
const HEALTH_TIMEOUT_MS = 4_000;

async function fetchHealth(signal: AbortSignal): Promise<HealthSnapshot> {
  const response = await fetch("/api/system/health", {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error("health_request_failed");
  }

  return (await response.json()) as HealthSnapshot;
}

export function SystemStatus({ compact = false }: SystemStatusProps) {
  const activeNodes = useEventsStore((s) => s.activeAgentCount);
  const errorNodes = useEventsStore((s) => s.errorAgentCount);
  const queues = useEventsStore((s) => s.queues);

  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let disposed = false;

    const poll = async () => {
      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(
        () => controller.abort(),
        HEALTH_TIMEOUT_MS,
      );

      setChecking(true);

      try {
        const next = await fetchHealth(controller.signal);
        if (!disposed) setHealth(next);
      } catch {
        if (!disposed) setHealth(null);
      } finally {
        globalThis.clearTimeout(timeoutId);
        if (!disposed) setChecking(false);
      }
    };

    void poll();
    const intervalId = globalThis.setInterval(() => void poll(), HEALTH_POLL_MS);

    return () => {
      disposed = true;
      globalThis.clearInterval(intervalId);
    };
  }, []);

  const telemetry = useMemo(() => {
    let waiting = 0;
    let active = 0;
    let completed = 0;

    for (const queue of queues.values()) {
      waiting += queue.waiting;
      active += queue.active;
      completed += queue.completed;
    }

    return {
      queueDepth: waiting + active,
      processed: completed,
      activeWork: active,
    };
  }, [queues]);

  const connectionState: ConnectionState =
    health?.status === "ok" && health.ollama?.reachable !== false
      ? "connected"
      : checking && health === null
        ? "connecting"
        : "degraded";

  const pipelineHealth =
    connectionState === "connected" && errorNodes === 0
      ? "HEALTHY"
      : connectionState === "connected"
        ? "WATCH"
        : "DEGRADED";

  const statusLabel =
    connectionState === "connected"
      ? "Connected"
      : connectionState === "connecting"
        ? "Connecting"
        : "Degraded";

  if (compact) {
    return (
      <div
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-status-success/30 bg-status-success/10 px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-status-success"
        role="status"
        aria-live="polite"
      >
        <span
          className="status-dot"
          data-status={
            connectionState === "connected"
              ? "active"
              : connectionState === "connecting"
                ? "activating"
                : "warning"
          }
          aria-hidden="true"
        />
        <span>{statusLabel}</span>
        {connectionState === "connected" && health?.ollama?.reachable === true ? (
          <span className="hidden text-text-muted sm:inline">· Ollama ready</span>
        ) : null}
      </div>
    );
  }

  const metrics = [
    { label: "Active Nodes", value: activeNodes, icon: ServerCog, detail: "live agents" },
    { label: "Job Queue", value: telemetry.queueDepth, icon: ListVideo, detail: telemetry.activeWork + " active" },
    { label: "Processed Jobs", value: telemetry.processed, icon: CheckCircle2, detail: "completed" },
  ];

  return (
    <section className="space-y-3" aria-label="System health">
      <div
        className={cn(
          "flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2",
          connectionState === "connected"
            ? "border-status-success/30 bg-status-success/10 text-status-success"
            : "border-status-warning/30 bg-status-warning/10 text-status-warning",
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex min-w-0 items-center gap-2">
          {connectionState === "connected" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : connectionState === "connecting" ? (
            <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="font-heading text-xs font-semibold uppercase tracking-[0.14em]">
            {statusLabel}
          </span>
          <span className="hidden truncate text-[10px] font-mono text-text-muted sm:inline">
            {health?.ollama?.reachable === true
              ? "local inference bridge ready"
              : "runtime telemetry is still settling"}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-text-muted">
          live
        </span>
      </div>

      <div className="rounded-xl border border-border bg-bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-heading text-sm font-semibold tracking-tight text-text-primary">
              <Activity className="h-4 w-4 text-accent-cyan" aria-hidden="true" />
              System Live Status
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Real-time fleet, queue, and pipeline telemetry.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-base px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-text-muted">
            <Boxes className="h-3 w-3 text-accent-cyan" aria-hidden="true" />
            {telemetry.activeWork} executing
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon, detail }) => (
            <div key={label} className="rounded-lg border border-border/70 bg-bg-base p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
                  {label}
                </span>
                <Icon className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-text-primary">
                {value}
              </p>
              <p className="mt-1 font-mono text-[9px] text-text-muted">{detail}</p>
            </div>
          ))}

          <div className="rounded-lg border border-border/70 bg-bg-base p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
                Pipeline Health
              </span>
              <span
                className="status-dot"
                data-status={
                  pipelineHealth === "HEALTHY"
                    ? "active"
                    : pipelineHealth === "WATCH"
                      ? "warning"
                      : "error"
                }
                aria-hidden="true"
              />
            </div>
            <p
              className={cn(
                "mt-2 font-heading text-lg font-semibold tracking-tight",
                pipelineHealth === "HEALTHY"
                  ? "text-status-success"
                  : pipelineHealth === "WATCH"
                    ? "text-status-warning"
                    : "text-status-error",
              )}
            >
              {pipelineHealth}
            </p>
            <p className="mt-1 font-mono text-[9px] text-text-muted">
              {errorNodes > 0
                ? errorNodes + " node" + (errorNodes === 1 ? "" : "s") + " reporting errors"
                : "No active node errors"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
