"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  RadialBarChart,
  RadialBar,
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { cn, formatPct, formatBps } from "@/lib/utils";
import { useEventsStore } from "@/stores/events";
import { useApiHealth } from "@/hooks/useApiHealth";
import { RouteDegradedBanner } from "@/components/layout/RouteDegradedBanner";
import { TelemetryWidget } from "@/components/telemetry/TelemetryWidget";
import type { AgentState, LogEntry } from "@swarmx/types";

import { Zap, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Brain } from "lucide-react";

// ── Type helpers ──────────────────────────────────────────────────────────────

/** Map AgentStatus → CSS data-status value (passes through for all defined statuses). */
function agentDataStatus(status: AgentState["status"]): string {
  // active / running → green pulse
  if (status === "running" || status === "active" || status === "activating") return "active";
  // terminal success
  if (status === "success") return "success";
  // pending / waiting
  if (status === "queued") return "queued";
  // slow-down
  if (status === "throttled") return "throttled";
  // reload cycle
  if (status === "reload" || status === "reloading") return "reloading";
  // winding down
  if (status === "deactivating" || status === "paused") return "idle";
  // fatal / OOM / killed — use the exact CSS selector values
  if (
    status === "fatal" ||
    status === "failed_permanent" ||
    status === "oom_killed" ||
    status === "oom" ||
    status === "killed"
  ) return "fatal";
  // standard error / failed
  if (status === "error" || status === "failed") return "error";
  // idle / unknown
  return "idle";
}

function layerDataStatus(status: string): string {
  if (status === "healthy") return "active";
  if (status === "degraded") return "queued";
  if (status === "critical") return "error";
  return "idle";
}

function logTimestampColor(level: string): string {
  if (level === "error" || level === "critical" || level === "fatal") return "text-status-error";
  if (level === "warn" || level === "warning") return "text-status-warning";
  return "text-text-muted";
}

function logMessageColor(level: string): string {
  if (level === "error" || level === "critical" || level === "fatal") return "text-status-error";
  if (level === "warn" || level === "warning") return "text-status-warning";
  return "text-text-secondary";
}

function resourceMeterClass(pct: number, warn: number, critical: number): string {
  if (pct >= critical) return "swarm-meter swarm-meter--error";
  if (pct >= warn) return "swarm-meter swarm-meter--warn";
  return "swarm-meter swarm-meter--good";
}

function formatErrorCount(errors: number): string {
  return `${errors} ${errors === 1 ? "error" : "errors"}`;
}

// ── AI Insight Engine ─────────────────────────────────────────────────────────

interface Insight {
  id: string;
  type: "info" | "warn" | "error" | "success";
  message: string;
  action?: string;
  href?: string;
}

