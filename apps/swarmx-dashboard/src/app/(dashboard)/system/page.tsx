"use client";

import React from "react";
import { cn, formatBytes, formatPct } from "@/lib/utils";
import { useEventsStore } from "@/stores/events";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Server, MemoryStick, Cpu, HardDrive } from "lucide-react";
import type { CgroupScopeMetrics } from "@swarmx/types";
import { useApiHealth } from "@/hooks/useApiHealth";
import { RouteDegradedBanner } from "@/components/layout/RouteDegradedBanner";
import { RuntimeCapabilityStrip } from "@/components/layout/RuntimeCapabilityStrip";
import { RetentionMapPanel } from "@/components/video/RetentionMapPanel";

const SYSTEMD_SKELETON_KEYS = ["sd-1", "sd-2", "sd-3", "sd-4", "sd-5", "sd-6", "sd-7", "sd-8"] as const;
const SYSTEM_CARD_SKELETON_KEYS = ["card-1", "card-2", "card-3", "card-4", "card-5", "card-6"] as const;
const METRICS_SKELETON_KEYS = ["metric-1", "metric-2", "metric-3", "metric-4", "metric-5", "metric-6"] as const;

// ── cgroup v2 tree ────────────────────────────────────────────────────────────

interface CgroupRowData {
  path: string;
  name: string;
  cpuPct: number;
  memMb: number;
  oomEvents: number;
  throttledPct: number;
}

function cpuToneClass(value: number): string {
  if (value > 85) return "text-status-error";
  if (value > 60) return "text-status-warning";
  return "text-text-secondary";
}

function scsTone(reading: number): { className: string; stroke: string } {
  if (reading >= 0.8) {
    return { className: "metric-tone-good", stroke: "var(--color-status-active)" };
  }
  if (reading >= 0.5) {
    return { className: "metric-tone-warn", stroke: "var(--color-status-warning)" };
  }
  return { className: "metric-tone-error", stroke: "var(--color-status-error)" };
}

function unitStateClass(activeState: string): string {
  if (activeState === "active") return "text-status-active";
  if (activeState === "failed") return "text-status-error";
  return "text-text-muted";
}

function loadStateClass(loadState: string): string {
  return loadState === "loaded" ? "text-text-secondary" : "text-status-warning";
}

function counterToneClass(label: string, value: number): string {
  const isAlertCounter =
    label.includes("fail") ||
    label.includes("error") ||
    label.includes("VRAM") ||
    label.includes("Anomal");

  if (isAlertCounter) {
    return value > 0 ? "text-status-error" : "text-text-primary";
  }

  return "text-status-active";
}

function retryToneClass(count: number): string {
  if (count > 5) return "text-status-error";
  if (count > 2) return "text-status-warning";
  return "text-text-muted";
}

function tierMeterClass(label: string): string {
  if (label.includes("fast")) return "swarm-meter swarm-meter--good";
  if (label.includes("reason")) return "swarm-meter swarm-meter--warn";
  return "swarm-meter";
}

