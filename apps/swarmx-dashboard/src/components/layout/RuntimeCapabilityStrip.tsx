"use client";

import React from "react";
import { resolveOperatorName } from "@swarmx/types/operator-map";
import { useRuntimeCapabilities } from "@/hooks/useRuntimeCapabilities";
import { cn } from "@/lib/utils";

interface CapabilityCardProps {
  label: string;
  value: string;
  status: "ok" | "warn" | "err" | "unknown";
  hint?: string;
}

function statusClass(status: CapabilityCardProps["status"]): string {
  switch (status) {
    case "ok":
      return "border-status-success/40 bg-status-success/6 text-status-success";
    case "warn":
      return "border-status-warning/40 bg-status-warning/6 text-status-warning";
    case "err":
      return "border-status-error/40 bg-status-error/6 text-status-error";
    default:
      return "border-border bg-bg-panel text-text-muted";
  }
}

function CapabilityCard({ label, value, status, hint }: CapabilityCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded border px-3 py-2 min-w-[9rem]",
        statusClass(status),
      )}
      title={hint}
    >
      <div className="text-[10px] font-mono uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="text-xs font-mono truncate">{value}</div>
    </div>
  );
}

/**
 * Consolidated runtime capability strip for the system page.
 * Shows Ollama liveness, canonical model readiness, RAM, warmup, and voice benchmark status.
 * Falls back gracefully when API is unreachable.
 */
export function RuntimeCapabilityStrip() {
  const caps = useRuntimeCapabilities();

  if (!caps || (caps as unknown as { apiOnline?: boolean }).apiOnline === false || (caps.status as string) === "offline") {
    return (
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 py-3 border-b border-border bg-bg-base"
        aria-live="polite"
        aria-atomic="true"
      >
        <CapabilityCard label="API Backend" value="offline (port 3001)" status="err" />
        <CapabilityCard label="Ollama" value="unreachable" status="err" />
        <CapabilityCard label="Models" value="offline" status="err" />
        <CapabilityCard label="Memory" value="unavailable" status="unknown" />
      </div>
    );
  }

  const ollamaStatus: CapabilityCardProps["status"] = caps.ollama?.reachable ? "ok" : "err";
  const ollamaValue = !caps.ollama?.reachable
    ? "unreachable"
    : caps.ollama.latencyMs != null
      ? `reachable · ${caps.ollama.latencyMs}ms`
      : "reachable";

  // Canonical model readiness — /api/system/health.models is a readiness triad, not loaded residency.
  const readyModels = (caps.models ?? []).filter((model) => model.status === "ready");
  const missingModels = (caps.models ?? []).filter((model) => model.status !== "ready");
  const modelStatus: CapabilityCardProps["status"] =
    (caps.models ?? []).length === 0 ? "unknown" : missingModels.length > 0 ? "err" : "ok";
  const modelValue =
    (caps.models ?? []).length === 0
      ? "unknown"
      : `${readyModels.length}/${caps.models.length} ready`;
  const modelHint =
    missingModels.length > 0
      ? missingModels
          .slice(0, 3)
          .map((model) => `${resolveOperatorName(model.tag)} (${model.status})`)
          .join(" · ")
      : "canonical router/reason/code profiles ready";

  // Memory status — mirrors backend threshold FULL_PIPELINE_MIN_AVAILABLE_MB=6170
  const availMb = (caps.memory?.availableGb ?? 0) * 1024;
  const memStatus: CapabilityCardProps["status"] =
    availMb < 4000 ? "err" : availMb < 6170 ? "warn" : "ok";

  // Voice benchmark status
  const bench = caps.voice?.benchmark;
  const voiceStatus: CapabilityCardProps["status"] = !bench
    ? "warn"
    : bench.stale
      ? "warn"
      : bench.recommendedProviderId === "espeak"
        ? "warn"
        : "ok";
  const voiceValue = bench
    ? `${bench.recommendedProviderId}${bench.stale ? " (stale)" : ""}`
    : "no benchmark";

  // Warmup status
  const warmupStatus: CapabilityCardProps["status"] = !caps.warmup
    ? "unknown"
    : caps.warmup.done
      ? "ok"
      : "warn";
  const warmupValue = caps.warmup
    ? caps.warmup.done
      ? "ready"
      : caps.warmup.coldStartEtaSecs !== null
        ? `cold (~${caps.warmup.coldStartEtaSecs}s ETA)`
        : "cold (ETA unknown)"
    : "unknown";

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-5 gap-2 px-4 py-3 border-b border-border bg-bg-base"
      role="region"
      aria-label="Runtime capabilities"
    >
      <CapabilityCard
        label="Ollama"
        value={ollamaValue}
        status={ollamaStatus}
        hint={caps.ollama.reachable ? `${caps.ollama.url} · ${caps.ollama.latencyMs ?? "?"}ms` : "endpoint not reachable"}
      />
      <CapabilityCard
        label="Model Readiness"
        value={modelValue}
        status={modelStatus}
        hint={modelHint}
      />
      <CapabilityCard
        label="RAM Available"
        value={`${caps.memory.availableGb.toFixed(1)} / ${caps.memory.totalGb.toFixed(1)} GB`}
        status={memStatus}
        hint="Full pipeline threshold: 6,170 MB available"
      />
      <CapabilityCard
        label="Warmup"
        value={warmupValue}
        status={warmupStatus}
        hint={caps.warmup?.source === "file" ? "startup-enhanced.sh active" : "no warmup marker file"}
      />
      <CapabilityCard
        label="Voice Benchmark"
        value={voiceValue}
        status={voiceStatus}
        hint={bench?.recommendationReason ?? "run voice-benchmark.ts to populate"}
      />
    </div>
  );
}
