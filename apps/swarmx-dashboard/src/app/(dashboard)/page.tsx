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
import type { AgentState, LogEntry } from "@swarmx/types";

import {
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Brain,
  Bot,
  Cpu,
  Clapperboard,
  Workflow,
  Sparkles,
  AudioLines,
  Layers3,
  WandSparkles,
  Volume2,
  ShieldCheck,
  Activity,
  Layers,
  Gauge,
  ArrowRight,
} from "lucide-react";

// ── Type helpers ──────────────────────────────────────────────────────────────

/** Map AgentStatus → CSS data-status value (passes through for all defined statuses). */
function agentDataStatus(status: AgentState["status"]): string {
  if (status === "running" || status === "active" || status === "activating") return "active";
  if (status === "success") return "success";
  if (status === "queued") return "queued";
  if (status === "throttled") return "throttled";
  if (status === "reload" || status === "reloading") return "reloading";
  if (status === "deactivating" || status === "paused") return "idle";
  if (
    status === "fatal" ||
    status === "failed_permanent" ||
    status === "oom_killed" ||
    status === "oom" ||
    status === "killed"
  ) return "fatal";
  if (status === "error" || status === "failed") return "error";
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
    <div className="flex flex-col gap-2 insight-strip">
      {insights.map((ins) => (
        <div
          key={ins.id}
          className={cn(
            "flex items-center justify-between px-4 py-2.5 rounded-lg border text-xs font-mono",
            ins.type === "error" && "insight-error",
            ins.type === "warn" && "insight-warn",
            ins.type === "success" && "insight-success",
            ins.type === "info" && "insight-info"
          )}
        >
          <div className="flex items-center gap-2.5">
            {ins.type === "error" && <AlertTriangle className="h-4 w-4 shrink-0 text-status-error" />}
            {ins.type === "warn" && <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" />}
            {ins.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success" />}
            {ins.type === "info" && <Brain className="h-4 w-4 shrink-0 text-accent" />}
            <span>{ins.message}</span>
          </div>
          {ins.action && ins.href && (
            <Link
              href={ins.href}
              className="shrink-0 ml-4 underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity font-medium"
            >
              {ins.action}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Standard Panel ────────────────────────────────────────────────────────────

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
        "flex flex-col bg-bg-surface border border-border rounded-xl overflow-hidden panel-enter card-interactive",
        live && "live-panel-edge",
        variant === "danger" && "panel-variant-danger",
        variant === "warn" && "panel-variant-warn",
        className
      )}
    >
      <header className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {live && (
            <span
              className="status-dot h-2 w-2 shrink-0"
              data-status="active"
              aria-label="Live data"
            />
          )}
          {variant === "danger" && !live && (
            <span
              className="status-dot h-2 w-2 shrink-0"
              data-status="error"
              aria-label="Error state"
            />
          )}
          <h3 className="font-heading text-xs font-semibold text-text-primary tracking-tight">
            {title}
          </h3>
          {badge}
        </div>
        {loading && (
          <span className="text-[11px] font-mono text-text-muted animate-pulse">loading…</span>
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
  if (delta > 2) return <TrendingUp className="h-3.5 w-3.5 text-status-error" aria-label="Increasing" />;
  if (delta < -2) return <TrendingDown className="h-3.5 w-3.5 text-status-success" aria-label="Decreasing" />;
  return <Minus className="h-3.5 w-3.5 text-text-muted" aria-label="Stable" />;
}

// ── Zone 1: Executive Studio Header ───────────────────────────────────────────

function ExecutiveStudioHeader() {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-bg-surface border border-border rounded-xl p-5 card-interactive panel-enter">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg border border-border-accent bg-[var(--color-accent-dim)] font-mono text-xs font-bold text-accent">
            YE
          </span>
          <h1 className="font-heading text-xl font-bold text-text-primary tracking-tight">
            The Yap Engine Studio Hub
          </h1>
          <div className="flex items-center gap-1.5 ml-1">
            <span className="rounded-full border border-border bg-bg-elevated px-2.5 py-0.5 font-mono text-[11px] text-accent font-medium">
              v5 Production
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-2.5 py-0.5 font-mono text-[11px] text-text-secondary">
              <span className="status-dot h-1.5 w-1.5 shrink-0" data-status="active" />
              Kokoro Neural Audio
            </span>
            <span className="rounded-full border border-border bg-bg-elevated px-2.5 py-0.5 font-mono text-[11px] text-text-muted hidden sm:inline-block">
              Single-7B Lock · 16GB Profile
            </span>
          </div>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed max-w-3xl">
          Autonomous 9:16 short-form video swarm · Studio-grade Kokoro narration with syllable alignment · Word-synced captions · Local-first multi-agent DAG
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/video/studio"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-xs font-semibold text-bg-base transition-all hover:opacity-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Clapperboard className="size-4" aria-hidden="true" />
          <span>Create Video</span>
        </Link>
        <Link
          href="/video"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-4 py-2.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Workflow className="size-3.5 text-accent" aria-hidden="true" />
          <span>Queue</span>
        </Link>
        <Link
          href="/video?view=review"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-4 py-2.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <WandSparkles className="size-3.5 text-accent" aria-hidden="true" />
          <span>Review</span>
        </Link>
      </div>
    </div>
  );
}

// ── Zone 1: Executive Stat Cards ──────────────────────────────────────────────

function ExecutiveStatCards() {
  const active = useEventsStore((s) => s.activeAgentCount);
  const total = useEventsStore((s) => s.totalAgentCount);
  const errors = useEventsStore((s) => s.errorAgentCount);
  const metrics = useEventsStore((s) => s.systemMetrics);
  const queues = useEventsStore((s) => s.queues);

  const cpuLoad = metrics?.cpu.load1m ?? null;
  const coreCount = metrics?.cpu.coreCount ?? 1;
  const cpuPct = cpuLoad != null && coreCount > 0 ? (cpuLoad / coreCount) * 100 : null;

  const memPct = metrics == null || metrics.memory.totalMb <= 0
    ? null
    : (metrics.memory.usedMb / metrics.memory.totalMb) * 100;
  const memUsedGb = metrics ? (metrics.memory.usedMb / 1024).toFixed(1) : null;
  const memTotalGb = metrics ? (metrics.memory.totalMb / 1024).toFixed(0) : null;

  const totalWaiting = [...(queues?.values() ?? [])].reduce((a, q) => a + q.waiting, 0);
  const totalActive = [...(queues?.values() ?? [])].reduce((a, q) => a + q.active, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {/* 1. Agent Fleet */}
      <div className={cn(
        "bg-bg-surface border border-border rounded-xl p-4 panel-enter card-interactive flex flex-col justify-between",
        errors > 0 && "panel-variant-warn"
      )}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-heading font-medium text-text-secondary">
            Fleet Matrix
          </span>
          <Bot className="size-4 text-accent" aria-hidden="true" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-bold text-text-primary tabular-nums" data-metric>
            {active}
          </span>
          <span className="text-xs font-mono text-text-muted">/ {total} active</span>
        </div>
        <div className="mt-2.5 pt-2 border-t border-border flex items-center justify-between text-[11px] font-mono">
          {errors > 0 ? (
            <span className="text-status-error font-medium">{formatErrorCount(errors)}</span>
          ) : (
            <span className="text-status-success flex items-center gap-1">
              <span className="status-dot h-1.5 w-1.5" data-status="active" />
              All agents nominal
            </span>
          )}
          <span className="text-text-muted">max 1 active 7B</span>
        </div>
      </div>

      {/* 2. Host Compute & RAM */}
      <div className="bg-bg-surface border border-border rounded-xl p-4 panel-enter card-interactive flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-heading font-medium text-text-secondary">
            Host Resources
          </span>
          <Cpu className="size-4 text-accent" aria-hidden="true" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-bold text-text-primary tabular-nums" data-metric>
            {cpuPct != null ? `${Math.round(cpuPct)}%` : "–"}
          </span>
          <span className="text-xs font-mono text-text-muted">
            {memUsedGb ? `${memUsedGb} / ${memTotalGb} GB` : "Memory"}
          </span>
        </div>
        <div className="mt-2.5 pt-2 border-t border-border flex items-center justify-between text-[11px] font-mono">
          <span className="text-text-secondary">
            RAM {memPct != null ? `${Math.round(memPct)}%` : "–"}
          </span>
          <span className={cn(
            memPct && memPct > 85 ? "text-status-warning" : "text-status-success"
          )}>
            {memPct && memPct > 85 ? "Pressure High" : "RAM Guard Safe"}
          </span>
        </div>
      </div>

      {/* 3. Audio & Kokoro Engine */}
      <div className="bg-bg-surface border border-border rounded-xl p-4 panel-enter card-interactive flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-heading font-medium text-text-secondary">
            Voice & Synthesis
          </span>
          <Volume2 className="size-4 text-accent" aria-hidden="true" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-mono font-bold text-text-primary tracking-tight">
            Kokoro-82M
          </span>
          <span className="text-xs font-mono text-status-success">Ready</span>
        </div>
        <div className="mt-2.5 pt-2 border-t border-border flex items-center justify-between text-[11px] font-mono">
          <span className="text-text-secondary">-14 LUFS Broadcast</span>
          <span className="text-accent">Syllable Sync</span>
        </div>
      </div>

      {/* 4. BullMQ Pipeline Queue */}
      <div className="bg-bg-surface border border-border rounded-xl p-4 panel-enter card-interactive flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-heading font-medium text-text-secondary">
            Pipeline Queue
          </span>
          <Workflow className="size-4 text-accent" aria-hidden="true" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-bold text-text-primary tabular-nums" data-metric>
            {totalWaiting}
          </span>
          <span className="text-xs font-mono text-text-muted">queued · {totalActive} active</span>
        </div>
        <div className="mt-2.5 pt-2 border-t border-border flex items-center justify-between text-[11px] font-mono">
          <span className="text-text-secondary">{queues.size} BullMQ queues</span>
          <Link href="/video" className="text-accent hover:underline">Inspect →</Link>
        </div>
      </div>
    </div>
  );
}

// ── Zone 2: Creative Production Suite ─────────────────────────────────────────

const CREATIVE_WORKFLOWS = [
  {
    href: "/video/studio",
    label: "Studio Video Pipeline",
    description: "Brief → concept → script → storyboard → FFmpeg render",
    icon: Clapperboard,
    tag: "Core",
  },
  {
    href: "/video?view=audio",
    label: "Kokoro Voice & Prosody",
    description: "Multi-voice profiles, speed curves and syllable anchors",
    icon: AudioLines,
    tag: "Neural",
  },
  {
    href: "/video?view=backgrounds",
    label: "Background & Motion Lab",
    description: "Visual depth, kinetic text timing and 2–3s scene cuts",
    icon: Layers3,
    tag: "Visuals",
  },
  {
    href: "/video?view=review",
    label: "Deterministic QC & Review",
    description: "Quality gates, alignment drift check and platform delivery",
    icon: WandSparkles,
    tag: "Quality",
  },
] as const;

const PIPELINE_STAGES = [
  { step: "01", name: "Intent", role: "Pilot", desc: "Brief analysis" },
  { step: "02", name: "Planning", role: "Architect", desc: "Scene graph" },
  { step: "03", name: "Scripting", role: "Architect", desc: "Voice prose" },
  { step: "04", name: "Storyboard", role: "Architect", desc: "Visual frames" },
  { step: "05", name: "Render", role: "FFmpeg", desc: "1080x1920 9:16" },
  { step: "06", name: "Finalizing", role: "Oracle", desc: "QC & platform" },
] as const;

function CreativeProductionSuite() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Left Column: Creative Workflows + Visual Pipeline (8 cols) */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        {/* Workflow Action Cards */}
        <section className="bg-bg-surface border border-border rounded-xl p-5 card-interactive panel-enter">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-text-muted">
                <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
                Creative Production Center
              </div>
              <h2 className="mt-1 font-heading text-sm font-semibold text-text-primary tracking-tight">
                Production-Ready 9:16 Creation Workflows
              </h2>
            </div>
            <span className="rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-[11px] font-mono text-accent font-medium">
              Audio-First Pipeline
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CREATIVE_WORKFLOWS.map(({ href, label, description, icon: Icon, tag }) => (
              <Link
                key={label}
                href={href}
                className="group rounded-lg border border-border bg-bg-elevated/40 p-3.5 transition-all hover:border-accent/40 hover:bg-bg-elevated flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-md bg-bg-surface border border-border text-accent group-hover:scale-105 transition-transform">
                      <Icon className="size-4" aria-hidden="true" />
                    </div>
                    <span className="font-heading text-xs font-semibold text-text-primary group-hover:text-accent transition-colors">
                      {label}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-text-muted border border-border rounded px-1.5 py-0.5">
                    {tag}
                  </span>
                </div>
                <p className="mt-2.5 text-xs text-text-secondary leading-relaxed">
                  {description}
                </p>
                <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-text-muted pt-2 border-t border-border/60">
                  <span className="group-hover:text-text-secondary transition-colors">Open studio view</span>
                  <ArrowRight className="size-3 text-text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            ))}
          </div>

          {/* Pipeline Stage Tracker */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3 text-xs font-mono">
              <span className="text-text-muted uppercase tracking-wider text-[11px]">Immutable Video Pipeline Stages</span>
              <span className="text-accent text-[11px]">Deterministic Execution</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {PIPELINE_STAGES.map((stg) => (
                <div key={stg.step} className="rounded-md border border-border bg-bg-elevated/30 p-2.5 text-center">
                  <div className="text-[10px] font-mono text-text-muted">{stg.step}</div>
                  <div className="text-xs font-heading font-semibold text-text-primary mt-0.5">{stg.name}</div>
                  <div className="text-[10px] font-mono text-accent mt-1">{stg.role}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Right Column: Health Radar + Quality Gates (4 cols) */}
      <div className="lg:col-span-4 flex flex-col gap-4">
        {/* Health Radar Card */}
        <section className="bg-bg-surface border border-border rounded-xl p-5 card-interactive panel-enter flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="status-dot h-2 w-2" data-status="active" />
              <h3 className="font-heading text-xs font-semibold text-text-primary tracking-tight">
                System Health Radar
              </h3>
            </div>
            <span className="text-[11px] font-mono text-text-muted">Live telemetry</span>
          </div>
          <HealthRadar />
        </section>

        {/* Quality Gate Telemetry Card */}
        <section className="bg-bg-surface border border-border rounded-xl p-5 card-interactive panel-enter">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-status-success" aria-hidden="true" />
              <h3 className="font-heading text-xs font-semibold text-text-primary tracking-tight">
                Quality Gate Compliance
              </h3>
            </div>
            <span className="rounded-full border border-status-success/30 bg-status-success/10 px-2 py-0.5 text-[10px] font-mono text-status-success font-semibold">
              PRODUCTION_PACK
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between py-1 border-b border-border/60">
              <span className="text-text-muted">G-V Neural Local Voice</span>
              <span className="text-status-success flex items-center gap-1 font-semibold">
                <CheckCircle2 className="size-3" /> Kokoro-82M
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/60">
              <span className="text-text-muted">G-A Word Drift Tolerance</span>
              <span className="text-status-success flex items-center gap-1 font-semibold">
                <CheckCircle2 className="size-3" /> ≤ 400ms (50ms)
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/60">
              <span className="text-text-muted">G-M Loudness Standard</span>
              <span className="text-status-success flex items-center gap-1 font-semibold">
                <CheckCircle2 className="size-3" /> -14 LUFS ± 2
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/60">
              <span className="text-text-muted">G-C Word-Synced Captions</span>
              <span className="text-status-success flex items-center gap-1 font-semibold">
                <CheckCircle2 className="size-3" /> Bold Center ASS
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-text-muted">G-K Visual Cadence</span>
              <span className="text-status-success flex items-center gap-1 font-semibold">
                <CheckCircle2 className="size-3" /> 2.8s Cuts
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Health Radar Component ───────────────────────────────────────────────────

function useHealthScore() {
  const active = useEventsStore((s) => s.activeAgentCount);
  const errors = useEventsStore((s) => s.errorAgentCount);
  const total = useEventsStore((s) => s.totalAgentCount);
  const metrics = useEventsStore((s) => s.systemMetrics);

  return useMemo(() => {
    const agentScore = total > 0
      ? Math.round(40 * (1 - errors / Math.max(total, 1)))
      : 40;

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
    let tone = "text-status-fatal";
    let fill = "var(--color-status-fatal)";
    let tagline = "Swarm needs attention";

    if (total_score >= 90) {
      grade = "Optimal";
      tone = "text-status-active";
      fill = "var(--color-status-active)";
      tagline = "Peak swarm performance";
    } else if (total_score >= 70) {
      grade = "Healthy";
      tone = "text-status-success";
      fill = "var(--color-status-success)";
      tagline = "All systems operational";
    } else if (total_score >= 50) {
      grade = "Degraded";
      tone = "text-status-warning";
      fill = "var(--color-status-queued)";
      tagline = "Resources under pressure";
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
        <ResponsiveContainer width={90} height={90}>
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius={30}
            outerRadius={44}
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
          <span className={cn("text-xl font-mono font-bold tabular-nums leading-none", h.tone)} data-metric>
            {h.score}
          </span>
        </div>
      </div>
      <div className="space-y-1.5 min-w-0 flex-1">
        <div className={cn("text-sm font-heading font-bold", h.tone)}>
          {h.grade}
        </div>
        <div className="text-[11px] font-mono text-text-muted">{h.tagline}</div>
        <div className="space-y-1 pt-1">
          <ScoreLine label="Agents" pts={h.agentScore} max={40} />
          <ScoreLine label="CPU" pts={h.cpuScore} max={30} />
          <ScoreLine label="Memory" pts={h.memScore} max={30} />
        </div>
      </div>
    </div>
  );
}

function ScoreLine({ label, pts, max }: { readonly label: string; readonly pts: number; readonly max: number }) {
  const pct = max > 0 ? (pts / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-text-muted w-14 shrink-0">{label}</span>
      <progress className={pct >= 80 ? "swarm-meter swarm-meter--good" : pct >= 50 ? "swarm-meter swarm-meter--warn" : "swarm-meter swarm-meter--error"} max={100} value={pct} />
      <span className="text-[10px] font-mono text-text-muted tabular-nums w-8 text-right" data-metric>
        {pts}/{max}
      </span>
    </div>
  );
}

// ── Agent Status Matrix ───────────────────────────────────────────────────────

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
          <span className="text-xs font-mono text-text-muted text-center leading-relaxed">
            Your fleet is standing by.<br />
            <span className="text-text-muted/60">Run <code className="text-accent">swarm up</code> to deploy agents.</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Summary numbers */}
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-mono font-bold text-text-primary tabular-nums" data-metric>
          {active}
        </span>
        <span className="text-xs font-mono text-text-muted">/ {total} running</span>
        {errors > 0 && (
          <span className="ml-auto text-xs font-mono text-status-error font-semibold">
            {formatErrorCount(errors)}
          </span>
        )}
        {errors === 0 && active > 0 && (
          <span className="ml-auto ai-chip">
            <Zap className="h-3 w-3" />
            optimal
          </span>
        )}
      </div>

      {/* Dot matrix */}
      <ul className="flex flex-wrap gap-2" aria-label="Agent statuses">
        {visibleAgents.map((agent) => (
          <li
            key={agent.id}
            className="status-dot h-3.5 w-3.5 rounded-full"
            data-status={agentDataStatus(agent.status)}
            title={`${agent.name ?? agent.id}: ${agent.status}`}
          />
        ))}
        {extraAgents > 0 && (
          <li className="text-xs font-mono text-text-muted self-center list-none">
            +{extraAgents}
          </li>
        )}
      </ul>
    </div>
  );
}

// ── Control Plane Layer Health ────────────────────────────────────────────────

const CONTROL_PLANE_LAYERS = [
  { id: "intake", label: "Intake", description: "Goal parsing + validation" },
  { id: "planning", label: "Planning", description: "Task DAG" },
  { id: "dispatch", label: "Dispatch", description: "Agent routing" },
  { id: "execution", label: "Execution", description: "Task runner" },
  { id: "synthesis", label: "Synthesis", description: "Result aggregation" },
  { id: "eval", label: "Eval", description: "QC gate" },
  { id: "memory", label: "Memory", description: "RAG & persistence" },
] as const;

function ControlPlaneHealth() {
  const layers = useEventsStore((s) => s.controlPlaneLayers);

  if (layers.size === 0) {
    return (
      <div className="space-y-2">
        {CONTROL_PLANE_LAYERS.map((layer) => (
          <div key={layer.id} className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full skeleton shrink-0" />
            <span className="text-xs font-mono text-text-muted w-24 shrink-0">{layer.label}</span>
            <div className="flex-1 h-3.5 skeleton rounded" />
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
    <div className="space-y-2">
      {CONTROL_PLANE_LAYERS.map((layer) => {
        const state = layers.get(layer.id);
        const status = state?.status ?? "nominal";
        return (
          <div key={layer.id} className="flex items-center gap-2.5 group">
            <span
              className="status-dot h-2 w-2 shrink-0"
              data-status={layerDataStatus(status)}
            />
            <span className="text-xs font-mono text-text-secondary w-24 shrink-0 font-medium">
              {layer.label}
            </span>
            <div className="flex-1 h-px bg-border/60" />
            <span className="text-[11px] font-mono text-text-muted capitalize group-hover:text-text-secondary transition-colors">
              {status}
            </span>
            {state?.latencyP50Ms != null && (
              <span
                className={cn(
                  "text-[11px] font-mono tabular-nums w-12 text-right",
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
      {allHealthy && (
        <div className="pt-2 flex items-center gap-2">
          <CheckCircle2 className="size-3.5 text-status-success" />
          <span className="text-xs font-mono text-status-success font-medium">All control plane layers nominal</span>
        </div>
      )}
    </div>
  );
}

// ── System Resource Gauges ───────────────────────────────────────────────────

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
    <div className="space-y-1.5 group">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-text-muted uppercase tracking-wide">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <TrendIcon delta={pct >= critical ? 5 : pct >= warn ? 2 : -3} />
          <span
            className={cn(
              "text-xs font-mono text-text-secondary tabular-nums font-medium",
              pct >= critical ? "text-status-error font-bold" : pct >= warn ? "text-status-warning" : ""
            )}
            data-metric
          >
            {Math.round(pct)}%
            <span className="text-text-muted ml-1 text-[11px]">
              ({Math.round(value)}/{Math.round(max)}{unit})
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
          <div key={`resource-skeleton-${item}`} className="space-y-1.5">
            <div className="h-3.5 skeleton rounded w-full" />
            <div className="h-2 skeleton rounded-full w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <ResourceGauge
        label="Host CPU (All Cores)"
        value={(metrics.cpu.load1m / (metrics.cpu.coreCount ?? 1)) * 100}
        max={100}
        unit="%"
        warn={60}
        critical={85}
      />
      <ResourceGauge
        label="Physical RAM"
        value={metrics.memory.usedMb / 1024}
        max={metrics.memory.totalMb / 1024}
        unit=" GB"
        warn={70}
        critical={85}
      />
      <ResourceGauge
        label="Yap Engine RAM Slice"
        value={metrics.memory.swarmxSliceMb}
        max={metrics.memory.totalMb * 0.5}
        unit=" MB"
        warn={60}
        critical={80}
      />
      <div className="pt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border">
        <MetricCell label="Disk Read" value={formatBps(metrics.disk.readBytesPerSec)} />
        <MetricCell label="Disk Write" value={formatBps(metrics.disk.writeBytesPerSec)} />
        <MetricCell label="Network In" value={formatBps(metrics.network.rxBytesPerSec)} />
        <MetricCell label="Network Out" value={formatBps(metrics.network.txBytesPerSec)} />
      </div>
    </div>
  );
}

function MetricCell({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs font-mono text-text-muted">{label}</span>
      <span className="text-xs font-mono text-text-secondary tabular-nums font-medium" data-metric>{value}</span>
    </div>
  );
}

// ── Queue Depth Panel ────────────────────────────────────────────────────────

function QueueDepthPanel() {
  const queues = useEventsStore((s) => s.queues);

  if (queues.size === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-5">
        <span className="text-xs font-mono text-text-muted">No active queues</span>
        <span className="text-[11px] font-mono text-text-muted/60">
          Jobs will appear here once submitted to the swarm
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-mono text-text-muted uppercase tracking-wider pb-1.5 border-b border-border">
        <span>Queue Name</span>
        <div className="flex gap-4">
          <span className="w-9 text-right">Wait</span>
          <span className="w-9 text-right">Act</span>
          <span className="w-9 text-right">Del</span>
          <span className="w-9 text-right">Fail</span>
        </div>
      </div>
      {[...queues.entries()].map(([name, q]) => (
        <div key={name} className="flex items-center justify-between py-1 group hover:bg-bg-elevated/40 rounded px-1 -mx-1 transition-colors">
          <span className="text-xs font-mono text-text-secondary truncate max-w-[130px]">
            {name}
          </span>
          <div className="flex gap-4">
            <span className={cn("text-xs font-mono tabular-nums w-9 text-right", q.waiting > 0 ? "text-status-queued font-bold" : "text-text-muted")} data-metric>
              {q.waiting}
            </span>
            <span className={cn("text-xs font-mono tabular-nums w-9 text-right", q.active > 0 ? "text-status-active font-bold" : "text-text-muted")} data-metric>
              {q.active}
            </span>
            <span className="text-xs font-mono tabular-nums w-9 text-right text-text-muted" data-metric>
              {q.delayed}
            </span>
            <span className={cn("text-xs font-mono tabular-nums w-9 text-right", q.failed > 0 ? "text-status-error font-bold" : "text-text-muted")} data-metric>
              {q.failed}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Queue Pressure Chart ─────────────────────────────────────────────────────

function useQueuePressureHistory(sampleMs = 10_000, maxPoints = 30) {
  const queues = useEventsStore((s) => s.queues);
  const [history, setHistory] = React.useState<{ t: number; waiting: number; active: number }[]>([]);

  React.useEffect(() => {
    const sample = () => {
      const entries = [...queues.values()];
      const waiting = entries.reduce((a, q) => a + q.waiting, 0);
      const active = entries.reduce((a, q) => a + q.active, 0);
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
        <span className="text-xs font-mono text-text-muted">Collecting pressure samples…</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={75}>
      <AreaChart data={history} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="grad-waiting" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-status-queued)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-status-queued)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-active" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          contentStyle={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "6px",
            fontSize: "11px",
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

// ── OpenClaw Model Stack & Execution Boundary ─────────────────────────────────

const OPENCLAW_MODELS = [
  { role: "Forge", model: "Qwen3 8B", quant: "Q4_K_M", size: "~5.2 GB", desc: "Agent code generation", icon: Brain },
  { role: "Relay", model: "Qwen3 4B", quant: "Q4_K_M", size: "~2.6 GB", desc: "Routing & low-latency tasks", icon: Cpu },
  { role: "Vision", model: "Qwen3-VL 4B", quant: "Q4_K_M", size: "~3.3 GB", desc: "Storyboard composition & OCR", icon: WandSparkles },
] as const;

function OpenClawStackPanel() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {OPENCLAW_MODELS.map(({ role, model, quant, size, desc, icon: Icon }) => (
          <div key={role} className="rounded-lg border border-border bg-bg-elevated/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">{role}</span>
              <Icon className="size-3.5 text-accent" />
            </div>
            <div className="mt-1 font-heading text-xs font-semibold text-text-primary">{model}</div>
            <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-text-muted">
              <span>{quant}</span>
              <span>·</span>
              <span>{size}</span>
            </div>
            <div className="mt-1 text-[11px] text-text-muted leading-tight">{desc}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border text-[11px] font-mono text-text-muted">
        <span>Single-7B active at a time</span>
        <span>keep-alive 0s</span>
        <span className="text-accent">16 GB CPU Bound</span>
      </div>
    </div>
  );
}

// ── Recent Events Feed ────────────────────────────────────────────────────────

function RecentEventsFeed() {
  const logs = useEventsStore((s) => s.logs.slice(-8) as LogEntry[]);
  const reversed = useMemo(() => [...logs].reverse(), [logs]);

  if (reversed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-24 gap-1.5">
        <span className="text-xs font-mono text-text-muted">Quiet out there…</span>
        <span className="text-[11px] font-mono text-text-muted/60">Events will stream in real-time</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-56 overflow-y-auto">
      {reversed.map((log, i) => (
        <div key={log.id ?? `${log.timestamp}-${i}`} className="flex items-start gap-2.5 group">
          <span
            className={cn(
              "text-[10px] font-mono shrink-0 mt-0.5 tabular-nums",
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
              "text-xs font-mono truncate group-hover:text-text-primary transition-colors",
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

// ── OOM Events Log ────────────────────────────────────────────────────────────

function OOMEvents() {
  const agents = useEventsStore((s) => [...s.agents.values()]);
  const oomAgents = agents.filter((a) => {
    const oomFromCount = a.oomCount ?? 0;
    const oomFromResource = a.resources?.oomEvents ?? a.resource?.oomEvents ?? 0;
    return oomFromCount > 0 || oomFromResource > 0;
  });

  if (oomAgents.length === 0) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs font-mono text-status-success font-medium">
        <CheckCircle2 className="size-4 text-status-success shrink-0" />
        <span>No OOM events — memory isolation is holding steady</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {oomAgents.map((a) => {
        const count = a.oomCount ?? a.resources?.oomEvents ?? a.resource?.oomEvents ?? 0;
        return (
          <div key={a.id} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="status-dot h-2 w-2 shrink-0" data-status="fatal" />
              <span className="text-xs font-mono text-status-error truncate">
                {a.name ?? a.id}
              </span>
            </div>
            <span className="text-xs font-mono text-text-muted tabular-nums shrink-0" data-metric>
              {count}× OOM
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Overview Page ────────────────────────────────────────────────────────

export default function OverviewPage() {
  const governorState = useEventsStore((s) => s.governorState);
  const startupSummary = useEventsStore((s) => s.startupSummary);
  const apiHealth = useApiHealth();
  const pressureLevel = governorState?.pressureLevel ?? startupSummary?.pressureLevel;
  const availableMb = governorState?.availableMb ?? startupSummary?.availableMb ?? null;
  const ollamaOnline = apiHealth.ollamaOnline ?? startupSummary?.ollamaReachable ?? null;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Route Degraded / Warning Banner */}
      <RouteDegradedBanner
        pressureLevel={pressureLevel}
        availableMb={availableMb}
        apiOnline={apiHealth.apiOnline}
        ollamaOnline={ollamaOnline}
      />

      {/* Zone 1: Executive Studio Header */}
      <ExecutiveStudioHeader />

      {/* Zone 1: Executive 4-Card Stat Strip */}
      <ExecutiveStatCards />

      {/* Zone 2: Creative Production Suite & Quality Gate Telemetry */}
      <CreativeProductionSuite />

      {/* Conditional Insight Strip (Errors, High Queues, Memory Alerts) */}
      <InsightStrip />

      {/* Zone 3: Swarm Operations & Deep Diagnostics (2-Column Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Column: Fleet, Control Plane & Queues */}
        <div className="space-y-5">
          {/* Agent Fleet Matrix */}
          <Panel title="Agent Fleet Matrix" live>
            <AgentStatusMatrix />
          </Panel>

          {/* Control Plane DAG */}
          <Panel title="Control Plane DAG Health" live>
            <ControlPlaneHealth />
          </Panel>

          {/* Job Queues (BullMQ) */}
          <Panel title="BullMQ Queue Depths & Real-Time Pressure" live>
            <QueueDepthPanel />
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-xs font-heading font-medium text-text-muted mb-2">
                Queue Pressure Trend (30s window)
              </div>
              <QueuePressureChart />
            </div>
          </Panel>
        </div>

        {/* Right Column: Hardware Telemetry, Model Stack, OOM, Events */}
        <div className="space-y-5">
          {/* System Hardware Resources */}
          <Panel title="Host System Resources & I/O" live>
            <SystemResourcePanel />
          </Panel>

          {/* OpenClaw Model Stack */}
          <Panel title="OpenClaw Local Model Stack & Isolation" live>
            <OpenClawStackPanel />
          </Panel>

          {/* OOM Isolation Reassurance */}
          <Panel title="Memory Isolation & OOM Guard" live>
            <OOMEvents />
          </Panel>

          {/* Recent Live Events Stream */}
          <Panel title="Real-Time Event Stream" live>
            <RecentEventsFeed />
          </Panel>
        </div>
      </div>
    </div>
  );
}
