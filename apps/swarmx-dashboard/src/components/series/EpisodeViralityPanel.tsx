"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import type { EpisodeViralityScore } from "@swarmx/types/series-types";

function scoreColor(v: number): string {
  if (v < 0.4) return "text-red-400";
  if (v <= 0.7) return "text-amber-400";
  return "text-emerald-400";
}

function barColor(v: number): string {
  if (v < 0.4) return "bg-red-400/30 border border-red-400/40";
  if (v <= 0.7) return "bg-amber-400/30 border border-amber-400/40";
  return "bg-emerald-400/30 border border-emerald-400/40";
}

const DIMENSIONS = [
  { key: "hookStrength"   as const, label: "Hook" },
  { key: "completionProxy" as const, label: "Completion" },
  { key: "shareability"  as const, label: "Shareability" },
  { key: "seoScore"      as const, label: "SEO" },
];

interface DimensionBarProps {
  label: string;
  value: number;
  recommendation?: string;
}

function DimensionBar({ label, value, recommendation }: DimensionBarProps) {
  const pct = Math.round(value * 100);
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <div
          className="flex flex-col gap-1 cursor-default"
          tabIndex={0}
          aria-label={`${label}: ${pct} out of 100${recommendation ? `. ${recommendation}` : ""}`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              {label}
            </span>
            <span className={cn("font-mono text-[10px] tabular-nums", scoreColor(value))}>
              {pct}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded border border-border bg-bg-surface">
            <div
              className={cn("h-full rounded transition-all duration-700 ease-out", barColor(value))}
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${label} score`}
            />
          </div>
        </div>
      </Tooltip.Trigger>
      {recommendation && (
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={6}
            className="z-50 max-w-xs rounded border border-border bg-bg-surface px-2 py-1.5 text-xs text-text-secondary shadow-xl"
          >
            <p className="mb-1 font-mono text-[10px] text-text-primary">{label}</p>
            <p>{recommendation}</p>
            <Tooltip.Arrow className="fill-bg-surface" />
          </Tooltip.Content>
        </Tooltip.Portal>
      )}
    </Tooltip.Root>
  );
}

interface EpisodeViralityPanelProps {
  score: EpisodeViralityScore;
}

export function EpisodeViralityPanel({ score }: EpisodeViralityPanelProps) {
  const overallPct = Math.round(score.overall * 100);
  const gateColor = score.overall >= 0.7 ? "text-emerald-400" : score.overall >= 0.65 ? "text-amber-400" : "text-red-400";

  return (
    <section aria-label="Episode virality score" className="rounded border border-border bg-bg-elevated p-3 space-y-4">
      {/* Header + overall */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-xs uppercase tracking-wider text-text-secondary">
            Signal estimate — not measured
          </h3>
          <p className="mt-0.5 font-mono text-[10px] text-text-muted">
            Gate: ≥ 65 to produce · ≥ 70 preferred
          </p>
        </div>
        <div
          className={cn("font-mono text-2xl font-bold tabular-nums", gateColor)}
          aria-label={`Overall virality score: ${overallPct} out of 100`}
        >
          {overallPct}
          <span className="font-normal text-xs text-text-muted">/100</span>
        </div>
      </div>

      {/* Dimension bars */}
      <Tooltip.Provider delayDuration={300}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {DIMENSIONS.map(({ key, label }) => (
            <DimensionBar
              key={key}
              label={label}
              value={score[key]}
            />
          ))}
        </div>
      </Tooltip.Provider>

      {/* Recommendations */}
      {score.recommendations.length > 0 && (
        <div className="rounded border border-border bg-bg-surface p-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Recommendations
          </p>
          <ul className="space-y-1.5">
            {score.recommendations.map((rec, idx) => (
              <li key={idx} className="flex gap-2 text-xs text-text-secondary">
                <span className="mt-0.5 shrink-0 text-amber-400">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
