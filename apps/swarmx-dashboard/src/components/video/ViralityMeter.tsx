/**
 * SignalEstimate — 5-dimension engagement heuristic display
 *
 * Renders Hook / Completion / Shareability / SEO / Overall as labeled bars
 * with colour-coded thresholds:
 *   < 0.4  → red-400
 *   0.4–0.7 → amber-400
 *   > 0.7  → emerald-400
 *
 * Accepts values 0–100 (API normalised) or 0–1 (raw).
 * Uses @radix-ui/react-tooltip for per-bar Oracle reasoning excerpts.
 */

"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import type { ViralitySignal } from "@swarmx/types/video-types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SignalEstimateProps {
  signal: ViralitySignal;
  isScoring?: boolean;
  /** When true renders a single-row compact variant for use inside cards. */
  compact?: boolean;
  /** Called when the user clicks the "Improve" button. */
  onImprove?: () => void;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Normalise a value to the 0–1 range, accepting either 0–1 or 0–100 input. */
function normalise(value: number): number {
  if (value > 1) return value / 100;
  return value;
}

/** Resolve the colour class for a normalised 0–1 score. */
function scoreColour(norm: number): string {
  if (norm < 0.4) return "text-red-400";
  if (norm <= 0.7) return "text-amber-400";
  return "text-emerald-400";
}

/** Resolve the bar fill class for a normalised 0–1 score. */
function barColour(norm: number): string {
  if (norm < 0.4) return "bg-red-400/30 border border-red-400/40";
  if (norm <= 0.7) return "bg-amber-400/30 border border-amber-400/40";
  return "bg-emerald-400/30 border border-emerald-400/40";
}

// ─── Recommendation excerpts per dimension ────────────────────────────────────

function dimensionReasoning(
  signal: ViralitySignal,
  dimension: string,
): string {
  const recs = signal.recommendations;
  if (!recs || recs.length === 0) return "No recommendations available.";

  // Try to find a recommendation mentioning the dimension keyword
  const keywordMap: Record<string, string[]> = {
    Hook: ["hook", "interrupt", "3 second", "scroll", "opening"],
    Completion: ["completion", "watch time", "end", "reveal", "pacing"],
    Shareability: ["share", "emotion", "relat", "forward", "unique"],
    SEO: ["caption", "hashtag", "keyword", "cta", "seo"],
    Overall: ["overall", "improve", "structure"],
  };

  const keywords = keywordMap[dimension] ?? [];
  const match = recs.find((r) =>
    keywords.some((kw) => r.toLowerCase().includes(kw)),
  );

  return match ?? recs[0] ?? "No recommendations available.";
}

// ─── Single bar ───────────────────────────────────────────────────────────────

interface DimensionBarProps {
  label: string;
  value: number;
  reasoning: string;
  compact?: boolean;
}

function DimensionBar({ label, value, reasoning, compact = false }: DimensionBarProps) {
  const norm = normalise(value);
  const pct = Math.round(norm * 100);
  const colour = scoreColour(norm);
  const fill = barColour(norm);

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <div
          className={`flex flex-col gap-1 cursor-default ${compact ? "min-w-[4rem]" : ""}`}
          tabIndex={0}
          aria-label={`${label}: ${pct} out of 100. ${reasoning}`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] uppercase tracking-wider text-text-muted font-mono">
              {label}
            </span>
            <span className={`text-[10px] font-mono tabular-nums ${colour}`}>
              {pct}
            </span>
          </div>
          <div className="h-2 rounded bg-bg-surface overflow-hidden border border-border">
            <div
              className={`h-full rounded transition-all duration-700 ease-out ${fill}`}
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-label={`${label} engagement heuristic`}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="
            z-50 max-w-xs rounded border border-border bg-bg-surface px-2 py-1.5
            text-xs text-text-secondary shadow-xl leading-relaxed
          "
        >
          <p className="font-mono text-text-primary mb-1 text-[10px]">{label}</p>
          <p>{reasoning}</p>
          <Tooltip.Arrow className="fill-bg-surface" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const DIMENSIONS: Array<{ key: keyof ViralitySignal; label: string }> = [
  { key: "hookStrength", label: "Hook" },
  { key: "completionProxy", label: "Completion" },
  { key: "shareability", label: "Shareability" },
  { key: "seoScore", label: "SEO" },
  { key: "overall", label: "Overall" },
];

export function SignalEstimate({ signal, isScoring = false, compact = false, onImprove }: SignalEstimateProps) {
  const overallNorm = normalise(signal.overall);
  const overallPct = Math.round(overallNorm * 100);
  const overallColour = scoreColour(overallNorm);

  if (isScoring) {
    return (
      <section aria-label="signal estimate loading" className="rounded border border-border bg-bg-elevated p-3">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-2 animate-pulse bg-bg-elevated rounded" />
          ))}
        </div>
      </section>
    );
  }

  if (compact) {
    const fill = barColour(overallNorm);
    return (
      <div className="flex items-center gap-2 w-full" aria-label={`Engagement heuristic score: ${overallPct} out of 100`}>
        <div className="h-1.5 rounded bg-bg-surface border border-border overflow-hidden flex-1">
          <div
            className={`h-full rounded transition-all duration-700 ease-out ${fill}`}
            style={{ width: `${overallPct}%` }}
            role="progressbar"
            aria-valuenow={overallPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Engagement heuristic: ${overallPct} out of 100`}
          />
        </div>
        <span className={`text-[10px] font-mono ${overallColour}`}>{overallPct}</span>
      </div>
    );
  }

  return (
    <section
      aria-label="Engagement heuristic score"
      className="rounded border border-border bg-bg-elevated p-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xs font-mono text-text-secondary uppercase tracking-wider">
            Engagement Heuristic
          </h3>
          <p className="text-[10px] text-text-muted mt-0.5 font-mono">
            Heuristic guidance scored by {signal.scoredBy}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`text-2xl font-bold tabular-nums font-mono ${overallColour}`}
            aria-label={`Overall engagement heuristic score: ${overallPct} out of 100`}
          >
            {overallPct}
            <span className="text-xs text-text-muted font-normal">/100</span>
          </div>
          {onImprove && (
            <button
              onClick={onImprove}
              aria-label="Get recommendations to improve engagement score"
              className="
                text-[10px] font-mono text-text-muted hover:text-accent border border-border px-2 py-0.5 rounded
              "
            >
              Improve
            </button>
          )}
        </div>
      </div>

      {/* Dimension bars — single Provider wraps all bars */}
      <Tooltip.Provider delayDuration={300}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {DIMENSIONS.map(({ key, label }) => (
            <DimensionBar
              key={key}
              label={label}
              value={signal[key] as number}
              reasoning={dimensionReasoning(signal, label)}
              compact={false}
            />
          ))}
        </div>
      </Tooltip.Provider>

      {/* Recommendations */}
      {signal.recommendations && signal.recommendations.length > 0 && (
        <div className="mt-4 rounded border border-border bg-bg-surface p-3">
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2 font-mono">
            Suggested Improvements
          </p>
          <ul className="space-y-1.5">
            {signal.recommendations.map((rec, idx) => (
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


/* Claim-integrity contract: displayed values are unmeasured planning signals, not predictions. */
