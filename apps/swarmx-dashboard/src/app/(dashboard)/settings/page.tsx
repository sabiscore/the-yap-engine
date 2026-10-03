"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Save, ExternalLink, AlertCircle } from "lucide-react";
import { useEventsStore } from "@/stores/events";
import { safeErrorMessage } from "@/lib/utils";
import type { PressureLevel } from "@swarmx/types";
import { useApiHealth } from "@/hooks/useApiHealth";
import { RouteDegradedBanner } from "@/components/layout/RouteDegradedBanner";

// ─── [APEX17-r8] Model Topology types ────────────────────────────────────────

interface ModelTopologyEntry {
  operator:      string;
  tag:           string;
  ggufBase:      string;
  ramMb:         number;
  composerTier:  number;
  keepAlive:     string;
  is7B:          boolean;
  role:          string;
}

interface ResidentModel {
  tag:           string;
  operator:      string;
  is7B:          boolean;
  estimatedRamMb: number;
}

interface ModelStatusResponse {
  residentModels: ResidentModel[];
  active7B:       string | null;
  ramAvailableMb: number;
  mode:           string;
}

// ─── Static topology table (sourced from models/registry.yaml + operator-map) ─
// This is intentionally static for performance and offline resilience.
// Live resident status comes from the /api/models/status polling query.
// Tier labels: 0=local, 1=Relay, 2=Pilot, 3=Architect/Forge, 4=Oracle/Auditor
const MODEL_TOPOLOGY: ModelTopologyEntry[] = [
  { operator: "Relay",               tag: "route-phi4-lite-q4km-prod",         ggufBase: "Phi-4-mini Q4_K_M",          ramMb: 2500, composerTier: 1, keepAlive: "10m", is7B: false, role: "route"    },
  { operator: "Pilot",               tag: "instruct-phi4-pro-q8-prod",          ggufBase: "Phi-4-mini Q8_0",             ramMb: 4270, composerTier: 2, keepAlive: "5m",  is7B: false, role: "instruct" },
  { operator: "Architect (phi4)",    tag: "plan-phi4-pro-q8-prod",              ggufBase: "Phi-4-mini Q8_0",             ramMb: 4340, composerTier: 3, keepAlive: "0s",  is7B: false, role: "plan"     },
  { operator: "Architect (qwen25)",  tag: "plan-qwen25-pro-q5km-prod",          ggufBase: "Qwen2.5-7B Q5_K_M",          ramMb: 5370, composerTier: 3, keepAlive: "0s",  is7B: true,  role: "plan"     },
  { operator: "Architect (deepseek)",tag: "plan-deepseekr1-pro-q5km-prod",      ggufBase: "DeepSeek-R1-Distill Q5_K_M", ramMb: 5370, composerTier: 4, keepAlive: "0s",  is7B: true,  role: "plan"     },
  { operator: "Forge",               tag: "code-qwen25-pro-q5km-prod",          ggufBase: "Qwen2.5-7B Q5_K_M",          ramMb: 5370, composerTier: 3, keepAlive: "0s",  is7B: true,  role: "code"     },
  { operator: "Oracle",              tag: "reason-deepseekr1-pro-q5km-prod",    ggufBase: "DeepSeek-R1-Distill Q5_K_M", ramMb: 5370, composerTier: 4, keepAlive: "0s",  is7B: true,  role: "reason"   },
  { operator: "Auditor",             tag: "critique-deepseekr1-pro-q5km-prod",  ggufBase: "DeepSeek-R1-Distill Q5_K_M", ramMb: 5420, composerTier: 4, keepAlive: "0s",  is7B: true,  role: "critique" },
  { operator: "Lab (observe)",       tag: "synth-phi4-exp-q8-dev",              ggufBase: "Phi-4-mini Q8_0",             ramMb: 4440, composerTier: 2, keepAlive: "3m†", is7B: false, role: "synth"    },
  { operator: "Lab (mutate)",        tag: "synth-qwen25-exp-q5km-dev",          ggufBase: "Qwen2.5-7B Q5_K_M",          ramMb: 5370, composerTier: 3, keepAlive: "2m†", is7B: true,  role: "synth"    },
  { operator: "Lab (critique/val)",  tag: "synth-deepseekr1-exp-q5km-dev",      ggufBase: "DeepSeek-R1-Distill Q5_K_M", ramMb: 5370, composerTier: 4, keepAlive: "2m†", is7B: true,  role: "synth"    },
];