function useInsights(): Insight[] {
  const active = useEventsStore((s) => s.activeAgentCount);
  const errors = useEventsStore((s) => s.errorAgentCount);
  const total = useEventsStore((s) => s.totalAgentCount);
  const metrics = useEventsStore((s) => s.systemMetrics);
  const agents = useEventsStore((s) => [...s.agents.values()]);
  const queues = useEventsStore((s) => s.queues);
  const scsScore = useEventsStore((s) => s.scsScore);

  return useMemo(() => {
    const ins: Insight[] = [];

    if (errors > 0) {
      ins.push({
        id: "agent-errors",
        type: "error",
        message: `${errors} agent${errors === 1 ? "" : "s"} need${errors === 1 ? "s" : ""} your attention`,
        action: "Triage →",
        href: "/agents?focus=error",
      });
    }

    // Use properly-typed resource alias — AgentState has resource/resources both pointing to AgentResourceSnapshot
    const throttled = agents.filter((a) => {
      const res = a.resources ?? a.resource ?? null;
      return (res?.cpuThrottledPercent ?? 0) > 15;
    });
    if (throttled.length > 0) {
      ins.push({
        id: "throttled",
        type: "warn",
        message: `${throttled.length} agent${throttled.length === 1 ? " is" : "s are"} CPU-throttled — consider scaling`,
        action: "View →",
        href: "/agents",
      });
    }

    const totalWaiting = [...(queues?.values() ?? [])].reduce((a, q) => a + q.waiting, 0);
    if (totalWaiting > 20) {
      ins.push({
        id: "queue-pressure",
        type: "warn",
        message: `Queue depth at ${totalWaiting} — swarm is under pressure`,
      });
    }

    const memPct = metrics ? (metrics.memory.usedMb / metrics.memory.totalMb) * 100 : 0;
    if (memPct > 88) {
      ins.push({
        id: "mem-pressure",
        type: "error",
        message: `Memory at ${Math.round(memPct)}% — OOM risk elevated`,
      });
    }

    if (scsScore !== null && scsScore >= 0.92 && errors === 0 && active > 0) {
      ins.push({
        id: "swarm-optimal",
        type: "success",
        message: `Swarm coherence ${Math.round(scsScore * 100)}% — fleet is firing on all cylinders`,
      });
    }

    if (total === 0 && ins.length === 0) {
      ins.push({
        id: "idle-fleet",
        type: "info",
        message: "Fleet is standing by — run `swarm up` to deploy agents",
      });
    }

    return ins.slice(0, 3);
  }, [active, errors, total, metrics, agents, queues, scsScore]);
}

// ── Insight Strip ─────────────────────────────────────────────────────────────

