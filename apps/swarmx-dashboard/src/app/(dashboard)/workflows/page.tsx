"use client";

import React, { useState } from "react";
import { cn, formatRelativeTime, safeErrorMessage } from "@/lib/utils";
import { useEventsStore } from "@/stores/events";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Square, GitBranch, ChevronRight, Activity, Hash, Clock3 } from "lucide-react";
import type { BadgeProps } from "@/components/ui/badge";
import type { WorkflowDefinition, WorkflowRunState } from "@swarmx/types";
import { useApiHealth } from "@/hooks/useApiHealth";
import { RouteDegradedBanner } from "@/components/layout/RouteDegradedBanner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkflowStep {
  id?: string;
  agent?: string;
  model?: string;
  depends_on?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function workflowDataStatus(status: WorkflowListItem["status"]): string {
  if (status === "queued")    return "queued";
  if (status === "running")   return "active";
  if (status === "success")   return "success";
  if (status === "cancelled") return "idle";       // winding down, not an error
  if (status === "error")     return "error";
  return "idle";
}

function workflowBadgeVariant(status: WorkflowListItem["status"]): NonNullable<BadgeProps["variant"]> {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "active";
    case "success":
      return "success";
    case "cancelled":
      return "warn";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

function listStatusFromRun(status: WorkflowRunState["status"]): WorkflowListItem["status"] {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "success":
      return "success";
    case "failed":
      return "error";
    case "cancelled":
      return "cancelled";
    default:
      return "idle";
  }
}

function formatWorkflowTimestamp(timestamp?: string): string {
  if (!timestamp) return "No runs yet";
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return timestamp;
  return formatRelativeTime(ms);
}

function formatWorkflowTimestampAbsolute(timestamp?: string): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("en-NG", { timeZone: "Africa/Lagos" });
}