// ─── Pressure badge ───────────────────────────────────────────────────────────

function PressureBadge({ level }: { readonly level: PressureLevel | string | undefined }) {
  if (!level) return <span className="text-[10px] font-mono text-text-muted">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    normal:   { label: "NORMAL",   cls: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" },
    high:     { label: "HIGH",     cls: "text-amber-400  border-amber-500/40  bg-amber-500/10"  },
    critical: { label: "CRITICAL", cls: "text-red-400    border-red-500/40    bg-red-500/10"    },
    degraded: { label: "DEGRADED", cls: "text-red-300    border-red-400/40    bg-red-400/10"    },
    low:      { label: "LOW",      cls: "text-sky-400    border-sky-500/40    bg-sky-500/10"    },
  };
  const badge = map[level] ?? { label: level.toUpperCase(), cls: "text-text-muted border-border bg-transparent" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-mono tracking-widest ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

// ─── Resident status dot ──────────────────────────────────────────────────────

function ResidentDot({ isResident, is7B }: { readonly isResident: boolean; readonly is7B: boolean }) {
  if (!isResident) {
    return (
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-border" title="Not loaded" />
    );
  }
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse ${is7B ? "bg-amber-400" : "bg-emerald-400"}`}
      title={is7B ? "Resident (7B — occupying SINGLE-7B slot)" : "Resident"}
    />
  );
}

// ─── Model Topology Section ───────────────────────────────────────────────────

function ModelTopologySection() {
  const governorState = useEventsStore((s) => s.governorState);

  const { data: modelStatus, isLoading: isStatusLoading, isError } = useQuery<ModelStatusResponse>({
    queryKey: ["model-status"],
    queryFn: async () => {
      const res = await fetch("/api/models/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<ModelStatusResponse>;
    },
    refetchInterval: 8_000,
    staleTime: 4_000,
    retry: false,
  });

  const residentTags = new Set(modelStatus?.residentModels.map((m) => m.tag) ?? []);

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between px-4 pb-2">
        <h2 className="text-[10px] font-mono text-text-muted uppercase tracking-widest">
          Model Topology
        </h2>
        <div className="flex items-center gap-3">
          {governorState && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-text-muted">pressure</span>
              <PressureBadge level={governorState.pressureLevel} />
            </div>
          )}
          {modelStatus && (
            <span className="text-[9px] font-mono text-text-muted">
              {governorState?.availableMb ?? modelStatus.ramAvailableMb} MB free
            </span>
          )}
          {isStatusLoading && !isError && (
            <span className="text-[9px] font-mono text-text-muted animate-pulse">polling…</span>
          )}
          {isError && (
            <span className="text-[9px] font-mono text-status-warning">offline</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border-t border-b border-border overflow-x-auto">
        {/* Column headers */}
        <div
          className="grid px-4 py-1.5 border-b border-border/50 bg-bg-elevated/30"
          style={{ gridTemplateColumns: "1fr 2.2fr 1.4fr 3.5rem 3.5rem 3rem 2.5rem 2rem" }}
        >
          {["Operator", "Canonical Tag", "GGUF Base", "RAM MB", "Tier", "Keep-alive", "7B", "Live"].map((h) => (
            <span key={h} className="text-[9px] font-mono text-text-muted uppercase tracking-wider">
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        {MODEL_TOPOLOGY.map((entry) => {
          const isResident = residentTags.has(entry.tag);
          const isLabRow = entry.role === "synth";
          return (
            <div
              key={entry.tag}
              className={`grid px-4 py-2 border-b border-border/30 last:border-0 hover:bg-bg-elevated/20 transition-colors ${isLabRow ? "opacity-60 italic" : ""}`}
              style={{ gridTemplateColumns: "1fr 2.2fr 1.4fr 3.5rem 3.5rem 3rem 2.5rem 2rem" }}
            >
              {/* Operator */}
              <span className="text-[10px] font-mono text-text-primary truncate">{entry.operator}</span>
              {/* Canonical Tag */}
              <span className="text-[10px] font-mono text-text-muted truncate" title={entry.tag}>
                {entry.tag}
              </span>
              {/* GGUF Base */}
              <span className="text-[10px] font-mono text-text-muted truncate">{entry.ggufBase}</span>
              {/* RAM MB */}
              <span className="text-[10px] font-mono text-text-muted tabular-nums">
                {entry.ramMb.toLocaleString()}
              </span>
              {/* Composer Tier */}
              <span className="text-[10px] font-mono text-text-muted tabular-nums">
                {entry.composerTier}
              </span>
              {/* Keep-alive */}
              <span className="text-[10px] font-mono text-text-muted">
                {entry.keepAlive}
              </span>
              {/* 7B marker */}
              <span className={`text-[10px] font-mono ${entry.is7B ? "text-amber-400" : "text-text-muted"}`}>
                {entry.is7B ? "7B" : "—"}
              </span>
              {/* Resident status dot */}
              <div className="flex items-center">
                <ResidentDot isResident={isResident} is7B={entry.is7B} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 pt-2 pb-1">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[9px] font-mono text-text-muted">Resident (non-7B)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-[9px] font-mono text-text-muted">Resident (7B — SINGLE lock)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-border" />
          <span className="text-[9px] font-mono text-text-muted">Not loaded</span>
        </div>
        <span className="text-[9px] font-mono text-text-muted ml-auto">
          †keep-alive in evolver mode only
        </span>
      </div>

      {/* SINGLE-7B status strip */}
      {modelStatus?.active7B && (
        <div className="mx-4 mb-2 px-3 py-1.5 rounded border border-amber-500/30 bg-amber-500/5 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span className="text-[10px] font-mono text-amber-300">
            7B slot occupied: {modelStatus.active7B}
          </span>
          <span className="text-[9px] font-mono text-text-muted ml-auto">
            orchestrator mode: {modelStatus.mode}
          </span>
        </div>
      )}
    </section>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SwarmXConfig {
  backend: {
    port: number;
    host: string;
    sse: { flushIntervalMs: number; keepAliveIntervalMs: number };
  };
  telemetry: { pollIntervalMs: number };
  agents: { maxConcurrent: number; defaultTimeout: number };
  terminal: { maxSessions: number; sessionTimeoutMs: number };
  llm: { defaultModel: string; maxTokens: number };
}

// ── Settings Section ──────────────────────────────────────────────────────────

function SettingsSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[10px] font-mono text-text-muted uppercase tracking-widest px-4 pb-2">
        {title}
      </h2>
      <div className="divide-y divide-border border-t border-b border-border">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  readonly label: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-8 px-4 py-3">
      <div className="min-w-0">
        <div className="text-xs font-mono text-text-primary">{label}</div>
        <div className="text-[10px] font-mono text-text-muted mt-0.5">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SwarmXConfig = {
  backend: {
    port: 3001,
    host: "127.0.0.1",
    sse: { flushIntervalMs: 500, keepAliveIntervalMs: 15_000 },
  },
  telemetry: { pollIntervalMs: 12_000 },
  agents: { maxConcurrent: 4, defaultTimeout: 60 },
  terminal: { maxSessions: 5, sessionTimeoutMs: 300_000 },
  llm: { defaultModel: "instruct-phi4-pro-q8-prod", maxTokens: 2048 },
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const governorState = useEventsStore((s) => s.governorState);
  const startupSummary = useEventsStore((s) => s.startupSummary);
  const apiHealth = useApiHealth();
  const pressureLevel = governorState?.pressureLevel ?? startupSummary?.pressureLevel;
  const availableMb = governorState?.availableMb ?? startupSummary?.availableMb ?? null;
  const ollamaOnline = apiHealth.ollamaOnline ?? startupSummary?.ollamaReachable ?? null;

  const { data: config, isLoading, isError: isConfigError } = useQuery<SwarmXConfig>({
    queryKey: ["swarmx-config"],
    queryFn: async () => {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<SwarmXConfig>;
    },
    staleTime: 60_000,
    retry: false,
  });

  const [draft, setDraft] = useState<Partial<SwarmXConfig>>({});
  const isOffline = isConfigError || (!config && !isLoading);
  const effectiveConfig = config ?? DEFAULT_CONFIG;

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<SwarmXConfig>) => {
      const res = await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["swarmx-config"] });
    },
  });

  const hasDraft = Object.keys(draft).length > 0;

  if (isLoading && !config) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 skeleton rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h1 className="text-sm font-mono font-semibold text-text-primary">Settings</h1>
        <div className="flex items-center gap-2">
          {isOffline && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-status-warning/40 bg-status-warning/10 text-[10px] font-mono text-status-warning">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>API offline · Default config (read-only)</span>
            </div>
          )}
          {hasDraft && (
            <>
              <span className="text-[10px] font-mono text-text-muted">Unsaved changes</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft({})}
              >
                Discard
              </Button>
              <Button
                size="sm"
                variant="accent"
                onClick={() => saveMutation.mutate(draft)}
                disabled={isOffline || saveMutation.isPending}
                className="gap-1.5"
              >
                <Save className="h-3 w-3" />
                {saveMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </>
          )}
        </div>
        {/* [V6.2-ENH-08] Show inline error when save fails. Sanitized via safeErrorMessage to avoid path/internals leak. */}
        {saveMutation.isError && (
          <div role="alert" className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-500/40 bg-red-500/10 text-[10px] font-mono text-red-200">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>
              Save failed:{" "}
              {safeErrorMessage(saveMutation.error, "check the API logs for details.")}
            </span>
          </div>
        )}
      </div>

      {/* Degraded state: shown when runtime pressure is high/critical or model runtime is offline */}
      <div className="px-4 pt-3">
        <RouteDegradedBanner
          pressureLevel={pressureLevel}
          availableMb={availableMb}
          apiOnline={apiHealth.apiOnline}
          ollamaOnline={ollamaOnline}
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-6 space-y-6 max-w-2xl">

          {/* ── [APEX17-r8] Model Topology ─────────────────────────────────── */}
          <ModelTopologySection />

          {/* Backend settings */}
          <SettingsSection title="API Backend">
            <SettingsRow
              label="Backend Port"
              description="Fastify API server port (requires restart)"
            >
              <Input
                type="number"
                disabled={isOffline}
                className="w-24 text-xs text-right tabular-nums disabled:opacity-60"
                defaultValue={effectiveConfig.backend.port}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    backend: { ...effectiveConfig.backend, ...d.backend, port: parseInt(e.target.value, 10) },
                  }))
                }
              />
            </SettingsRow>

            <SettingsRow
              label="SSE Flush Interval"
              description="How often the SSE stream flushes events to clients (ms)"
            >
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  disabled={isOffline}
                  className="w-24 text-xs text-right tabular-nums disabled:opacity-60"
                  defaultValue={effectiveConfig.backend.sse.flushIntervalMs}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      backend: {
                        ...effectiveConfig.backend,
                        ...d.backend,
                        sse: { ...effectiveConfig.backend.sse, flushIntervalMs: parseInt(e.target.value, 10) },
                      },
                    }))
                  }
                />
                <span className="text-[10px] font-mono text-text-muted">ms</span>
              </div>
            </SettingsRow>
          </SettingsSection>

          {/* Telemetry */}
          <SettingsSection title="Telemetry">
            <SettingsRow
              label="Poll Interval"
              description="How often system metrics are sampled from systeminformation"
            >
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  disabled={isOffline}
                  className="w-24 text-xs text-right tabular-nums disabled:opacity-60"
                  defaultValue={effectiveConfig.telemetry.pollIntervalMs}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      telemetry: { pollIntervalMs: parseInt(e.target.value, 10) },
                    }))
                  }
                />
                <span className="text-[10px] font-mono text-text-muted">ms</span>
              </div>
            </SettingsRow>
          </SettingsSection>

          {/* Agents */}
          <SettingsSection title="Agent Runtime">
            <SettingsRow
              label="Max Concurrent Agents"
              description="Maximum number of agents that can run simultaneously"
            >
              <Input
                type="number"
                disabled={isOffline}
                className="w-24 text-xs text-right tabular-nums disabled:opacity-60"
                defaultValue={effectiveConfig.agents.maxConcurrent}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    agents: { ...effectiveConfig.agents, ...d.agents, maxConcurrent: parseInt(e.target.value, 10) },
                  }))
                }
              />
            </SettingsRow>
            <SettingsRow
              label="Default Agent Timeout"
              description="Maximum execution time per agent before force-kill (ms)"
            >
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  disabled={isOffline}
                  className="w-24 text-xs text-right tabular-nums disabled:opacity-60"
                  defaultValue={effectiveConfig.agents.defaultTimeout}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      agents: { ...effectiveConfig.agents, ...d.agents, defaultTimeout: parseInt(e.target.value, 10) },
                    }))
                  }
                />
                <span className="text-[10px] font-mono text-text-muted">ms</span>
              </div>
            </SettingsRow>
          </SettingsSection>

          {/* Terminal */}
          <SettingsSection title="Terminal">
            <SettingsRow
              label="Max PTY Sessions"
              description="Maximum concurrent terminal sessions (node-pty instances)"
            >
              <Input
                type="number"
                disabled={isOffline}
                className="w-24 text-xs text-right tabular-nums disabled:opacity-60"
                defaultValue={effectiveConfig.terminal.maxSessions}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    terminal: { ...effectiveConfig.terminal, ...d.terminal, maxSessions: parseInt(e.target.value, 10) },
                  }))
                }
              />
            </SettingsRow>
          </SettingsSection>

          {/* LLM */}
          <SettingsSection title="LLM">
            <SettingsRow
              label="Default Model"
              description="Default model used by the AI Composer and agents without explicit model config"
            >
              <Input
                className="w-48 text-xs disabled:opacity-60"
                disabled={isOffline}
                defaultValue={effectiveConfig.llm.defaultModel}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    llm: { ...effectiveConfig.llm, ...d.llm, defaultModel: e.target.value },
                  }))
                }
              />
            </SettingsRow>
          </SettingsSection>

          {/* Docs link */}
          <div className="flex items-center gap-1.5 pt-2">
            <ExternalLink className="h-3 w-3 text-text-muted" />
            <a
              href="https://github.com/swarmx/swarmx/blob/main/docs/CONFIG_REFERENCE.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-text-muted hover:text-accent transition-colors duration-(--duration-micro)"
            >
              Full configuration reference →
            </a>
          </div>

          {/* Keyboard shortcuts reference */}
          <SettingsSection title="Keyboard Shortcuts">
            <div className="divide-y divide-border">
              {([
                { keys: ["⌘", "K"],      label: "Open command palette" },
                { keys: ["⌘", "1–6"],    label: "Jump to section" },
                { keys: ["⌘", "B"],      label: "Toggle sidebar" },
                { keys: ["⌘", "`"],      label: "Toggle terminal strip" },
                { keys: ["⌘", "T"],      label: "New terminal tab" },
                { keys: ["⌘", "⇧", "T"], label: "Toggle telemetry rail" },
                { keys: ["⌘", "⇧", "`"], label: "Fullscreen terminal" },
                { keys: ["↵"],           label: "Submit composer message" },
              ] as const).map(({ keys, label }) => (
                <div
                  key={label}
                  className="flex items-center justify-between px-4 py-2 hover:bg-bg-elevated/40 transition-colors duration-(--duration-micro)"
                >
                  <span className="text-xs font-mono text-text-secondary">{label}</span>
                  <div className="flex items-center gap-1">
                    {keys.map((k) => (
                      <kbd key={k} className="kbd-pill">{k}</kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SettingsSection>
        </div>
      </ScrollArea>
    </div>
  );
}
