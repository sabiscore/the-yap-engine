"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  CheckCircle2,
  GitBranch,
  Loader2,
  Plus,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useCreativeFactoryStore } from "@/stores/creative-factory";
import type { BrandKit, AudiencePersona, CreativeFactoryWorkflowRun } from "@swarmx/types/video-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capabilityTone(state: string): string {
  if (state === "available") return "text-status-success";
  if (state === "degraded") return "text-status-warning";
  return "text-status-error";
}

function runStatusColor(status: CreativeFactoryWorkflowRun["status"]): string {
  if (status === "complete") return "text-status-success border-status-success/30 bg-status-success/10";
  if (status === "running") return "text-accent border-accent/30 bg-accent/10";
  if (status === "failed") return "text-status-error border-status-error/30 bg-status-error/10";
  if (status === "blocked") return "text-status-warning border-status-warning/30 bg-status-warning/10";
  return "text-text-muted border-border bg-bg-surface";
}

// ─── BrandKit creation sheet ──────────────────────────────────────────────────

function BrandKitSheet({ onCreated }: { onCreated: () => void }) {
  const upsertBrandKit = useCreativeFactoryStore((s) => s.upsertBrandKit);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [principles, setPrinciples] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    const voicePrinciples = principles
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (voicePrinciples.length === 0) voicePrinciples.push("Authentic and direct");
    const result = await upsertBrandKit({ name: name.trim(), voicePrinciples });
    setSubmitting(false);
    if (result) {
      setName("");
      setPrinciples("");
      setOpen(false);
      onCreated();
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Plus className="h-3 w-3" aria-hidden="true" />
          New
        </Button>
      </SheetTrigger>
      <SheetContent side="right" aria-labelledby="brandkit-sheet-title">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle id="brandkit-sheet-title" className="text-sm font-semibold">New Brand Kit</SheetTitle>
        </SheetHeader>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-5 px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bk-name" className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
              Name <span className="text-status-error" aria-hidden="true">*</span>
            </label>
            <Input
              id="bk-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Yap Engine Brand"
              maxLength={120}
              required
              aria-required="true"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bk-principles" className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
              Voice Principles <span className="text-text-muted text-[10px] normal-case">(one per line)</span>
            </label>
            <textarea
              id="bk-principles"
              value={principles}
              onChange={(e) => setPrinciples(e.target.value)}
              placeholder={"Be specific, not vague\nChallenge assumptions\nGive concrete examples"}
              rows={5}
              className="w-full resize-y rounded border border-border bg-bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <Button type="submit" disabled={submitting || !name.trim()} className="mt-2">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            {submitting ? "Saving…" : "Save Brand Kit"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Audience creation sheet ──────────────────────────────────────────────────

function AudienceSheet({ onCreated }: { onCreated: () => void }) {
  const upsertAudience = useCreativeFactoryStore((s) => s.upsertAudience);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [pains, setPains] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !description.trim()) return;
    setSubmitting(true);
    const painsList = pains
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const result = await upsertAudience({
      label: label.trim(),
      description: description.trim(),
      pains: painsList,
    });
    setSubmitting(false);
    if (result) {
      setLabel("");
      setDescription("");
      setPains("");
      setOpen(false);
      onCreated();
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Plus className="h-3 w-3" aria-hidden="true" />
          New
        </Button>
      </SheetTrigger>
      <SheetContent side="right" aria-labelledby="audience-sheet-title">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle id="audience-sheet-title" className="text-sm font-semibold">New Audience Persona</SheetTitle>
        </SheetHeader>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-5 px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="aud-label" className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
              Label <span className="text-status-error" aria-hidden="true">*</span>
            </label>
            <Input
              id="aud-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Early-career creator"
              maxLength={120}
              required
              aria-required="true"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="aud-desc" className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
              Description <span className="text-status-error" aria-hidden="true">*</span>
            </label>
            <textarea
              id="aud-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Who is this audience? What do they watch and why?"
              rows={3}
              maxLength={1000}
              required
              aria-required="true"
              className="w-full resize-y rounded border border-border bg-bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="aud-pains" className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
              Pains <span className="text-text-muted text-[10px] normal-case">(one per line)</span>
            </label>
            <textarea
              id="aud-pains"
              value={pains}
              onChange={(e) => setPains(e.target.value)}
              placeholder={"No time to edit long-form video\nStruggle to find scroll-stop hooks\nDon't understand the algorithm"}
              rows={4}
              className="w-full resize-y rounded border border-border bg-bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <Button type="submit" disabled={submitting || !label.trim() || !description.trim()} className="mt-2">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            {submitting ? "Saving…" : "Save Audience"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Loading skeleton for list tabs ───────────────────────────────────────────

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-2/5 animate-pulse rounded bg-bg-input" />
            <div className="h-2.5 w-3/5 animate-pulse rounded bg-bg-input/60" />
          </div>
          <div className="h-3 w-8 animate-pulse rounded bg-bg-input" />
        </div>
      ))}
    </div>
  );
}

