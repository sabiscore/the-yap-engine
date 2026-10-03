"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileVideo,
  Activity,
  Maximize2,
  Minimize2,
  Volume2,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Sparkles,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QcReport, VideoQualityGateResult } from "@swarmx/types/video-types";

export interface MediaProbeData {
  width: number;
  height: number;
  duration: number;
  videoCodec: string;
  audioCodec: string;
}

export interface LoudnessTelemetry {
  integratedLUFS: number;
  truePeakDBTP: number;
  loudnessRangeLRA?: number;
  compliant: boolean;
}

export interface QualityGateTelemetryCardProps {
  jobId?: string;
  qcReport?: QcReport | null;
  maxDriftMs?: number | null;
  mediaPath?: string | null;
  probeData?: MediaProbeData | null;
  loudness?: LoudnessTelemetry | null;
  ffmpegLogs?: string[] | null;
  className?: string;
}

const GATE_DESCRIPTIONS: Record<string, { label: string; specTarget: string }> = {
  "G-S": { label: "Script Integrity", specTarget: "2.6 wps ±35%, ≤2 CAPS" },
  "G-V": { label: "Voice Synthesis", specTarget: "Kokoro neural local" },
  "G-A": { label: "Word Alignment", specTarget: "Max drift ≤ 400ms" },
  "G-P": { label: "Pacing & Cadence", specTarget: "Holds 700ms–3600ms" },
  "G-T": { label: "Typography Safe Box", specTarget: "MarginV=480, ≤26 chars" },
  "G-M": { label: "Audio Mastering", specTarget: "-14 ± 2.0 LUFS, TP ≤ -1.0" },
  "G-C": { label: "Rights & Licensing", specTarget: "OFL-1.1 & Kokoro Apache-2" },
  "G-R": { label: "Resolution & Encoding", specTarget: "1080x1920 (9:16), H.264/AAC" },
};

