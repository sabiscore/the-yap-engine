"use client";

import React, { useMemo } from "react";
import { Cpu, MemoryStick, Bot, Flame, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEventsStore } from "@/stores/events";
import { useApiHealth } from "@/hooks/useApiHealth";

export interface TelemetryWidgetProps {
  /** Optional override for CPU load (0-100) */
  readonly cpuLoad?: number;
  /** Optional override for ZRAM usage percentage (0-100) */
  readonly zramPct?: number;
  /** Optional override for agent fleet concurrency fanout multiplier */
  readonly agentFanout?: number;
  /** Optional override for Ollama warming state */
  readonly ollamaWarming?: {
    readonly done: boolean;
    readonly coldStartEtaSecs?: number | null;
    readonly online?: boolean;
  };
  /** Optional override for active agent count */
  readonly activeAgents?: number;
  /** Optional override for total agent count */
  readonly totalAgents?: number;
  /** Optional override for error agent count */
  readonly errorAgents?: number;
  /** Optional override for memory pressure level */
  readonly pressureLevel?: "normal" | "high" | "critical";
  /** Optional override for available memory in MB */
  readonly availableMb?: number | null;
  readonly className?: string;
}

export function TelemetryWidget({
  cpuLoad: propCpuLoad,
  zramPct: propZramPct,
  agentFanout: propAgentFanout,
  ollamaWarming: propOllamaWarming,
  activeAgents: propActiveAgents,
  totalAgents: propTotalAgents,
  errorAgents: propErrorAgents,
  pressureLevel: propPressureLevel,
  availableMb: propAvailableMb,
  className,
}: TelemetryWidgetProps) {
  // Store subscriptions (fallback when props are omitted)
  const metrics = useEventsStore((s) => s.systemMetrics);
  const governorState = useEventsStore((s) => s.governorState);
  const startupSummary = useEventsStore((s) => s.startupSummary);
  const storeActiveAgents = useEventsStore((s) => s.activeAgentCount);
  const storeTotalAgents = useEventsStore((s) => s.totalAgentCount);
  const storeErrorAgents = useEventsStore((s) => s.errorAgentCount);
  const apiHealth = useApiHealth();

  // 1. CPU Load calculation
  const cpuLoad = useMemo(() => {
    if (propCpuLoad !== undefined) return propCpuLoad;
    const cores = metrics?.cpu.perCore ?? [];
    if (cores.length > 0) {
      return cores.reduce((a, b) => a + b, 0) / cores.length;
    }
    return metrics?.cpu.load1m ?? 0;
  }, [propCpuLoad, metrics]);

  // 2. ZRAM & Pressure calculation
  const zramPct = useMemo(() => {
    if (propZramPct !== undefined) return propZramPct;
    const frac = governorState?.zramUsedPct ?? startupSummary?.zramUsedPct ?? 0;
    return frac * 100;
  }, [propZramPct, governorState, startupSummary]);

  const pressureLevel =
    propPressureLevel ??
    governorState?.pressureLevel ??
    startupSummary?.pressureLevel ??
    "normal";

  const availableMb =
    propAvailableMb !== undefined
      ? propAvailableMb
      : governorState?.availableMb ?? startupSummary?.availableMb ?? null;

  // 3. Agent Fanout calculation
  const concurrencyLimit = useMemo(() => {
    if (propAgentFanout !== undefined) return propAgentFanout;
    return governorState?.concurrencyLimit ?? startupSummary?.concurrencyLimit ?? 1;
  }, [propAgentFanout, governorState, startupSummary]);

  const activeAgents = propActiveAgents !== undefined ? propActiveAgents : storeActiveAgents;
  const totalAgents = propTotalAgents !== undefined ? propTotalAgents : storeTotalAgents;
  const errorAgents = propErrorAgents !== undefined ? propErrorAgents : storeErrorAgents;

  // 4. Ollama Warming calculation
  const warmingState = useMemo(() => {
    if (propOllamaWarming !== undefined) {
      return {
        done: propOllamaWarming.done,
        coldStartEtaSecs: propOllamaWarming.coldStartEtaSecs ?? null,
        online: propOllamaWarming.online ?? true,
      };
    }
    const warmup = apiHealth.warmup;
    const isWarmed = warmup?.done ?? startupSummary?.warmupDone ?? false;
    const eta = warmup?.coldStartEtaSecs ?? null;
    const online = apiHealth.ollamaOnline ?? startupSummary?.ollamaReachable ?? null;
    return { done: isWarmed, coldStartEtaSecs: eta, online: online ?? true };
  }, [propOllamaWarming, apiHealth, startupSummary]);

  // Status mappings using high-contrast semantic tokens
  const cpuStatus = cpuLoad >= 85 ? "critical" : cpuLoad >= 60 ? "warning" : "safe";
  const zramStatus =
    pressureLevel === "critical" || zramPct >= 85
      ? "critical"
      : pressureLevel === "high" || zramPct >= 60
      ? "warning"
      : "safe";
  const fanoutStatus = errorAgents > 0 ? "critical" : activeAgents >= concurrencyLimit ? "warning" : "safe";
  const warmingStatus = !warmingState.online ? "critical" : !warmingState.done ? "warning" : "safe";

  // Critical announcement for aria-live
  const alertMessage = useMemo(() => {
    if (cpuStatus === "critical") return `Warning: High CPU load at ${cpuLoad.toFixed(1)} percent.`;
    if (zramStatus === "critical") return `Warning: Critical memory pressure. ZRAM usage at ${zramPct.toFixed(0)} percent.`;
    if (errorAgents > 0) return `Alert: ${errorAgents} agent errors detected.`;
    if (!warmingState.online) return "Alert: Ollama is unreachable.";
    return null;
  }, [cpuStatus, cpuLoad, zramStatus, zramPct, errorAgents, warmingState.online]);

  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-bg-elevated p-3 sm:p-4 shadow-sm",
        "transition-all duration-(--duration-panel)",
        className
      )}
      role="region"
      aria-label="Real-time System Metrics"
    >
      {/* Scoped polite live region for genuine critical status changes */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {alertMessage}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4 @sm:grid-cols-2 @lg:grid-cols-4">
        {/* Card 1: CPU Load */}
        <div
          className={cn(
            "flex flex-col justify-between p-3 rounded-lg border relative overflow-hidden transition-colors",
            "bg-bg-surface/70 border-border/70",
            cpuStatus === "critical" && "border-status-error/40 bg-status-error/6",
            cpuStatus === "warning" && "border-status-warning/40 bg-status-warning/6"
          )}
        >
          <div
            className="flex items-center justify-between gap-1 text-[11px] font-mono text-text-muted uppercase tracking-wider"
            aria-hidden="true"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Cpu className="h-3.5 w-3.5 shrink-0" /> CPU Load
            </span>
            {metrics?.cpu.coreCount && (
              <span className="text-[9px] text-text-muted/80 shrink-0">{`${metrics.cpu.coreCount}c`}</span>
            )}
          </div>
          <div className="mt-2">
            <span
              className={cn(
                "text-2xl font-mono font-bold tabular-nums tracking-tight",
                cpuStatus === "critical"
                  ? "text-status-error"
                  : cpuStatus === "warning"
                  ? "text-status-warning"
                  : "text-status-active"
              )}
            >
              {`${cpuLoad.toFixed(1)}%`}
            </span>
            <span className="sr-only">{`CPU Load is at ${cpuLoad.toFixed(1)} percent, status ${cpuStatus}`}</span>
          </div>
          {/* Micro Progress Track */}
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                cpuStatus === "critical"
                  ? "bg-status-error"
                  : cpuStatus === "warning"
                  ? "bg-status-warning"
                  : "bg-status-active"
              )}
              style={{ width: `${Math.min(100, Math.max(2, cpuLoad))}%` }}
            />
          </div>
        </div>

        {/* Card 2: ZRAM Pressure */}
        <div
          className={cn(
            "flex flex-col justify-between p-3 rounded-lg border relative overflow-hidden transition-colors",
            "bg-bg-surface/70 border-border/70",
            zramStatus === "critical" && "border-status-error/40 bg-status-error/6",
            zramStatus === "warning" && "border-status-warning/40 bg-status-warning/6"
          )}
        >
          <div
            className="flex items-center justify-between gap-1 text-[11px] font-mono text-text-muted uppercase tracking-wider"
            aria-hidden="true"
          >
            <span className="flex items-center gap-1.5 truncate">
              <MemoryStick className="h-3.5 w-3.5 shrink-0" /> ZRAM Limit
            </span>
            <span
              className={cn(
                "text-[9px] font-mono uppercase px-1 py-0.2 rounded border shrink-0",
                zramStatus === "critical"
                  ? "border-status-error/50 text-status-error"
                  : zramStatus === "warning"
                  ? "border-status-warning/50 text-status-warning"
                  : "border-border text-text-muted"
              )}
            >
              {pressureLevel}
            </span>
          </div>
          <div className="mt-2">
            <span
              className={cn(
                "text-2xl font-mono font-bold tabular-nums tracking-tight",
                zramStatus === "critical"
                  ? "text-status-error"
                  : zramStatus === "warning"
                  ? "text-status-warning"
                  : "text-status-active"
              )}
            >
              {`${zramPct.toFixed(0)}%`}
            </span>
            <span className="sr-only">
              {`ZRAM utilization at ${zramPct.toFixed(0)} percent, pressure level ${pressureLevel}`}
            </span>
          </div>
          <div className="mt-2 text-[10px] font-mono text-text-muted truncate">
            {availableMb != null ? `${Math.round(availableMb)} MB avail` : "procfs OK"}
          </div>
        </div>

        {/* Card 3: Agent Fleet Fanout */}
        <div
          className={cn(
            "flex flex-col justify-between p-3 rounded-lg border relative overflow-hidden transition-colors",
            "bg-bg-surface/70 border-border/70",
            fanoutStatus === "critical" && "border-status-error/40 bg-status-error/6",
            fanoutStatus === "warning" && "border-status-warning/40 bg-status-warning/6"
          )}
        >
          <div
            className="flex items-center justify-between gap-1 text-[11px] font-mono text-text-muted uppercase tracking-wider"
            aria-hidden="true"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Bot className="h-3.5 w-3.5 shrink-0" /> Fleet Fanout
            </span>
            {errorAgents > 0 && (
              <span className="flex items-center gap-0.5 text-[9px] font-mono text-status-error shrink-0">
                <AlertCircle className="h-2.5 w-2.5" />
                {errorAgents}
              </span>
            )}
          </div>
          <div className="mt-2">
            <span
              className={cn(
                "text-2xl font-mono font-bold tabular-nums tracking-tight",
                fanoutStatus === "critical"
                  ? "text-status-error"
                  : fanoutStatus === "warning"
                  ? "text-status-warning"
                  : "text-status-active"
              )}
            >
              {`x${concurrencyLimit}`}
            </span>
            <span className="sr-only">
              {`Agent concurrency fanout limit is x${concurrencyLimit}, status ${fanoutStatus}`}
            </span>
          </div>
          <div className="mt-2 text-[10px] font-mono text-text-muted truncate">
            {`${activeAgents} active · ${totalAgents} total`}
          </div>
        </div>

        {/* Card 4: Ollama Warming Status */}
        <div
          className={cn(
            "flex flex-col justify-between p-3 rounded-lg border relative overflow-hidden transition-colors",
            "bg-bg-surface/70 border-border/70",
            warmingStatus === "critical" && "border-status-error/40 bg-status-error/6",
            warmingStatus === "warning" && "border-status-warning/40 bg-status-warning/6"
          )}
        >
          <div
            className="flex items-center justify-between gap-1 text-[11px] font-mono text-text-muted uppercase tracking-wider"
            aria-hidden="true"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Flame className="h-3.5 w-3.5 shrink-0" /> Ollama Status
            </span>
            <span
              className={cn(
                "status-dot h-1.5 w-1.5 shrink-0",
                warmingStatus === "critical"
                  ? "bg-status-error"
                  : warmingStatus === "warning"
                  ? "bg-status-warning animate-pulse"
                  : "bg-status-active"
              )}
            />
          </div>
          <div className="mt-2">
            <span
              className={cn(
                "text-lg sm:text-xl font-mono font-bold uppercase tracking-tight truncate block",
                warmingStatus === "critical"
                  ? "text-status-error"
                  : warmingStatus === "warning"
                  ? "text-status-warning"
                  : "text-status-active"
              )}
            >
              {warmingState.done ? "READY" : !warmingState.online ? "OFFLINE" : "WARMING"}
            </span>
            <span className="sr-only">
              {`Ollama warming status: ${warmingState.done ? "Ready" : !warmingState.online ? "Offline" : "Warming up"}`}
            </span>
          </div>
          <div className="mt-2 text-[10px] font-mono text-text-muted truncate">
            {warmingState.done
              ? "All models resident"
              : warmingState.coldStartEtaSecs !== null && warmingState.coldStartEtaSecs > 0
              ? `~${warmingState.coldStartEtaSecs}s ETA`
              : "cold (ETA unavailable)"}
          </div>
        </div>
      </div>
    </section>
  );
}