// ─── BrandKit row ─────────────────────────────────────────────────────────────

function BrandKitRow({ kit }: { kit: BrandKit }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-text-primary">{kit.name}</p>
        <p className="mt-0.5 line-clamp-2 text-[10px] text-text-muted">
          {kit.voicePrinciples.slice(0, 2).join(" · ")}
          {kit.voicePrinciples.length > 2 ? ` +${kit.voicePrinciples.length - 2}` : ""}
        </p>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-text-muted">
        r{kit.revision ?? 0}
      </span>
    </div>
  );
}

// ─── Audience row ─────────────────────────────────────────────────────────────

function AudienceRow({ persona }: { persona: AudiencePersona }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-text-primary">{persona.label}</p>
        <p className="mt-0.5 line-clamp-1 text-[10px] text-text-muted">{persona.description}</p>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-text-muted">{persona.languageLocale}</span>
    </div>
  );
}

// ─── Run row ──────────────────────────────────────────────────────────────────

function RunRow({
  run,
  selected,
  onSelect,
}: {
  run: CreativeFactoryWorkflowRun;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const completedCount = Object.values(run.checkpoints).filter(
    (cp) => cp?.status === "complete",
  ).length;
  const totalCount = Object.keys(run.checkpoints).length;

  return (
    <button
      type="button"
      onClick={() => onSelect(run.id)}
      className={cn(
        "flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left last:border-b-0",
        "transition-colors duration-(--duration-micro) hover:bg-bg-surface/60",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-0",
        selected && "bg-bg-surface/80",
      )}
      aria-pressed={selected}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase",
            runStatusColor(run.status),
          )}>
            {run.status}
          </span>
          <span className="font-mono text-[10px] text-text-muted">{run.mode}</span>
        </div>
        <p className="mt-1 font-mono text-[10px] text-text-muted">
          {totalCount > 0 ? `${completedCount}/${totalCount} stages` : "No checkpoints"}
          {" · "}
          {new Date(run.createdAt).toLocaleDateString()}
        </p>
      </div>
    </button>
  );
}

// ─── Run checkpoint detail ─────────────────────────────────────────────────────

