"use client";


import { getRuntimeGuidance } from "@/lib/runtime-guidance";
import { StateBadge } from "@/components/ui/state-badge";

interface RouteDegradedBannerProps {
  readonly pressureLevel: string | undefined;
  readonly availableMb?: number | null;
  readonly apiOnline: boolean | null;
  readonly ollamaOnline: boolean | null;
}

/**
 * Route-level degraded-state banner. Returns null when the runtime is healthy.
 * Each route page reads pressureLevel/ollamaOnline from useEventsStore + useApiHealth
 * and passes them here — no additional store reads inside.
 */
export function RouteDegradedBanner({
  pressureLevel,
  availableMb,
  apiOnline,
  ollamaOnline,
}: RouteDegradedBannerProps) {
  const guidance = getRuntimeGuidance({ apiOnline, ollamaOnline, pressureLevel, availableMb });

  if (!guidance) {
    return null;
  }


  return (
    <div
      className={
        guidance.tone === "critical"
          ? "flex items-start gap-3 rounded border border-status-error/35 bg-status-error/10 px-3 py-3"
          : "flex items-start gap-3 rounded border border-status-warning/35 bg-status-warning/10 px-3 py-3"
      }
      role={guidance.tone === "critical" ? "alert" : "status"}
      aria-live={guidance.tone === "critical" ? "assertive" : "polite"}
    >
      <div className="mt-0.5 flex shrink-0 items-center">
        <StateBadge state={guidance.tone === "critical" ? "offline" : "degraded"} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-status-warning">{guidance.title}</p>
        <p className="mt-1 text-xs leading-5 text-text-secondary">{guidance.detail}</p>
        <p className="mt-1 text-xs leading-5 text-text-muted">{guidance.recoveryHint}</p>
      </div>
    </div>
  );
}