function InsightStrip() {
  const insights = useInsights();
  if (insights.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 insight-strip">
      {insights.map((ins) => (
        <div
          key={ins.id}
          className={cn(
            "flex items-center justify-between px-4 py-2 rounded-lg border text-[11px] font-mono",
            ins.type === "error" && "insight-error",
            ins.type === "warn" && "insight-warn",
            ins.type === "success" && "insight-success",
            ins.type === "info" && "insight-info"
          )}
        >
          <div className="flex items-center gap-2">
            {ins.type === "error" && <AlertTriangle className="h-3 w-3 shrink-0" />}
            {ins.type === "warn"  && <AlertTriangle className="h-3 w-3 shrink-0" />}
            {ins.type === "success" && <CheckCircle2 className="h-3 w-3 shrink-0" />}
            {ins.type === "info"  && <Brain className="h-3 w-3 shrink-0" />}
            <span>{ins.message}</span>
          </div>
          {/* [V6.2-ENH-07] Use Next.js Link for SPA navigation instead of full-page <a> reload. */}
          {ins.action && ins.href && (
            <Link
              href={ins.href}
              className="shrink-0 ml-4 underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity"
            >
              {ins.action}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Section shell ─────────────────────────────────────────────────────────────

function Panel({
  title,
  children,
  className,
  loading,
  live,
  variant,
  badge,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly loading?: boolean;
  readonly live?: boolean;
  readonly variant?: "default" | "warn" | "danger";
  readonly badge?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col bg-bg-surface border border-border rounded-lg overflow-hidden panel-enter card-interactive",
        live && "live-panel-edge",
        variant === "danger" && "panel-variant-danger",
        variant === "warn" && "panel-variant-warn",
        className
      )}
    >
      <header className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {live && (
            <span
              className="status-dot h-1.5 w-1.5 shrink-0"
              data-status="active"
              aria-label="Live data"
            />
          )}
          {variant === "danger" && !live && (
            <span
              className="status-dot h-1.5 w-1.5 shrink-0"
              data-status="error"
              aria-label="Error state"
            />
          )}
          <span className="text-[11px] font-mono font-semibold text-text-muted uppercase tracking-widest">
            {title}
          </span>
          {badge}
        </div>
        {loading && (
          <span className="text-[9px] font-mono text-text-muted animate-pulse">loading…</span>
        )}
      </header>
      <div className="flex-1 p-4">
        {children}
      </div>
    </section>
  );
}

// ── Trend indicator ───────────────────────────────────────────────────────────

function TrendIcon({ delta }: { readonly delta: number }) {
  if (delta > 2)  return <TrendingUp   className="h-3 w-3 text-status-error"   aria-label="Increasing" />;
  if (delta < -2) return <TrendingDown className="h-3 w-3 text-status-success" aria-label="Decreasing" />;
  return              <Minus       className="h-3 w-3 text-text-muted"     aria-label="Stable" />;
}

// ── Status dot matrix — all agents ────────────────────────────────────────────

function AgentStatusMatrix() {
  const agents = useEventsStore((s) => [...s.agents.values()]);
  const total = useEventsStore((s) => s.totalAgentCount);
  const active = useEventsStore((s) => s.activeAgentCount);
  const errors = useEventsStore((s) => s.errorAgentCount);
  const visibleAgents = agents.slice(0, 64);
  const extraAgents = Math.max(0, agents.length - visibleAgents.length);

  if (agents.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-baseline gap-2">
          <div className="h-8 w-12 skeleton rounded" />
          <div className="h-4 w-20 skeleton rounded" />
        </div>
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border border-dashed border-border animate-spin" style={{ animationDuration: "8s" }} />
            <div className="absolute inset-2 rounded-full border border-border/40" />
          </div>
          <span className="text-[11px] font-mono text-text-muted text-center leading-relaxed">
            Your fleet is standing by.<br />
            <span className="text-text-muted/60">Run <code className="text-accent/80">swarm up</code> to deploy agents.</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary numbers */}
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-mono font-semibold text-text-primary tabular-nums num-enter" data-metric>
          {active}
        </span>
        <span className="text-xs font-mono text-text-muted">/ {total} running</span>
        {errors > 0 && (
          <span className="ml-auto text-xs font-mono text-status-error alert-wiggle">
            {formatErrorCount(errors)}
          </span>
        )}
        {errors === 0 && active > 0 && (
          <span className="ml-auto ai-chip">
            <Zap className="h-2 w-2" />
            optimal
          </span>
        )}
      </div>

      {/* Dot matrix */}
      <ul className="flex flex-wrap gap-1.5" aria-label="Agent statuses">
        {visibleAgents.map((agent) => (
          <li
            key={agent.id}
            className="status-dot h-3 w-3 rounded-full"
            data-status={agentDataStatus(agent.status)}
            title={`${agent.name ?? agent.id}: ${agent.status}`}
          />
        ))}
        {extraAgents > 0 && (
          <li className="text-[10px] font-mono text-text-muted self-center list-none">
            +{extraAgents}
          </li>
        )}
      </ul>
    </div>
  );
}

// ── Control plane layer health ────────────────────────────────────────────────

const CONTROL_PLANE_LAYERS = [
  { id: "intake",    label: "Intake",    description: "Goal parsing + validation" },
  { id: "planning",  label: "Planning",  description: "Task decomposition + DAG" },
  { id: "dispatch",  label: "Dispatch",  description: "Agent selection + routing" },
  { id: "execution", label: "Execution", description: "Agent task runner" },
  { id: "synthesis", label: "Synthesis", description: "Result aggregation" },
  { id: "eval",      label: "Eval",      description: "Quality gate + scoring" },
  { id: "memory",    label: "Memory",    description: "Context + RAG persistence" },
] as const;

function ControlPlaneHealth() {
  const layers = useEventsStore((s) => s.controlPlaneLayers);

  if (layers.size === 0) {
    return (
      <div className="space-y-1.5">
        {CONTROL_PLANE_LAYERS.map((layer) => (
          <div key={layer.id} className="flex items-center gap-2.5">
            <div className="h-2 w-2 rounded-full skeleton shrink-0" />
            <span className="text-xs font-mono text-text-muted w-20 shrink-0">{layer.label}</span>
            <div className="flex-1 h-3 skeleton rounded" />
          </div>
        ))}
      </div>
    );
  }

  const allHealthy = CONTROL_PLANE_LAYERS.every((l) => {
    const state = layers.get(l.id);
    return !state || state.status === "healthy";
  });

  return (
    <div className="space-y-1.5">
      {CONTROL_PLANE_LAYERS.map((layer) => {
        const state = layers.get(layer.id);
        const status = state?.status ?? "unknown";
        return (
          <div key={layer.id} className="flex items-center gap-2.5 group">
            <span
              className="status-dot h-2 w-2 shrink-0"
              data-status={layerDataStatus(status)}
            />
            <span className="text-xs font-mono text-text-secondary w-20 shrink-0">
              {layer.label}
            </span>
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] font-mono text-text-muted capitalize group-hover:text-text-secondary transition-colors">
              {status}
            </span>
            {state?.latencyP50Ms != null && (
              <span
                className={cn(
                  "text-[10px] font-mono tabular-nums w-12 text-right",
                  state.latencyP50Ms > 500 ? "text-status-warning" : "text-text-muted"
                )}
                data-metric
              >
                {state.latencyP50Ms}ms
              </span>
            )}
          </div>
        );
      })}
      {allHealthy && layers.size > 0 && (
        <div className="pt-1.5 flex items-center gap-1.5">
          <span className="status-dot h-1.5 w-1.5" data-status="active" />
          <span className="text-[10px] font-mono text-status-success">All layers nominal</span>
        </div>
      )}
    </div>
  );
}

// ── System resource gauges ────────────────────────────────────────────────────

function ResourceGauge({ label, value, max, unit, warn, critical }: {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly unit: string;
  readonly warn: number;
  readonly critical: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="space-y-1 group">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-text-muted uppercase tracking-wide">
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <TrendIcon delta={pct >= critical ? 5 : pct >= warn ? 2 : -3} />
          <span
            className={cn(
              "text-xs font-mono text-text-secondary tabular-nums",
              pct >= critical ? "text-status-error" : pct >= warn ? "text-status-warning" : ""
            )}
            data-metric
          >
            {Math.round(pct)}%
            <span className="text-text-muted ml-1 text-[9px]">
              {Math.round(value)}/{Math.round(max)}{unit}
            </span>
          </span>
        </div>
      </div>
      <progress
        className={resourceMeterClass(pct, warn, critical)}
        max={100}
        value={Math.min(100, pct)}
        aria-label={`${label} ${Math.round(pct)}%`}
      />
    </div>
  );
}

function SystemResourcePanel() {
  const metrics = useEventsStore((s) => s.systemMetrics);

  if (!metrics) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((item) => (
          <div key={`resource-skeleton-${item}`} className="space-y-1">
            <div className="h-3 skeleton rounded w-full" />
            <div className="h-1.5 skeleton rounded-full w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ResourceGauge
        label="CPU"
        value={(metrics.cpu.load1m / (metrics.cpu.coreCount ?? 1)) * 100}
        max={100}
        unit="%"
        warn={60}
        critical={85}
      />
      <ResourceGauge
        label="Memory"
        value={metrics.memory.usedMb / 1024}
        max={metrics.memory.totalMb / 1024}
        unit=" GB"
        warn={70}
        critical={85}
      />
      <ResourceGauge
        label="Yap Engine Slice"
        value={metrics.memory.swarmxSliceMb}
        max={metrics.memory.totalMb * 0.5}
        unit=" MB"
        warn={60}
        critical={80}
      />
      <div className="pt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 border-t border-border">
        <MetricCell label="Disk R" value={formatBps(metrics.disk.readBytesPerSec)} />
        <MetricCell label="Disk W" value={formatBps(metrics.disk.writeBytesPerSec)} />
        <MetricCell label="Net RX" value={formatBps(metrics.network.rxBytesPerSec)} />
        <MetricCell label="Net TX" value={formatBps(metrics.network.txBytesPerSec)} />
      </div>
    </div>
  );
}

function MetricCell({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[10px] font-mono text-text-muted">{label}</span>
      <span className="text-[10px] font-mono text-text-secondary tabular-nums" data-metric>{value}</span>
    </div>
  );
}

// ── Queue depth table ─────────────────────────────────────────────────────────

function QueueDepthPanel() {
  const queues = useEventsStore((s) => s.queues);

  if (queues.size === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <span className="text-xs font-mono text-text-muted">No active queues</span>
        <span className="text-[10px] font-mono text-text-muted/60">
          Jobs will appear here once the swarm is running
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[9px] font-mono text-text-muted uppercase tracking-wide pb-1 border-b border-border">
        <span>Queue</span>
        <div className="flex gap-4">
          <span className="w-8 text-right">Wait</span>
          <span className="w-8 text-right">Act</span>
          <span className="w-8 text-right">Del</span>
          <span className="w-8 text-right">Fail</span>
        </div>
      </div>
      {[...queues.entries()].map(([name, q]) => (
        <div key={name} className="flex items-center justify-between py-0.5 group hover:bg-bg-elevated/50 rounded px-1 -mx-1 transition-colors">
          <span className="text-[10px] font-mono text-text-secondary truncate max-w-25">
            {name}
          </span>
          <div className="flex gap-4">
            <span className={cn("text-[10px] font-mono tabular-nums w-8 text-right", q.waiting > 0 ? "text-status-queued" : "text-text-muted")} data-metric>
              {q.waiting}
            </span>
            <span className={cn("text-[10px] font-mono tabular-nums w-8 text-right", q.active > 0 ? "text-status-active" : "text-text-muted")} data-metric>
              {q.active}
            </span>
            <span className="text-[10px] font-mono tabular-nums w-8 text-right text-text-muted" data-metric>
              {q.delayed}
            </span>
            <span className={cn("text-[10px] font-mono tabular-nums w-8 text-right", q.failed > 0 ? "text-status-error" : "text-text-muted")} data-metric>
              {q.failed}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Recent events feed ────────────────────────────────────────────────────────

function RecentEventsFeed() {
  const logs = useEventsStore((s) => s.logs.slice(-8) as LogEntry[]);
  const reversed = useMemo(() => [...logs].reverse(), [logs]);

  if (reversed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-20 gap-1.5">
        <span className="text-xs font-mono text-text-muted">Quiet out there…</span>
        <span className="text-[10px] font-mono text-text-muted/50">Events will stream in real-time</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {reversed.map((log, i) => (
        <div key={log.id ?? `${log.timestamp}-${i}`} className="flex items-start gap-2 group">
          <span
            className={cn(
              "text-[9px] font-mono shrink-0 mt-0.5 tabular-nums",
              logTimestampColor(log.level)
            )}
          >
            {new Date(log.timestamp).toLocaleTimeString("en-NG", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              timeZone: "Africa/Lagos",
            })}
          </span>
          <span
            className={cn(
              "text-[10px] font-mono truncate group-hover:text-text-primary transition-colors",
              logMessageColor(log.level)
            )}
          >
            {log.message}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── OOM event log ─────────────────────────────────────────────────────────────

function OOMEvents() {
  const agents = useEventsStore((s) => [...s.agents.values()]);
  // AgentState.oomCount is set by applySystemOom; AgentResourceSnapshot.oomEvents is set per-resource
  const oomAgents = agents.filter((a) => {
    const oomFromCount = a.oomCount ?? 0;
    const oomFromResource = a.resources?.oomEvents ?? a.resource?.oomEvents ?? 0;
    return oomFromCount > 0 || oomFromResource > 0;
  });

  if (oomAgents.length === 0) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="status-dot h-1.5 w-1.5" data-status="active" />
        <span className="text-xs font-mono text-status-success">No OOM events — memory is holding up nicely</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {oomAgents.map((a) => {
        const count = a.oomCount ?? a.resources?.oomEvents ?? a.resource?.oomEvents ?? 0;
        return (
          <div key={a.id} className="flex items-center justify-between py-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="status-dot h-1.5 w-1.5 shrink-0" data-status="fatal" />
              <span className="text-[10px] font-mono text-status-error truncate max-w-35">
                {a.name ?? a.id}
              </span>
            </div>
            <span className="text-[10px] font-mono text-text-muted tabular-nums shrink-0" data-metric>
              {count}× OOM
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Health radar ─────────────────────────────────────────────────────────────

function useHealthScore() {
  const active = useEventsStore((s) => s.activeAgentCount);
  const errors = useEventsStore((s) => s.errorAgentCount);
  const total  = useEventsStore((s) => s.totalAgentCount);
  const metrics = useEventsStore((s) => s.systemMetrics);

  return useMemo(() => {
    const agentScore = total > 0
      ? Math.round(40 * (1 - errors / Math.max(total, 1)))
      : 40;

    // load1m is absolute process count; divide by core count to get utilisation ratio
    const cpuLoad = metrics?.cpu.load1m ?? 0;
    const coreCount = metrics?.cpu.coreCount ?? 1;
    const cpuRatio = coreCount > 0 ? cpuLoad / coreCount : 0;
    const cpuScore = Math.round(30 * Math.max(0, 1 - cpuRatio / 0.9));

    const memPct = metrics && metrics.memory.totalMb > 0
      ? metrics.memory.usedMb / metrics.memory.totalMb
      : 0;
    const memScore = Math.round(30 * Math.max(0, 1 - memPct / 0.9));

    const total_score = agentScore + cpuScore + memScore;

    let grade = "Critical";
    let tone = "tone-critical";
    let fill = "var(--color-status-fatal)";
    let tagline = "Swarm needs attention";

    if (total_score >= 90) {
      grade = "Optimal";
      tone = "tone-optimal";
      fill = "var(--color-status-active)";
      tagline = "Peak performance";
    } else if (total_score >= 70) {
      grade = "Healthy";
      tone = "tone-healthy";
      fill = "var(--color-status-success)";
      tagline = "All systems go";
    } else if (total_score >= 50) {
      grade = "Degraded";
      tone = "tone-degraded";
      fill = "var(--color-status-queued)";
      tagline = "Needs monitoring";
    }

    return { score: total_score, grade, tone, fill, tagline, agentScore, cpuScore, memScore, hasData: metrics != null || active > 0 };
  }, [active, errors, total, metrics]);
}

function HealthRadar() {
  const h = useHealthScore();

  const chartData = [
    { name: "Health", value: h.score, fill: h.fill },
  ];

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0 health-radar-frame">
        {h.score >= 90 && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              animation: "pulse-ring 3s ease-out infinite",
              borderRadius: "50%",
            }}
          />
        )}
        <ResponsiveContainer width={84} height={84}>
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius={28}
            outerRadius={40}
            startAngle={90}
            endAngle={-270}
            data={chartData}
          >
            <RadialBar
              dataKey="value"
              cornerRadius={4}
              background={{ fill: "var(--color-bg-elevated)" }}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-lg font-mono font-bold tabular-nums leading-none", h.tone)} data-metric>
            {h.score}
          </span>
        </div>
      </div>
      <div className="space-y-1.5 min-w-0">
        <div className={cn("text-sm font-mono font-semibold", h.tone)}>
          {h.grade}
        </div>
        <div className="text-[10px] font-mono text-text-muted">{h.tagline}</div>
        <div className="space-y-0.5 pt-0.5">
          <ScoreLine label="Agents"  pts={h.agentScore} max={40} />
          <ScoreLine label="CPU"     pts={h.cpuScore}   max={30} />
          <ScoreLine label="Memory"  pts={h.memScore}   max={30} />
        </div>
      </div>
    </div>
  );
}

function meterClassForPct(pct: number): string {
  if (pct >= 80) return "swarm-meter swarm-meter--good";
  if (pct >= 50) return "swarm-meter swarm-meter--warn";
  return "swarm-meter swarm-meter--error";
}

function ScoreLine({ label, pts, max }: { readonly label: string; readonly pts: number; readonly max: number }) {
  const pct = max > 0 ? (pts / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono text-text-muted w-12 shrink-0">{label}</span>
      <progress className={meterClassForPct(pct)} max={100} value={pct} />
      <span className="text-[9px] font-mono text-text-muted tabular-nums w-8 text-right" data-metric>
        {pts}/{max}
      </span>
    </div>
  );
}

// ── Queue pressure chart ──────────────────────────────────────────────────────

function useQueuePressureHistory(sampleMs = 10_000, maxPoints = 30) {
  const queues = useEventsStore((s) => s.queues);
  const [history, setHistory] = React.useState<{ t: number; waiting: number; active: number }[]>([]);

  React.useEffect(() => {
    const sample = () => {
      const entries = [...queues.values()];
      const waiting = entries.reduce((a, q) => a + q.waiting, 0);
      const active  = entries.reduce((a, q) => a + q.active, 0);
      setHistory((prev) => [...prev.slice(-(maxPoints - 1)), { t: Date.now(), waiting, active }]);
    };
    sample();
    const id = setInterval(sample, sampleMs);
    return () => clearInterval(id);
  }, [queues, sampleMs, maxPoints]);

  return history;
}

function QueuePressureChart() {
  const history = useQueuePressureHistory();

  if (history.length < 2) {
    return (
      <div className="flex items-center justify-center h-20">
        <span className="text-xs font-mono text-text-muted">Collecting samples…</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={72}>
      <AreaChart data={history} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="grad-waiting" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="var(--color-status-queued)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-status-queued)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-active" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="var(--color-accent)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          contentStyle={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "4px",
            fontSize: "10px",
            fontFamily: "JetBrains Mono, monospace",
            color: "var(--color-text-secondary)",
          }}
          labelFormatter={(_, payload) => {
            const item = payload?.[0]?.payload as { t?: number } | undefined;
            const t = item?.t;
            if (t == null) return "";
            return new Date(t).toLocaleTimeString("en-NG", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              timeZone: "Africa/Lagos",
            });
          }}
          formatter={(value: number, name: string) => [value, name === "waiting" ? "Queued" : "Active"]}
        />
        <Area
          type="monotone"
          dataKey="waiting"
          stroke="var(--color-status-queued)"
          strokeWidth={1.5}
          fill="url(#grad-waiting)"
          dot={false}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="active"
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          fill="url(#grad-active)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function OOMPanel() {
  const agents = useEventsStore((s) => [...s.agents.values()]);
  const hasOOM = agents.some((a) => {
    return (a.oomCount ?? 0) > 0 || (a.resources?.oomEvents ?? a.resource?.oomEvents ?? 0) > 0;
  });

  return (
    <Panel title="OOM Events" variant={hasOOM ? "danger" : "default"} className="stagger-3">
      <OOMEvents />
    </Panel>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const governorState = useEventsStore((s) => s.governorState);
  const startupSummary = useEventsStore((s) => s.startupSummary);
  const apiHealth = useApiHealth();
  const pressureLevel = governorState?.pressureLevel ?? startupSummary?.pressureLevel;
  const availableMb = governorState?.availableMb ?? startupSummary?.availableMb ?? null;
  const ollamaOnline = apiHealth.ollamaOnline ?? startupSummary?.ollamaReachable ?? null;

  return (
    <div className="p-4 space-y-4">
      <RouteDegradedBanner
        pressureLevel={pressureLevel}
        availableMb={availableMb}
        apiOnline={apiHealth.apiOnline}
        ollamaOnline={ollamaOnline}
      />

      {/* AI Insight strip */}
      <InsightStrip />

      {/* Real-time High-Contrast Telemetry Observability */}
      <TelemetryWidget />

      {/* Bento top strip: Health Radar + 4 quick stats */}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="md:col-span-1 bg-bg-surface border border-border rounded-lg px-4 py-3 card-interactive panel-enter">
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <span className="status-dot h-1.5 w-1.5" data-status="active" />
            System Health
          </div>
          <HealthRadar />
        </div>
        <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickStatCard />
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Agent fleet matrix */}
          <Panel title="Agent Fleet" live className="stagger-1">
            <AgentStatusMatrix />
          </Panel>

          {/* Control plane health */}
          <Panel title="Control Plane" live className="stagger-2">
            <ControlPlaneHealth />
          </Panel>

          {/* Queue depth table + pressure chart */}
          <Panel title="Job Queues — BullMQ" live className="stagger-3">
            <QueueDepthPanel />
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-[9px] font-mono text-text-muted uppercase tracking-wide mb-1">
                Queue Pressure (30 s window)
              </div>
              <QueuePressureChart />
            </div>
          </Panel>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* System resources */}
          <Panel title="System Resources" live className="stagger-2">
            <SystemResourcePanel />
          </Panel>

          {/* OOM events */}
          <OOMPanel />

          {/* Recent events */}
          <Panel title="Recent Events" live className="stagger-4">
            <RecentEventsFeed />
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Quick stat cards ──────────────────────────────────────────────────────────

function QuickStatCard() {
  const active = useEventsStore((s) => s.activeAgentCount);
  const total = useEventsStore((s) => s.totalAgentCount);
  const errors = useEventsStore((s) => s.errorAgentCount);
  const metrics = useEventsStore((s) => s.systemMetrics);
  const queues = useEventsStore((s) => s.queues);

  const cpuLoad = metrics?.cpu.load1m ?? null;
  const memPct = metrics == null || metrics.memory.totalMb <= 0
    ? null
    : (metrics.memory.usedMb / metrics.memory.totalMb) * 100;
  const totalWaiting = [...(queues?.values() ?? [])].reduce((a, q) => a + q.waiting, 0);

  const cards = [
    {
      label: "Active Agents",
      value: active.toString(),
      sub: `${total} total`,
      alert: errors > 0,
      alertText: `${errors} errors`,
      icon: "🤖",
    },
    {
      label: "CPU Load",
      value: cpuLoad == null ? "–" : formatPct((cpuLoad / (metrics?.cpu.coreCount ?? 1)) * 100),
      sub: metrics ? `${metrics.cpu.coreCount ?? 1} cores` : undefined,
      alert: cpuLoad != null && (cpuLoad / (metrics?.cpu.coreCount ?? 1)) > 0.8,
      icon: "⚡",
    },
    {
      label: "Memory",
      value: memPct == null ? "–" : formatPct(memPct),
      sub: metrics ? `${Math.round(metrics.memory.usedMb / 1024)} / ${Math.round(metrics.memory.totalMb / 1024)} GB` : undefined,
      alert: memPct != null && memPct > 85,
      icon: "🧠",
    },
    {
      label: "Queued Jobs",
      value: totalWaiting.toString(),
      sub: `${queues.size} queues`,
      alert: false,
      icon: "📋",
    },
  ] as const;

  const staggerClass = ["stagger-1", "stagger-2", "stagger-3", "stagger-4"] as const;

  return (
    <>
      {cards.map((card, idx) => (
        <div
          key={card.label}
          className={cn(
            "bg-bg-surface border border-border rounded-lg px-4 py-3 panel-enter card-interactive",
            staggerClass[idx],
            card.alert && "panel-variant-warn"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] font-mono text-text-muted uppercase tracking-wide">
              {card.label}
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-xl font-mono font-semibold tabular-nums num-enter",
                card.alert ? "text-status-warning" : "text-text-primary"
              )}
              data-metric
            >
              {card.value}
            </span>
            {"sub" in card && card.sub && (
              <span className="text-[10px] font-mono text-text-muted">{card.sub}</span>
            )}
          </div>
          {"alertText" in card && card.alert && card.alertText && (
            <div className="text-[9px] font-mono text-status-error mt-0.5 alert-wiggle">{card.alertText}</div>
          )}
        </div>
      ))}
    </>
  );
}