function buildCgroupRows(scopes: Map<string, CgroupScopeMetrics>): CgroupRowData[] {
  const rows: CgroupRowData[] = [];
  for (const [path, scope] of scopes.entries()) {
    const name = path.split("/").pop() ?? path;
    rows.push({
      path,
      name,
      cpuPct: scope.cpuUsagePercent,
      memMb: scope.memCurrentMb,
      oomEvents: scope.oomKillCount,
      throttledPct: scope.cpuThrottledPercent ?? 0,
    });
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

function CgroupTableRow({ row }: { readonly row: CgroupRowData }) {
  const throttleClassName = row.throttledPct > 10 ? "text-status-warning" : "text-text-muted";
  const leafPath = row.path.split("/").at(-1) ?? row.path;

  return (
    <tr className="border-b border-border/50 font-mono text-[11px] transition-colors duration-(--duration-micro) hover:bg-bg-elevated">
      <th scope="row" className={cn("max-w-52 truncate px-3 py-1.5 text-left font-normal", row.oomEvents > 0 ? "text-status-error" : "text-text-secondary")}>
        {row.name}
        {row.oomEvents > 0 && <span className="ml-1.5 text-[9px] text-status-error">OOM×{row.oomEvents}</span>}
      </th>
      <td className={cn("px-3 py-1.5 text-right tabular-nums", cpuToneClass(row.cpuPct))} data-metric>{formatPct(row.cpuPct)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-text-secondary" data-metric>{Math.round(row.memMb)} MB</td>
      <td className={cn("px-3 py-1.5 text-right tabular-nums", throttleClassName)} data-metric>{formatPct(row.throttledPct)}</td>
      <td className="max-w-64 truncate px-3 py-1.5 text-text-muted">{leafPath}</td>
    </tr>
  );
}

function CgroupTree() {
  const cgroupScopes = useEventsStore((s) => s.cgroupScopes);
  const rows = React.useMemo(() => buildCgroupRows(cgroupScopes), [cgroupScopes]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse" aria-label="cgroup v2 process metrics">
        <caption className="sr-only">Live CPU, memory, throttle, and OOM metrics for each cgroup scope.</caption>
        <thead className="border-b border-border bg-bg-surface">
          <tr className="font-mono text-[9px] uppercase tracking-wide text-text-muted">
            <th scope="col" className="px-3 py-1.5 text-left">Scope</th>
            <th scope="col" className="px-3 py-1.5 text-right">CPU</th>
            <th scope="col" className="px-3 py-1.5 text-right">Memory</th>
            <th scope="col" className="px-3 py-1.5 text-right">Throttle</th>
            <th scope="col" className="px-3 py-1.5 text-left">Path</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="h-32 px-3 text-center text-xs font-mono text-text-muted">No cgroup scopes. Is Yap Engine API running?</td>
            </tr>
          ) : (
            rows.map((row) => <CgroupTableRow key={row.path} row={row} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── systemd units ─────────────────────────────────────────────────────────────

interface SystemdUnit {
  name: string;
  loadState: string;
  activeState: string;
  subState: string;
  description: string;
}

function SystemdUnitsTable() {
  const { data: units, isLoading, isError } = useQuery<SystemdUnit[]>({
    queryKey: ["systemd-units"],
    queryFn: async () => {
      const res = await fetch("/api/system/units");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<SystemdUnit[]>;
    },
    staleTime: 15_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {SYSTEMD_SKELETON_KEYS.map((key) => (
          <div key={key} className="h-6 skeleton rounded" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-1.5">
        <span className="text-xs font-mono text-status-error">systemd units unavailable</span>
        <span className="text-[10px] font-mono text-text-muted">API may be down or running on non-Linux host</span>
      </div>
    );
  }

  if (!units || units.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <span className="text-xs font-mono text-text-muted">No systemd units found</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse" aria-label="systemd units">
        <caption className="sr-only">
          systemd service units — load state, active state, sub-state, and description.
        </caption>
        <thead className="border-b border-border bg-bg-surface">
          <tr className="font-mono text-[9px] uppercase tracking-wide text-text-muted">
            <th scope="col" className="px-4 py-1.5 text-left">Unit</th>
            <th scope="col" className="px-4 py-1.5 text-left">Load</th>
            <th scope="col" className="px-4 py-1.5 text-left">Active</th>
            <th scope="col" className="px-4 py-1.5 text-left">Sub</th>
            <th scope="col" className="px-4 py-1.5 text-left">Description</th>
          </tr>
        </thead>
        <tbody className="font-mono text-[11px]">
          {units.map((unit) => (
            <tr key={unit.name} className="border-b border-border/50 hover:bg-bg-elevated">
              <th scope="row" className="max-w-52 truncate px-4 py-1.5 text-left font-normal text-text-secondary">{unit.name}</th>
              <td className={cn("px-4 py-1.5", loadStateClass(unit.loadState))}>{unit.loadState}</td>
              <td className={cn("px-4 py-1.5", unitStateClass(unit.activeState))}>{unit.activeState}</td>
              <td className="px-4 py-1.5 text-text-muted">{unit.subState}</td>
              <td className="max-w-96 truncate px-4 py-1.5 text-text-muted">{unit.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── System info summary ───────────────────────────────────────────────────────

function SystemInfoPanel() {
  const metrics = useEventsStore((s) => s.systemMetrics);

  if (!metrics) {
    return (
      <div className="grid grid-cols-2 gap-3 p-4">
        {SYSTEM_CARD_SKELETON_KEYS.map((key) => (
          <div key={key} className="h-12 skeleton rounded-lg" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: "CPU Cores", value: String(metrics.cpu.coreCount ?? 1), icon: Cpu, sub: `${formatPct(metrics.cpu.load1m * 100 / (metrics.cpu.coreCount ?? 1))} avg` },
    { label: "Total Memory", value: `${Math.round(metrics.memory.totalMb / 1024)} GB`, icon: MemoryStick, sub: `${Math.round(metrics.memory.usedMb / 1024)} GB used` },
    { label: "Disk Read", value: formatBytes(metrics.disk.readBytesPerSec) + "/s", icon: HardDrive, sub: "current throughput" },
    { label: "Disk Write", value: formatBytes(metrics.disk.writeBytesPerSec) + "/s", icon: HardDrive, sub: "current throughput" },
    { label: "Yap Engine Slice", value: `${Math.round(metrics.memory.swarmxSliceMb)} MB`, icon: Server, sub: "cgroup memory" },
    { label: "Load (1m/5m/15m)", value: `${metrics.cpu.load1m.toFixed(2)}`, icon: Cpu, sub: `${metrics.cpu.load5m.toFixed(2)} / ${metrics.cpu.load15m.toFixed(2)}` },
  ] as const;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="bg-bg-surface border border-border rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className="h-3 w-3 text-text-muted" />
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wide">{card.label}</span>
            </div>
            <div className="text-lg font-mono font-semibold text-text-primary tabular-nums" data-metric>
              {card.value}
            </div>
            <div className="text-[10px] font-mono text-text-muted mt-0.5">{card.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── V5 Metrics panel ──────────────────────────────────────────────────────────

interface V5Metrics {
  checkpoint_count?: number;
  resume_success_count?: number;
  resume_fail_count?: number;
  memory_hit_rate?: number;
  memory_tournament_wins?: number;
  consolidation_count?: number;
  proposal_acceptance_rate?: number;
  sandbox_run_count?: number;
  narrative_generated_count?: number;
  anomaly_detected_count?: number;
  scs_history?: number[];
  llm_routing_by_tier?: { fast?: number; reason?: number; code?: number };
  skill_promotion_count?: number;
  tournament_crossover_count?: number;
  vram_ceiling_hits?: number;
  retry_count_by_model?: Record<string, number>;
}

function ScsSparkline({ readings }: { readonly readings: number[] }) {
  if (readings.length === 0) {
    return <span className="text-xs font-mono text-text-muted">no data</span>;
  }
  const W = 160;
  const H = 32;
  const max = Math.max(...readings, 1);
  const pts = readings.map((v, i) => {
    const x = (i / Math.max(readings.length - 1, 1)) * W;
    const y = H - (v / max) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const latest = readings.at(-1) ?? 0;
  const tone = scsTone(latest);

  return (
    <div className="flex items-center gap-3">
      <svg width={W} height={H} className="shrink-0">
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={tone.stroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <span className={cn("text-sm font-mono font-semibold tabular-nums", tone.className)} data-metric>
        {latest.toFixed(3)}
      </span>
    </div>
  );
}

function TierBar({ tiers }: { readonly tiers: { fast?: number; reason?: number; code?: number } }) {
  const fast = tiers.fast ?? 0;
  const reason = tiers.reason ?? 0;
  const code = tiers.code ?? 0;
  const total = fast + reason + code;
  if (total === 0) return <span className="text-xs font-mono text-text-muted">no dispatches</span>;
  return (
    <div className="space-y-1.5">
      {([
        ["phi4-mini (fast)", fast],
        ["deepseek-r1 (reason)", reason],
        ["qwen2.5-coder (code)", code],
      ] as const).map(([label, count]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-text-muted w-36 shrink-0">{label}</span>
          <progress className={tierMeterClass(label)} max={total} value={count} />
          <span className="text-[10px] font-mono tabular-nums text-text-secondary w-8 text-right">{count}</span>
        </div>
      ))}
    </div>
  );
}

function V5MetricsPanel() {
  const { data, isLoading, isError } = useQuery<V5Metrics>({
    queryKey: ["v5-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/metrics");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<V5Metrics>;
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {METRICS_SKELETON_KEYS.map((key) => (
          <div key={key} className="h-10 skeleton rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <span className="text-xs font-mono text-status-error">V5 metrics unavailable</span>
        <span className="text-[10px] font-mono text-text-muted">Ensure Yap Engine API is running</span>
      </div>
    );
  }

  const counters = [
    { label: "Checkpoints written", value: data.checkpoint_count ?? 0 },
    { label: "Resume success", value: data.resume_success_count ?? 0 },
    { label: "Resume failures", value: data.resume_fail_count ?? 0 },
    { label: "Memory consolidations", value: data.consolidation_count ?? 0 },
    { label: "Sandbox runs", value: data.sandbox_run_count ?? 0 },
    { label: "Narratives generated", value: data.narrative_generated_count ?? 0 },
    { label: "Anomalies detected", value: data.anomaly_detected_count ?? 0 },
    { label: "Skill promotions", value: data.skill_promotion_count ?? 0 },
    { label: "Tournament crossovers", value: data.tournament_crossover_count ?? 0 },
    { label: "VRAM ceiling hits", value: data.vram_ceiling_hits ?? 0 },
    { label: "Tournament wins (memory)", value: data.memory_tournament_wins ?? 0 },
  ] as const;
  const hasRetries = data.retry_count_by_model != null && Object.keys(data.retry_count_by_model).length > 0;

  return (
    <div className="p-4 space-y-6">
      {/* SCS History */}
      <section>
        <h2 className="text-[10px] font-mono text-text-muted uppercase tracking-widest mb-2">
          System Confidence Score (SCS)
        </h2>
        <ScsSparkline readings={data.scs_history ?? []} />
      </section>

      {/* LLM Routing */}
      <section>
        <h2 className="text-[10px] font-mono text-text-muted uppercase tracking-widest mb-2">
          LLM Dispatch by Tier
        </h2>
        <TierBar tiers={data.llm_routing_by_tier ?? {}} />
      </section>

      {/* Rate metrics */}
      <section>
        <h2 className="text-[10px] font-mono text-text-muted uppercase tracking-widest mb-3">
          Rate Metrics
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-bg-surface border border-border rounded-lg px-3 py-2">
            <div className="text-[10px] font-mono text-text-muted">Memory Hit Rate</div>
            <div className="text-base font-mono font-semibold text-text-primary tabular-nums" data-metric>
              {((data.memory_hit_rate ?? 0) * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-bg-surface border border-border rounded-lg px-3 py-2">
            <div className="text-[10px] font-mono text-text-muted">Proposal Acceptance</div>
            <div className="text-base font-mono font-semibold text-text-primary tabular-nums" data-metric>
              {((data.proposal_acceptance_rate ?? 0) * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </section>

      {/* Event counters */}
      <section>
        <h2 className="text-[10px] font-mono text-text-muted uppercase tracking-widest mb-2">
          Event Counters
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {counters.map(({ label, value }) => (
            <div
              key={label}
              className="bg-bg-surface border border-border rounded-lg px-3 py-2"
            >
              <div className="text-[10px] font-mono text-text-muted truncate">{label}</div>
              <div
                className={cn("text-sm font-mono font-semibold tabular-nums", counterToneClass(label, value))}
                data-metric
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Retry by model */}
      {hasRetries && (
        <section>
          <h2 className="text-[10px] font-mono text-text-muted uppercase tracking-widest mb-2">
            Retries by Model
          </h2>
          <div className="space-y-1">
            {Object.entries(data.retry_count_by_model ?? {}).map(([model, count]) => {
              return (
                <div key={model} className="flex items-center justify-between font-mono text-xs">
                  <span className="text-text-secondary">{model}</span>
                  <span className={cn("tabular-nums", retryToneClass(count))} data-metric>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SystemPage() {
  const governorState = useEventsStore((s) => s.governorState);
  const startupSummary = useEventsStore((s) => s.startupSummary);
  const apiHealth = useApiHealth();
  const pressureLevel = governorState?.pressureLevel ?? startupSummary?.pressureLevel;
  const availableMb = governorState?.availableMb ?? startupSummary?.availableMb ?? null;
  const ollamaOnline = apiHealth.ollamaOnline ?? startupSummary?.ollamaReachable ?? null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 border-b border-border space-y-2">
        <h1 className="text-sm font-mono font-semibold text-text-primary">Linux Substrate</h1>
        <RouteDegradedBanner
          pressureLevel={pressureLevel}
          availableMb={availableMb}
          apiOnline={apiHealth.apiOnline}
          ollamaOnline={ollamaOnline}
        />
      </div>
      <RuntimeCapabilityStrip />

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="overview" className="flex flex-col h-full">
          <TabsList className="px-4 pt-2 border-b border-border">
            <TabsTrigger value="overview">System Info</TabsTrigger>
            <TabsTrigger value="cgroup">cgroup v2 Tree</TabsTrigger>
            <TabsTrigger value="systemd">systemd Units</TabsTrigger>
            <TabsTrigger value="v5metrics">V5 Metrics</TabsTrigger>
            <TabsTrigger value="retention">Retention Lab</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 overflow-auto">
            <SystemInfoPanel />
          </TabsContent>

          <TabsContent value="cgroup" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <CgroupTree />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="systemd" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <SystemdUnitsTable />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="v5metrics" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <V5MetricsPanel />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="retention" className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <RetentionMapPanel />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
