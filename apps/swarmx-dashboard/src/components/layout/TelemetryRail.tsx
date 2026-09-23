"use client";

import React, { useMemo } from "react";
import { cn, formatBps, formatPct } from "@/lib/utils";
import { useEventsStore } from "@/stores/events";
import { useUIStore } from "@/stores/ui";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DisclosureModeBadge } from "@/components/ui/disclosure-mode-badge";
import { Cpu, MemoryStick, HardDrive, Network, Bot, AlertCircle, Zap, Gauge, Sparkles, X } from "lucide-react";
import { resolveOperatorName, formatOperatorLabel } from "@swarmx/types/operator-map";
import { TelemetryWidget } from "@/components/telemetry/TelemetryWidget";


// ── Micro sparkline (bar chart) ───────────────────────────────────────────────

interface SparklineProps {
  readonly data: number[];
  readonly color?: string;
  readonly height?: number;
  readonly maxValue?: number;
}

function Sparkline({ data, color = "var(--color-accent)", height = 28, maxValue }: SparklineProps) {
  const chartHeight = Math.max(8, height);
  const max = maxValue ?? Math.max(...data, 1);
  const bars = data.slice(-30); // last 30 samples

  return (
    <div className="flex items-end gap-px" aria-label="Sparkline chart">
      <svg
        className="h-full w-full"
        height={chartHeight}
        viewBox={`0 0 ${Math.max(1, bars.length)} ${chartHeight}`}
        preserveAspectRatio="none"
      >
      {bars.map((v, i) => (
        <rect
          key={`spark-${i}-${Math.round(v * 100)}`}
          x={i + 0.1}
          y={chartHeight - Math.max(2, (v / max) * chartHeight)}
          width={0.8}
          height={Math.max(2, (v / max) * chartHeight)}
          fill={color}
          fillOpacity={0.6 + (i / bars.length) * 0.4}
          rx={0.2}
        />
      ))}
      </svg>
    </div>
  );
}

// ── Per-core CPU bars ─────────────────────────────────────────────────────────