function agentStepDataStatus(status: string | undefined): string {
  switch (status) {
    case "running":
    case "success":
    case "error":
      return workflowDataStatus(status);
    default:
      return "idle";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkflowListItem {
  id: string;
  name: string;
  description?: string;
  lastRun?: string;
  lastRunId?: string;
  correlationId?: string;
  status: "idle" | "queued" | "running" | "success" | "error" | "cancelled";
  nodeCount: number;
  agentCount: number;
}

interface WorkflowRunsResponse {
  runs: WorkflowRunState[];
}

// ── Workflow list sidebar ─────────────────────────────────────────────────────

function WorkflowListPanel({
  selected,
  onSelect,
}: {
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
}) {
  const workflowRuns = useEventsStore((s) => s.workflowRuns);
  const { data: workflows, isLoading, isError } = useQuery<WorkflowListItem[]>({
    queryKey: ["workflows"],
    queryFn: async () => {
      const res = await fetch("/api/workflows");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<WorkflowListItem[]>;
    },
    staleTime: 30_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 skeleton rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 px-4 text-center">
        <span className="text-xs font-mono text-status-warning">Workflows unavailable</span>
        <span className="text-[10px] font-mono text-text-muted">
          Yap Engine API is currently offline. Start the service on port 3001 to load workflows.
        </span>
      </div>
    );
  }

  if (!workflows || workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 px-4">
        <div className="relative h-8 w-8">
          <div className="absolute inset-0 rounded-full border border-dashed border-border" style={{ animation: "orbit-cw 6s linear infinite" }} />
          <div className="absolute inset-2 flex items-center justify-center">
            <GitBranch className="h-3 w-3 text-text-muted" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <span className="text-xs font-mono text-text-muted block">No workflows yet</span>
          <span className="text-[10px] font-mono text-text-muted/60 block leading-relaxed">
            Drop a <code className="text-accent/70">.yaml</code> file into your <code className="text-accent/70">workflows/</code> directory to get started
          </span>
        </div>
      </div>
    );
  }

  const workflowItems = (workflows ?? []).map((workflow) => {
    const liveRun = workflowRuns.get(workflow.id);
    if (!liveRun) return workflow;
    return {
      ...workflow,
      lastRun: liveRun.updatedAt,
      lastRunId: liveRun.runId,
      correlationId: liveRun.correlationId,
      status: listStatusFromRun(liveRun.status),
    };
  });

  return (
    <div className="divide-y divide-border">
      {workflowItems.map((wf) => (
        <button
          key={wf.id}
          type="button"
          onClick={() => onSelect(wf.id)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 text-left",
            "w-full flex items-center gap-3 px-3 py-2.5 text-left",
            "hover:bg-bg-elevated transition-all duration-(--duration-micro)",
            "focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-accent",
            "border-l-2",
            selected === wf.id ? "bg-(--color-accent-dim) border-accent pl-[10px]" : "border-transparent"
          )}
          aria-pressed={selected === wf.id}
          aria-label={`Select workflow: ${wf.name}`}
        >
          <span
            className="status-dot h-2 w-2 shrink-0"
            data-status={workflowDataStatus(wf.status)}
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-mono text-text-primary truncate">{wf.name}</div>
            {wf.description && (
              <div className="text-[10px] font-mono text-text-muted truncate">{wf.description}</div>
            )}
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={workflowBadgeVariant(wf.status)} dot>
                {wf.status}
              </Badge>
              {wf.lastRun && (
                <span
                  className="text-[10px] font-mono text-text-muted truncate"
                  title={formatWorkflowTimestampAbsolute(wf.lastRun)}
                >
                  {formatWorkflowTimestamp(wf.lastRun)}
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="h-3 w-3 text-text-muted shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ── Simple ASCII DAG visualization ────────────────────────────────────────────

function WorkflowDAG({ definition }: { readonly definition: WorkflowDefinition }) {
  const steps = (definition.steps ?? []) as WorkflowStep[];
  const agentStatuses = useEventsStore((s) => s.agents);

  return (
    <div className="p-4 font-mono text-xs space-y-1">
      {steps.length === 0 ? (
        <span className="text-text-muted">No steps defined</span>
      ) : (
        steps.map((step, i) => {
          const agent = agentStatuses.get(step.agent ?? "");
          const isLast = i === steps.length - 1;
          return (
            <div key={step.id ?? i}>
              <div className="flex items-center gap-2">
                <span
                  className="status-dot h-2 w-2 shrink-0"
                  data-status={agentStepDataStatus(agent?.status)}
                />
                <span className={cn(
                  "text-text-secondary",
                  agent?.status === "running" && "text-accent"
                )}>
                  [{step.id ?? `step-${i}`}]
                </span>
                <span className="text-text-muted">→</span>
                <span className="text-text-primary">{step.agent}</span>
                {step.model && (
                  <span className="text-text-muted text-[10px]">({step.model})</span>
                )}
                {step.depends_on && step.depends_on.length > 0 && (
                  <span className="text-text-muted text-[10px]">
                    deps: [{step.depends_on.join(", ")}]
                  </span>
                )}
              </div>
              {!isLast && (
                <div className="flex items-center gap-2 pl-1 text-text-muted text-[10px]">
                  <span>│</span>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── YAML editor (CodeMirror 6) ────────────────────────────────────────────────

// Lazy-load CodeMirror to avoid SSR issues
const YAMLEditor = React.lazy(() =>
  import("@/components/workflows/YAMLEditor").then((m) => ({ default: m.YAMLEditor }))
);

// ── Workflow detail panel ─────────────────────────────────────────────────────

function WorkflowDetail({ workflowId }: { readonly workflowId: string }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"dag" | "yaml">("dag");
  const [yamlDraft, setYamlDraft] = useState<string>("");
  const [yamlTouched, setYamlTouched] = useState(false);
  const workflowRuns = useEventsStore((s) => s.workflowRuns);

  const { data: definition, isLoading } = useQuery<WorkflowDefinition>({
    queryKey: ["workflow", workflowId],
    queryFn: async () => {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<WorkflowDefinition>;
    },
    staleTime: 15_000,
  });

  const { data: runsData } = useQuery<WorkflowRunsResponse>({
    queryKey: ["workflow-runs"],
    queryFn: async () => {
      const res = await fetch("/api/workflows/runs?limit=200");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<WorkflowRunsResponse>;
    },
    staleTime: 5_000,
  });

  const historicalRun = (runsData?.runs ?? [])
    .filter((run) => run.workflowId === workflowId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];

  const effectiveRun = workflowRuns.get(workflowId) ?? historicalRun;
  const effectiveStatus = effectiveRun ? listStatusFromRun(effectiveRun.status) : "idle";
  const sourceYaml = definition?.rawYaml ?? "";
  const effectiveYamlContent = yamlTouched ? yamlDraft : sourceYaml;

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: `run-${Date.now()}` }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      void queryClient.invalidateQueries({ queryKey: ["workflow-runs"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveRun) {
        throw new Error("No active workflow run available to cancel");
      }

      const res = await fetch(`/api/workflows/runs/${encodeURIComponent(effectiveRun.runId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      void queryClient.invalidateQueries({ queryKey: ["workflow-runs"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (yaml: string) => {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      setYamlTouched(false);
      setYamlDraft("");
      queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-6 skeleton rounded" />)}
      </div>
    );
  }

  if (!definition) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-mono font-semibold text-text-primary">{definition.name}</h2>
          {definition.description && (
            <p className="text-[10px] font-mono text-text-muted mt-0.5">{definition.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={workflowBadgeVariant(effectiveStatus)} dot>
              {effectiveStatus}
            </Badge>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-text-muted">
              <Clock3 className="h-3 w-3" />
              {formatWorkflowTimestamp(effectiveRun?.updatedAt)}
            </span>
            {effectiveRun?.runId && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-text-muted">
                <Activity className="h-3 w-3" />
                {effectiveRun.runId}
              </span>
            )}
            {effectiveRun?.correlationId && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-text-muted">
                <Hash className="h-3 w-3" />
                {effectiveRun.correlationId}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending || !effectiveRun || (effectiveRun.status !== "queued" && effectiveRun.status !== "running")}
            className="gap-1.5"
          >
            <Square className="h-3 w-3" />
            {cancelMutation.isPending ? "Cancelling…" : "Cancel"}
          </Button>
          <Button
            size="sm"
            variant="accent"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="gap-1.5"
          >
            <Play className="h-3 w-3" />
            {runMutation.isPending ? "Launching…" : "Run"}
          </Button>
          {runMutation.isError && (
            <span role="alert" className="text-[10px] font-mono text-status-error">
              Run failed: {safeErrorMessage(runMutation.error, "check the API logs for details.")}
            </span>
          )}
          {cancelMutation.isError && (
            <span role="alert" className="text-[10px] font-mono text-status-error">
              Cancel failed: {safeErrorMessage(cancelMutation.error, "check the API logs for details.")}
            </span>
          )}
        </div>
      </div>

      {effectiveRun && (
        <div className="grid grid-cols-1 gap-3 border-b border-border bg-bg-surface/60 px-4 py-3 md:grid-cols-3">
          <div className="rounded border border-border bg-bg-base/70 px-3 py-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Last Update</div>
            <div className="mt-1 text-xs font-mono text-text-primary" title={formatWorkflowTimestampAbsolute(effectiveRun.updatedAt)}>{formatWorkflowTimestamp(effectiveRun.updatedAt)}</div>
          </div>
          <div className="rounded border border-border bg-bg-base/70 px-3 py-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Trace</div>
            <div className="mt-1 text-xs font-mono text-text-primary break-all">{effectiveRun.correlationId}</div>
          </div>
          <div className="rounded border border-border bg-bg-base/70 px-3 py-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Run Outcome</div>
            <div className={cn(
              "mt-1 text-xs font-mono",
              effectiveRun.error ? "text-status-error" : "text-text-primary"
            )}>
              {effectiveRun.error ?? "Awaiting result payload"}
            </div>
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex items-center gap-0.5 px-4 pt-2 border-b border-border">
        {(["dag", "yaml"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            aria-pressed={activeTab === tab}
            aria-label={tab === "dag" ? "DAG View" : "YAML Source"}
            className={cn(
              "px-3 py-1.5 text-xs font-mono border-b-2 -mb-px",
              "transition-colors duration-(--duration-micro)",
              activeTab === tab
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            {tab === "dag" ? "DAG View" : "YAML Source"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "dag" ? (
          <ScrollArea className="h-full">
            <WorkflowDAG definition={definition} />
          </ScrollArea>
        ) : (
          <React.Suspense fallback={<div className="p-4 text-xs font-mono text-text-muted">Loading editor…</div>}>
            <div className="flex flex-col h-full">
              <YAMLEditor
                value={effectiveYamlContent}
                onChange={(value) => {
                  setYamlTouched(true);
                  setYamlDraft(value);
                }}
                className="flex-1"
              />
              <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-border">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => saveMutation.mutate(effectiveYamlContent)}
                  disabled={saveMutation.isPending || effectiveYamlContent === sourceYaml}
                >
                  {saveMutation.isPending ? "Saving…" : "Save"}
                </Button>
                {saveMutation.isError && (
                  <span className="text-[10px] font-mono text-status-error">
                    Save failed
                  </span>
                )}
              </div>
            </div>
          </React.Suspense>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const handleSelect = React.useCallback((id: string) => setSelectedWorkflowId(id), []);
  const governorState = useEventsStore((s) => s.governorState);
  const startupSummary = useEventsStore((s) => s.startupSummary);
  const apiHealth = useApiHealth();
  const pressureLevel = governorState?.pressureLevel ?? startupSummary?.pressureLevel;
  const availableMb = governorState?.availableMb ?? startupSummary?.availableMb ?? null;
  const ollamaOnline = apiHealth.ollamaOnline ?? startupSummary?.ollamaReachable ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4">
        <RouteDegradedBanner
          pressureLevel={pressureLevel}
          availableMb={availableMb}
          apiOnline={apiHealth.apiOnline}
          ollamaOnline={ollamaOnline}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h1 className="text-sm font-mono font-semibold text-text-primary">Workflows</h1>
          <span className="ai-chip">DAG</span>
        </div>
        <ScrollArea className="flex-1">
          <WorkflowListPanel selected={selectedWorkflowId} onSelect={handleSelect} />
        </ScrollArea>
      </aside>

      {/* Detail panel */}
      <div className="flex-1 overflow-hidden">
        {selectedWorkflowId ? (
          <WorkflowDetail workflowId={selectedWorkflowId} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="relative h-12 w-12">
              <div className="absolute inset-0 rounded-full border border-dashed border-border" style={{ animation: "orbit-cw 8s linear infinite" }} />
              <div className="absolute inset-3 flex items-center justify-center">
                <GitBranch className="h-4 w-4 text-text-muted" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <span className="text-xs font-mono text-text-muted block">Nothing selected</span>
              <span className="text-[10px] font-mono text-text-muted/60 block">Choose a workflow from the left to inspect its DAG and run history</span>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