export function QualityGateTelemetryCard({
  jobId = "active-render",
  qcReport,
  maxDriftMs,
  mediaPath,
  probeData,
  loudness,
  ffmpegLogs = [],
  className,
}: QualityGateTelemetryCardProps) {
  const [showLogs, setShowLogs] = useState(false);
  const [selectedGate, setSelectedGate] = useState<string | null>(null);

  const gates: Record<string, VideoQualityGateResult> = qcReport?.gates ?? {};
  const allPassed = qcReport ? qcReport.passed : false;
  const gateEntries = Object.entries(GATE_DESCRIPTIONS).map(([gateKey, meta]) => {
    const res = gates[gateKey];
    return {
      gateKey,
      label: meta.label,
      specTarget: meta.specTarget,
      passed: res ? res.passed : null,
      issues: res?.issues ?? [],
      metrics: res?.metrics ?? {},
    };
  });

  // Calculate live alignment metric fallback if not yet in report
  const effectiveMaxDrift =
    maxDriftMs ??
    (typeof gates["G-A"]?.metrics?.maxDriftMs === "number"
      ? (gates["G-A"]?.metrics?.maxDriftMs as number)
      : null);

  const effectiveLoudness =
    loudness ??
    (gates["G-M"]?.metrics
      ? {
          integratedLUFS: (gates["G-M"].metrics.integratedLUFS as number) ?? -70,
          truePeakDBTP: (gates["G-M"].metrics.truePeakDBTP as number) ?? 0,
          compliant: (gates["G-M"].metrics.compliant as boolean) ?? false,
        }
      : null);

  return (
    <section
      aria-label="Quality Gate Telemetry Surface"
      className={cn(
        "rounded-xl border border-border bg-[#0E0E10] text-text-primary p-4 sm:p-5 shadow-2xl transition-all card-interactive",
        className,
      )}
    >
      {/* Header with Space Grotesk Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border/70">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-[#1B1B1D]">
            {allPassed ? (
              <ShieldCheck className="size-5 text-[#10B981]" aria-hidden="true" />
            ) : (
              <ShieldAlert className="size-5 text-status-warning" aria-hidden="true" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-sm sm:text-base font-semibold tracking-tight text-white">
                Quality Gate Telemetry & Media Certification
              </h2>
              <span
                className={cn(
                  "font-mono text-[10px] px-2 py-0.5 rounded-full border",
                  allPassed
                    ? "border-[#10B981]/50 bg-[#10B981]/10 text-[#10B981]"
                    : "border-status-warning/50 bg-status-warning/10 text-status-warning",
                )}
              >
                {allPassed ? "CERTIFIED V5.1" : "EVALUATING / FAIL-CLOSED"}
              </span>
            </div>
            <p className="font-mono text-[11px] text-text-muted mt-0.5">
              Job ID: <span className="text-[#00F2FE]">{jobId}</span> · Fail-Closed
              Enforcement
            </p>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLogs((prev) => !prev)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-[#1B1B1D] px-3 text-xs font-mono text-text-secondary hover:text-white hover:border-[#00F2FE]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F2FE]"
            aria-expanded={showLogs}
            aria-label="Toggle live FFmpeg render logs"
          >
            <Terminal className="size-3.5 text-[#00F2FE]" aria-hidden="true" />
            <span>Logs ({ffmpegLogs?.length ?? 0})</span>
          </button>
        </div>
      </div>

      {/* Critical Telemetry Metric Bento Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
        {/* Metric 1: Word Alignment Drift (G-A) */}
        <div className="rounded-lg border border-border bg-[#1B1B1D] p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-heading text-xs font-medium text-text-secondary">
              Max Alignment Drift (G-A)
            </span>
            <Activity className="size-4 text-[#00F2FE]" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-2xl font-bold tabular-nums",
                effectiveMaxDrift !== null && effectiveMaxDrift <= 400
                  ? "text-[#10B981]"
                  : effectiveMaxDrift !== null
                    ? "text-[#EF4444]"
                    : "text-text-muted",
              )}
            >
              {effectiveMaxDrift !== null ? `${effectiveMaxDrift}ms` : "–"}
            </span>
            <span className="font-mono text-[10px] text-text-muted">
              target ≤ 400ms
            </span>
          </div>
          <div className="mt-1 text-[10px] font-mono text-text-muted">
            {effectiveMaxDrift !== null && effectiveMaxDrift <= 400 ? (
              <span className="text-[#10B981]">✓ Zero perceptual latency</span>
            ) : (
              <span>Whisper anchored to canonical script</span>
            )}
          </div>
        </div>

        {/* Metric 2: Audio Loudness & True Peak (G-M) */}
        <div className="rounded-lg border border-border bg-[#1B1B1D] p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-heading text-xs font-medium text-text-secondary">
              Post-Encode Loudness (G-M)
            </span>
            <Volume2 className="size-4 text-[#00F2FE]" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-2xl font-bold tabular-nums",
                effectiveLoudness?.compliant ? "text-[#10B981]" : "text-[#EF4444]",
              )}
            >
              {effectiveLoudness
                ? `${effectiveLoudness.integratedLUFS.toFixed(1)} LUFS`
                : "–"}
            </span>
            <span className="font-mono text-[10px] text-text-muted">
              TP: {effectiveLoudness?.truePeakDBTP.toFixed(1) ?? "–"} dBTP
            </span>
          </div>
          <div className="mt-1 text-[10px] font-mono text-text-muted">
            {effectiveLoudness?.compliant ? (
              <span className="text-[#10B981]">✓ EBU R128 broadcast compliant</span>
            ) : (
              <span>Target: -14.0 LUFS ± 2.0 (TP ≤ -1.0 dBTP)</span>
            )}
          </div>
        </div>

        {/* Metric 3: Media Probe Format (G-R) */}
        <div className="rounded-lg border border-border bg-[#1B1B1D] p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-heading text-xs font-medium text-text-secondary">
              Output Format & Resolution (G-R)
            </span>
            <FileVideo className="size-4 text-[#00F2FE]" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-white tabular-nums">
              {probeData
                ? `${probeData.width}x${probeData.height}`
                : "1080x1920"}
            </span>
            <span className="font-mono text-[10px] text-[#00F2FE]">
              9:16 Vertical
            </span>
          </div>
          <div className="mt-1 text-[10px] font-mono text-text-muted truncate" title={mediaPath ?? undefined}>
            {probeData
              ? `${probeData.videoCodec.toUpperCase()} / ${probeData.audioCodec.toUpperCase()}`
              : mediaPath ? mediaPath.split("/").pop() : "H.264 / AAC 192k"}
          </div>
        </div>
      </div>

      {/* 8 Quality Gates Matrix */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading text-xs font-semibold text-text-secondary tracking-wide uppercase">
            Quality Gate Verification Matrix (G-S to G-R)
          </h3>
          <span className="font-mono text-[10px] text-text-muted">
            8/8 Required for Publish
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {gateEntries.map((gate) => {
            const isPassing = gate.passed === true;
            const isFailing = gate.passed === false;
            const isSelected = selectedGate === gate.gateKey;

            return (
              <button
                key={gate.gateKey}
                type="button"
                onClick={() =>
                  setSelectedGate(isSelected ? null : gate.gateKey)
                }
                className={cn(
                  "flex flex-col items-start p-2.5 rounded-lg border text-left transition-all min-h-11",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F2FE]",
                  isSelected
                    ? "border-[#00F2FE] bg-[#1B1B1D]"
                    : "border-border bg-[#1B1B1D]/60 hover:bg-[#1B1B1D] hover:border-border-active",
                  isPassing && "border-[#10B981]/40 bg-[#10B981]/5",
                  isFailing && "border-[#EF4444]/40 bg-[#EF4444]/5",
                )}
                aria-pressed={isSelected}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-mono text-xs font-bold text-white">
                    {gate.gateKey}
                  </span>
                  {isPassing ? (
                    <CheckCircle2
                      className="size-3.5 text-[#10B981]"
                      aria-label="Passed"
                    />
                  ) : isFailing ? (
                    <XCircle
                      className="size-3.5 text-[#EF4444]"
                      aria-label="Failed"
                    />
                  ) : (
                    <span className="size-2 rounded-full bg-text-muted/40" />
                  )}
                </div>
                <span className="font-heading text-xs font-medium text-text-primary mt-1 line-clamp-1">
                  {gate.label}
                </span>
                <span className="font-mono text-[9px] text-text-muted mt-0.5 line-clamp-1">
                  {gate.specTarget}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded Gate Detail Inspector */}
      {selectedGate && (
        <div className="mt-3 p-3 rounded-lg border border-[#00F2FE]/30 bg-[#1B1B1D] panel-enter">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#00F2FE]">
                {selectedGate}: {GATE_DESCRIPTIONS[selectedGate]?.label}
              </span>
              <span className="font-mono text-[10px] text-text-muted">
                (Spec: {GATE_DESCRIPTIONS[selectedGate]?.specTarget})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedGate(null)}
              className="text-xs font-mono text-text-muted hover:text-white min-h-8 min-w-8 flex items-center justify-center"
              aria-label="Close detail"
            >
              ✕
            </button>
          </div>

          {gates[selectedGate]?.issues && gates[selectedGate].issues.length > 0 ? (
            <div className="mt-2 space-y-1">
              <div className="text-[10px] font-mono font-medium text-[#EF4444]">
                Detected Issues:
              </div>
              <ul className="list-disc list-inside text-xs font-mono text-[#EF4444]/90 space-y-0.5">
                {gates[selectedGate].issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-2 text-xs font-mono text-[#10B981]">
              ✓ All gate assertions met nominal thresholds.
            </div>
          )}

          {gates[selectedGate]?.metrics && (
            <div className="mt-2 pt-2 border-t border-border/50 text-[10px] font-mono text-text-muted">
              Metrics: {JSON.stringify(gates[selectedGate].metrics)}
            </div>
          )}
        </div>
      )}

      {/* Collapsible Live FFmpeg Logs Terminal */}
      {showLogs && (
        <div className="mt-4 rounded-lg border border-border bg-[#000000] p-3 panel-enter">
          <div className="flex items-center justify-between pb-2 border-b border-border/40 text-[11px] font-mono text-text-muted">
            <span className="flex items-center gap-2">
              <Terminal className="size-3.5 text-[#00F2FE]" />
              Live FFmpeg Render & Encoding Stream
            </span>
            <span className="text-[10px]">JetBrains Mono</span>
          </div>
          <div
            className="mt-2 max-h-48 overflow-y-auto space-y-1 font-mono text-[11px] leading-relaxed text-[#00F2FE]"
            role="log"
            aria-live="polite"
          >
            {ffmpegLogs && ffmpegLogs.length > 0 ? (
              ffmpegLogs.map((logLine, idx) => (
                <div key={idx} className="whitespace-pre-wrap">
                  {logLine}
                </div>
              ))
            ) : (
              <div className="text-text-muted italic">
                No active render logs in buffer.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