function CoreBars({ cores }: { readonly cores: number[] }) {
  if (cores.length === 0) return <div className="h-5 skeleton w-full rounded" />;
  const chartHeight = 20;
  return (
    <svg
      className="h-5 w-full"
      viewBox={`0 0 ${Math.max(1, cores.length)} ${chartHeight}`}
      preserveAspectRatio="none"
      aria-label="CPU core utilization"
    >
      {cores.map((pct, i) => {
        let color = "var(--color-resource-safe)";
        if (pct >= 85) {
          color = "var(--color-resource-critical)";
        } else if (pct >= 60) {
          color = "var(--color-resource-warn)";
        }
        const barHeight = Math.max(2, (pct / 100) * chartHeight);
        return (
          <g key={`core-${i}-${Math.round(pct)}`}>
            <title>{`Core ${i}: ${formatPct(pct)}`}</title>
            <rect
              x={i + 0.1}
              y={chartHeight - barHeight}
              width={0.8}
              height={barHeight}
              fill={color}
              rx={0.2}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ── Metric row ────────────────────────────────────────────────────────────────

interface MetricRowProps {
  readonly label: string;
  readonly value: string;
  readonly icon?: React.ElementType;
  readonly sublabel?: string;
  readonly sparkData?: number[];
  readonly sparkColor?: string;
  readonly alert?: boolean;
}

function MetricRow({ label, value, icon: Icon, sublabel, sparkData, sparkColor, alert }: MetricRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {Icon && (
            <Icon
              className={cn("h-3 w-3 shrink-0", alert ? "text-status-warning" : "text-text-muted")}
            />
          )}
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wide">
            {label}
          </span>
        </div>
        <span
          className={cn(
            "text-xs font-mono tabular-nums",
            alert ? "text-status-warning" : "text-text-secondary"
          )}
          data-metric
        >
          {value}
        </span>
      </div>
      {sublabel && (
        <span className="text-[9px] font-mono text-text-muted">{sublabel}</span>
      )}
      {sparkData && sparkData.length > 0 && (
        <Sparkline data={sparkData} {...(sparkColor !== undefined && { color: sparkColor })} height={20} />
      )}
    </div>
  );
}

// ── Agent fleet summary ring ──────────────────────────────────────────────────

function AgentFleetSummary() {
  const total = useEventsStore((s) => s.totalAgentCount);
  const active = useEventsStore((s) => s.activeAgentCount);
  const errors = useEventsStore((s) => s.errorAgentCount);

  if (total === 0) {
    return <div className="h-6 skeleton w-full rounded" />;
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xl font-mono font-semibold text-text-primary tabular-nums" data-metric>
          {active}
        </span>
        <span className="text-[10px] font-mono text-text-muted">
          / {total} active
        </span>
      </div>
      {errors > 0 && (
        <span className="flex items-center gap-1 text-[10px] font-mono text-status-error">
          <AlertCircle className="h-3 w-3" />
          {errors}
        </span>
      )}
    </div>
  );
}

// ── Queue depth rows ──────────────────────────────────────────────────────────

function QueueSummary() {
  const queues = useEventsStore((s) => s.queues);

  if (queues.size === 0) {
    return (
      <div className="space-y-1">
        {[1, 2].map((i) => (
          <div key={i} className="h-4 skeleton rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {[...queues.entries()].slice(0, 4).map(([name, q]) => (
        <div key={name} className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-text-muted truncate max-w-25">
            {name}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-status-queued tabular-nums" data-metric>
              {q.waiting}
            </span>
            <span className="text-[9px] font-mono text-text-muted">wait</span>
            {q.failed > 0 && (
              <span className="text-[10px] font-mono text-status-error tabular-nums" data-metric>
                {q.failed}✗
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Startup autopilot card (V6.1-ENH-01) ─────────────────────────────────────

function StartupCard() {
  const startup = useEventsStore((s) => s.startupSummary);

  if (!startup) return null;

  const statusCls =
    startup.status === "ready"
      ? "text-status-success border-status-success/30 bg-status-success/6"
      : startup.status === "critical"
      ? "text-status-error border-status-error/30 bg-status-error/6"
      : "text-status-warning border-status-warning/30 bg-status-warning/6";

  const warmupLabel = startup.warmupDone ? "warm" : "cold";
  const evolverLabel = startup.evolverSynced
    ? startup.evolverProposals > 0
      ? `${startup.evolverProposals} proposal${startup.evolverProposals === 1 ? "" : "s"}`
      : "synced"
    : "skipped";
  const startupLabel = startup.status.toUpperCase();
  const pressureLabel = startup.pressureLevel.toUpperCase();

  return (
    <div className={cn("rounded-md border px-2.5 py-2 space-y-1.5", statusCls)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono tracking-widest">{startupLabel}</span>
        <span className={cn("text-[9px] font-mono tracking-wide", governorTone(startup.pressureLevel))}>
          {pressureLabel}
        </span>
      </div>
      <div className="flex items-start gap-1.5">
        <Sparkles className="h-3 w-3 shrink-0 mt-0.5 opacity-70" />
        <p className="text-[10px] font-mono leading-snug">{startup.narrative}</p>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        <span className="text-[9px] font-mono text-text-muted">
          ollama <span className={startup.ollamaReachable ? "text-status-success" : "text-status-error"}>
            {startup.ollamaReachable ? "✓" : "✗"}
          </span>
        </span>
        <span className="text-[9px] font-mono text-text-muted">
          models <span className="text-text-secondary">{warmupLabel}</span>
        </span>
        <span className="text-[9px] font-mono text-text-muted">
          evolver <span className="text-text-secondary">{evolverLabel}</span>
        </span>
        <span className="text-[9px] font-mono text-text-muted">
          fanout <span className="text-text-secondary">x{startup.concurrencyLimit}</span>
        </span>
        <span className="text-[9px] font-mono text-text-muted">
          <span className="text-text-secondary">{startup.durationMs} ms</span>
        </span>
      </div>
    </div>
  );
}

function governorTone(level: "normal" | "high" | "critical"): string {
  if (level === "critical") return "text-status-error";
  if (level === "high") return "text-status-warning";
  return "text-status-success";
}

function governorSurface(level: "normal" | "high" | "critical"): string {
  if (level === "critical") return "border-status-error/40 bg-status-error/8";
  if (level === "high") return "border-status-warning/40 bg-status-warning/8";
  return "border-border bg-bg-base/60";
}

function GovernorSummary() {
  const governorState = useEventsStore((s) => s.governorState);
  const operatorViewMode = useUIStore((s) => s.operatorViewMode);

  if (!governorState) {
    return <div className="h-20 skeleton w-full rounded" />;
  }

  const zramPct = governorState.zramUsedPct * 100;
  const levelLabel = governorState.pressureLevel.toUpperCase();

  return (
    <div className={cn("rounded-md border px-2.5 py-2 space-y-2", governorSurface(governorState.pressureLevel))}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("text-[10px] font-mono tracking-widest", governorTone(governorState.pressureLevel))}>
            {levelLabel}
          </span>
          <span className="text-[9px] font-mono text-text-muted truncate">
            {governorState.observeOnly ? "observe-only" : "enforced"}
          </span>
        </div>
        <span className="text-[10px] font-mono text-text-secondary tabular-nums">
          x{governorState.concurrencyLimit}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-border/70 bg-bg-surface px-2 py-1.5">
          <div className="text-[9px] font-mono uppercase tracking-wide text-text-muted">Avail</div>
          <div className="text-xs font-mono text-text-secondary tabular-nums">{governorState.availableMb} MB</div>
        </div>
        <div className="rounded border border-border/70 bg-bg-surface px-2 py-1.5">
          <div className="text-[9px] font-mono uppercase tracking-wide text-text-muted">ZRAM</div>
          <div className="text-xs font-mono text-text-secondary tabular-nums">{zramPct.toFixed(0)}%</div>
        </div>
      </div>

      {operatorViewMode === "operator" && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(governorState.tokenCeilings).map(([tier, limit]) => {
            const operatorName = resolveOperatorName(tier);
            const fullLabel = formatOperatorLabel(tier);
            return (
            <span
              key={tier}
              className="rounded border border-border/70 bg-bg-surface px-1.5 py-0.5 text-[9px] font-mono text-text-muted"
              title={`${operatorName} max context tokens for this stage`}
            >
              {fullLabel}:{limit} tok
            </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main TelemetryRail ────────────────────────────────────────────────────────

export function TelemetryRail() {
  const metrics = useEventsStore((s) => s.systemMetrics);
  const cpuHistory = useEventsStore((s) => s.cpuHistory);
  const memHistory = useEventsStore((s) => s.memHistory);
  const diskReadHistory = useEventsStore((s) => s.diskReadHistory);
  const netRxHistory = useEventsStore((s) => s.netRxHistory);
  const isStale = useEventsStore((s) => s.isStale);
  const lastEventAt = useEventsStore((s) => s.lastEventAt);
  const drawerOpen = useUIStore((s) => s.telemetryDrawerOpen);
  const closeDrawer = useUIStore((s) => s.closeTelemetryDrawer);
  const telemetryRailVisible = useUIStore((s) => s.telemetryRailVisible);
  const drawerDialogRef = React.useRef<HTMLDialogElement | null>(null);

  React.useEffect(() => {
    if (!drawerOpen) return;
    const dialog = drawerDialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      dialog.showModal();
    }

    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [drawerOpen]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 1024px)");
    const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches && drawerOpen) {
        closeDrawer();
      }
    };
    mql.addEventListener("change", handleMediaChange);
    return () => mql.removeEventListener("change", handleMediaChange);
  }, [drawerOpen, closeDrawer]);

  const lastUpdated = React.useMemo(() => {
    if (!lastEventAt) return null;
    return new Date(lastEventAt).toLocaleTimeString("en-NG", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Africa/Lagos",
    });
  }, [lastEventAt]);

  const cpuAvg = useMemo(() => {
    const cores = metrics?.cpu.perCore ?? [];
    if (cores.length === 0) return metrics?.cpu.load1m ?? 0;
    return cores.reduce((a, b) => a + b, 0) / cores.length;
  }, [metrics]);

  const memPct = metrics && metrics.memory.totalMb > 0
    ? (metrics.memory.usedMb / metrics.memory.totalMb) * 100
    : 0;

  let cpuSparkColor = "var(--color-resource-safe)";
  if (cpuAvg >= 85) {
    cpuSparkColor = "var(--color-resource-critical)";
  } else if (cpuAvg >= 60) {
    cpuSparkColor = "var(--color-resource-warn)";
  }

  let memSparkColor = "var(--color-resource-safe)";
  if (memPct >= 85) {
    memSparkColor = "var(--color-resource-critical)";
  } else if (memPct >= 60) {
    memSparkColor = "var(--color-resource-warn)";
  }

  const renderContent = (isDrawer: boolean) => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">
            Telemetry
          </span>
          <DisclosureModeBadge />
        </div>
        <div className="flex items-center gap-2">
          {isStale ? (
            <span className="text-[9px] font-mono text-status-warning flex items-center gap-1">
              <span className="status-dot h-1 w-1" data-status="queued" />
              stale
            </span>
          ) : lastUpdated ? (
            <span className="text-[9px] font-mono text-text-muted tabular-nums" title="Last telemetry received">
              {lastUpdated}
            </span>
          ) : null}
          {isDrawer && (
            <button
              type="button"
              className="rounded p-1 text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ml-1"
              aria-label="Close telemetry drawer"
              onClick={closeDrawer}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className={cn("px-3 py-3 space-y-4 transition-[opacity,filter] duration-500", isStale && "stale-dim")}>
          {/* Real-time System Telemetry Overview */}
          <TelemetryWidget className="p-2.5" />

          {/* Agent Fleet */}
          <section>

            <SectionLabel icon={Bot} label="Agent Fleet" />
            <div className="mt-1.5">
              <AgentFleetSummary />
            </div>
          </section>

          <Separator />

          {/* Governor */}
          <section>
            <SectionLabel icon={Gauge} label="Governor" />
            <div className="mt-1.5 space-y-1.5">
              <StartupCard />
              <GovernorSummary />
            </div>
          </section>

          <Separator />

          {/* CPU */}
          <section>
            <SectionLabel icon={Cpu} label="CPU" />
            <div className="mt-1.5 space-y-2">
              <MetricRow
                label="Load avg"
                value={formatPct(cpuAvg)}
                {...(metrics?.cpu.coreCount != null
                  ? { sublabel: `${metrics.cpu.coreCount} cores` }
                  : {})}
                alert={cpuAvg > 85}
              />
              {metrics?.cpu.temperatureCelsius != null && (
                <MetricRow
                  label="Temp"
                  value={`${metrics.cpu.temperatureCelsius.toFixed(0)}°C`}
                  alert={metrics.cpu.temperatureCelsius > 80}
                />
              )}
              {metrics?.cpu.perCore && <CoreBars cores={metrics.cpu.perCore} />}
              {cpuHistory.length > 0 && (
                <Sparkline
                  data={cpuHistory.map((p) => p.value)}
                  color={cpuSparkColor}
                />
              )}
            </div>
          </section>

          <Separator />

          {/* Memory */}
          <section>
            <SectionLabel icon={MemoryStick} label="Memory" />
            <div className="mt-1.5 space-y-2">
              <MetricRow
                label="System"
                value={metrics ? `${Math.round(metrics.memory.usedMb)} MB` : "…"}
                {...(metrics ? { sublabel: `${Math.round(memPct)}% of ${Math.round(metrics.memory.totalMb / 1024)} GB` } : {})}
                alert={memPct > 85}
              />
              <MetricRow
                label="yap engine slice"
                value={metrics ? `${Math.round(metrics.memory.swarmxSliceMb)} MB` : "…"}
                {...(metrics?.memory.swarmxSliceLimitMb != null
                  ? { sublabel: `limit: ${Math.round(metrics.memory.swarmxSliceLimitMb)} MB` }
                  : {})}
              />
              {memHistory.length > 0 && (
                <Sparkline
                  data={memHistory.map((p) => p.value)}
                  color={memSparkColor}
                />
              )}
            </div>
          </section>

          <Separator />

          {/* BullMQ Queues */}
          <section>
            <SectionLabel icon={Zap} label="Queues" />
            <div className="mt-1.5">
              <QueueSummary />
            </div>
          </section>

          <Separator />

          {/* Disk I/O */}
          <section>
            <SectionLabel icon={HardDrive} label="Disk I/O" />
            <div className="mt-1.5 space-y-1">
              <MetricRow
                label="Read"
                value={metrics ? formatBps(metrics.disk.readBytesPerSec) : "…"}
                sparkData={diskReadHistory.map((p) => p.value)}
                sparkColor="var(--color-status-active)"
              />
              <MetricRow
                label="Write"
                value={metrics ? formatBps(metrics.disk.writeBytesPerSec) : "…"}
              />
            </div>
          </section>

          <Separator />

          {/* Network I/O */}
          <section>
            <SectionLabel icon={Network} label="Network" />
            <div className="mt-1.5 space-y-1">
              <MetricRow
                label="RX"
                value={metrics ? formatBps(metrics.network.rxBytesPerSec) : "…"}
                sparkData={netRxHistory.map((p) => p.value)}
                sparkColor="var(--color-status-reload)"
              />
              <MetricRow
                label="TX"
                value={metrics ? formatBps(metrics.network.txBytesPerSec) : "…"}
              />
            </div>
          </section>

          {/* Bottom padding */}
          <div className="h-2" />
        </div>
      </ScrollArea>
    </>
  );

  return (
    <>
      <div className="hidden lg:contents">
        <aside
          className={cn(
            "row-start-2 col-start-3 flex flex-col",
            "bg-bg-surface border-l border-border",
            "w-(--telemetry-width) overflow-hidden h-full",
            "z-20 rail-enter",
            !telemetryRailVisible && "hidden"
          )}
          aria-label="Live telemetry"
        >
          {renderContent(false)}
        </aside>
      </div>
      {drawerOpen && (
        <dialog
          ref={drawerDialogRef}
          aria-modal="true"
          aria-label="Live telemetry drawer"
          className="fixed inset-0 z-100 flex bg-transparent lg:hidden"
          onCancel={(event) => {
            event.preventDefault();
            closeDrawer();
          }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/65 transition-opacity backdrop-blur-[2px]"
            aria-label="Close telemetry drawer"
            onClick={closeDrawer}
          />
          <aside
            className="relative ml-auto flex h-dvh w-full max-w-[22rem] flex-col border-l border-border bg-bg-surface shadow-[0_24px_48px_rgba(0,0,0,0.55)] z-10 overflow-hidden rail-enter"
            aria-label="Live telemetry drawer"
          >
            {renderContent(true)}
          </aside>
        </dialog>
      )}
    </>
  );
}

function SectionLabel({ icon: Icon, label }: { readonly icon: React.ElementType; readonly label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 text-text-muted" />
      <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
}