function RunDetail({ run }: { run: CreativeFactoryWorkflowRun }) {
  const checkpoints = Object.entries(run.checkpoints);

  if (checkpoints.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[10px] text-text-muted">
        No checkpoints recorded yet.
      </div>
    );
  }

  return (
    <ol className="divide-y divide-border">
      {checkpoints.map(([stage, cp]) => {
        const isActive = cp?.status === "running";
        return (
          <li
            key={stage}
            className="flex items-center justify-between gap-2 px-4 py-2"
            {...(isActive ? { "aria-current": "step" as const } : {})}
          >
            <span className="font-mono text-[10px] text-text-secondary">{stage}</span>
            <span className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[10px]",
              cp?.status === "complete" ? "border-status-success/30 bg-status-success/10 text-status-success" :
              cp?.status === "failed" ? "border-status-error/30 bg-status-error/10 text-status-error" :
              cp?.status === "running" ? "border-accent/30 bg-accent/10 text-accent" :
              "border-border text-text-muted",
            )}>
              {cp?.status ?? "unknown"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function CreativeFactoryPanel() {
  // Scalar selectors — Zustand v5 + React 19 tears on object-returning selectors (React #185).
  const stages = useCreativeFactoryStore((s) => s.stages);
  const runs = useCreativeFactoryStore((s) => s.runs);
  const capabilities = useCreativeFactoryStore((s) => s.capabilities);
  const brandKits = useCreativeFactoryStore((s) => s.brandKits);
  const audiences = useCreativeFactoryStore((s) => s.audiences);
  const blueprints = useCreativeFactoryStore((s) => s.blueprints);
  const selectedRunId = useCreativeFactoryStore((s) => s.selectedRunId);
  const isLoading = useCreativeFactoryStore((s) => s.isLoading);
  const error = useCreativeFactoryStore((s) => s.error);
  const fetchFactory = useCreativeFactoryStore((s) => s.fetchFactory);
  const fetchRunDetail = useCreativeFactoryStore((s) => s.fetchRunDetail);
  const selectRun = useCreativeFactoryStore((s) => s.selectRun);
  const createRun = useCreativeFactoryStore((s) => s.createRun);

  useEffect(() => {
    void fetchFactory();
  }, [fetchFactory]);

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  const stageSummary = useMemo(() => {
    const approvalCount = stages.filter((stage) => stage.humanApprovalRequired).length;
    const retryableCount = stages.filter((stage) => stage.retryable).length;
    return { approvalCount, retryableCount };
  }, [stages]);

  const handleRunSelect = (id: string) => {
    if (id === selectedRunId) {
      selectRun(null);
    } else {
      void fetchRunDetail(id);
    }
  };

  const startRun = async () => {
    await createRun({
      mode: "FULL_RENDER",
      profile: "constrained_cpu_8gb",
      idempotencyKey: `dashboard-${new Date().toISOString().slice(0, 19)}`,
    });
  };

  return (
    <section className="mb-5 rounded border border-border bg-bg-elevated/70" aria-labelledby="factory-heading">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <GitBranch className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="factory-heading" className="text-sm font-semibold text-text-primary">Creative Factory</h2>
            <p className="truncate text-xs text-text-muted">
              {stages.length} checkpointed stages · {stageSummary.approvalCount} approval gates · {stageSummary.retryableCount} retryable stages
            </p>
          </div>
        </div>
        <Button onClick={() => { void startRun(); }} variant="outline" size="sm" disabled={isLoading}>
          {isLoading
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Activity className="h-4 w-4" aria-hidden="true" />}
          Start Run
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="mx-4 mt-3 flex items-start gap-2 rounded border border-status-error/35 bg-status-error/10 px-3 py-2 text-xs text-status-error"
          role="alert"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start px-4 pt-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="brandkits">
            BrandKits
            {brandKits.length > 0 && (
              <span className="ml-1 rounded bg-bg-surface px-1 font-mono text-[9px] text-text-muted">
                {brandKits.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="audiences">
            Audiences
            {audiences.length > 0 && (
              <span className="ml-1 rounded bg-bg-surface px-1 font-mono text-[9px] text-text-muted">
                {audiences.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="runs">
            Runs
            {runs.length > 0 && (
              <span className="ml-1 rounded bg-bg-surface px-1 font-mono text-[9px] text-text-muted">
                {runs.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview">
          <div className="grid gap-0 divide-y divide-border md:grid-cols-[1.3fr_1fr] md:divide-x md:divide-y-0">
            <div className="grid grid-cols-2 gap-0 sm:grid-cols-4">
              {[
                { label: "Runs", value: runs.length, icon: Activity },
                { label: "BrandKits", value: brandKits.length, icon: ShieldCheck },
                { label: "Audiences", value: audiences.length, icon: Boxes },
                { label: "Blueprints", value: blueprints.length, icon: CheckCircle2 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="min-h-20 border-r border-t border-border px-4 py-3 first:border-t-0 sm:border-t-0">
                    <div className="mb-2 flex items-center gap-2 text-text-muted">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="font-mono text-[10px] uppercase tracking-wide">{item.label}</span>
                    </div>
                    <div className="font-mono text-xl text-text-primary">{item.value}</div>
                  </div>
                );
              })}
            </div>

            <div className="flex min-h-20 flex-col gap-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">Capabilities</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {capabilities.map((capability) => (
                  <div
                    key={capability.platform}
                    className="flex min-w-0 items-center justify-between gap-2 rounded border border-border bg-bg-surface px-2 py-1.5"
                  >
                    <span className="truncate text-text-secondary">{capability.platform}</span>
                    <span className={cn("font-mono text-[10px]", capabilityTone(capability.supportsDirectPublish ? "available" : "degraded"))}>
                      {capability.supportsDirectPublish ? "direct" : "draft"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── BrandKits ── */}
        <TabsContent value="brandkits">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2 text-text-muted">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-mono text-[10px] uppercase tracking-wide">Brand Kits</span>
            </div>
            <BrandKitSheet onCreated={fetchFactory} />
          </div>
          {isLoading && brandKits.length === 0 ? (
            <ListSkeleton />
          ) : brandKits.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-text-muted">
              No brand kits yet. Click &ldquo;New&rdquo; to define your first brand identity.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {brandKits.map((kit) => <BrandKitRow key={kit.id} kit={kit} />)}
            </div>
          )}
        </TabsContent>

        {/* ── Audiences ── */}
        <TabsContent value="audiences">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2 text-text-muted">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-mono text-[10px] uppercase tracking-wide">Audience Personas</span>
            </div>
            <AudienceSheet onCreated={fetchFactory} />
          </div>
          {isLoading && audiences.length === 0 ? (
            <ListSkeleton />
          ) : audiences.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-text-muted">
              No audience personas yet. Click &ldquo;New&rdquo; to define your first audience.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {audiences.map((persona) => <AudienceRow key={persona.id} persona={persona} />)}
            </div>
          )}
        </TabsContent>

        {/* ── Runs ── */}
        <TabsContent value="runs">
          <div className="grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-border">
            <div className="sm:max-h-[420px] sm:overflow-y-auto">
              <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-border bg-bg-elevated/95 px-4 py-2.5 text-text-muted backdrop-blur">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono text-[10px] uppercase tracking-wide">Workflow Runs</span>
              </div>
              {isLoading && runs.length === 0 ? (
                <ListSkeleton />
              ) : runs.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-text-muted">
                  No runs yet. Click &ldquo;Start Run&rdquo; to begin a workflow.
                </div>
              ) : (
                <div>
                  {runs.map((run) => (
                    <RunRow
                      key={run.id}
                      run={run}
                      selected={run.id === selectedRunId}
                      onSelect={handleRunSelect}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="sm:max-h-[420px] sm:overflow-y-auto">
              <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-border bg-bg-elevated/95 px-4 py-2.5 text-text-muted backdrop-blur">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono text-[10px] uppercase tracking-wide">
                  {selectedRun ? `Checkpoints — ${selectedRun.mode}` : "Select a run"}
                </span>
              </div>
              {selectedRun ? (
                <RunDetail run={selectedRun} />
              ) : (
                <div className="px-4 py-8 text-center text-xs text-text-muted">
                  Select a run on the left to view stage checkpoints.
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
