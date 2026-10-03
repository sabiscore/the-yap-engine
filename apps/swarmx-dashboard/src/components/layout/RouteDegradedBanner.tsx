"use client";

import { getRuntimeGuidance } from "@/lib/runtime-guidance";

interface RouteDegradedBannerProps {
  readonly pressureLevel: string | undefined;
  readonly availableMb?: number | null;
  readonly apiOnline: boolean | null;
  readonly ollamaOnline: boolean | null;
}

export function RouteDegradedBanner({
  pressureLevel,
  availableMb,
  apiOnline,
  ollamaOnline,
}: RouteDegradedBannerProps) {
  const guidance = getRuntimeGuidance({
    apiOnline,
    ollamaOnline,
    pressureLevel,
    availableMb,
  });

  if (!guidance) {
    return null;
  }

  const critical = guidance.tone === "critical";

  return (
    <div
      className={[
        "flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2",
        critical
          ? "border-status-error/25 bg-status-error/[0.04]"
          : "border-status-warning/25 bg-status-warning/[0.04]",
      ].join(" ")}
      role={critical ? "alert" : "status"}
      aria-live={critical ? "assertive" : "polite"}
    >
      <span
        className={[
          "size-2 shrink-0 rounded-full",
          critical ? "bg-status-error" : "bg-status-warning",
        ].join(" ")}
        aria-hidden="true"
      />
      <p className="min-w-0 truncate text-xs font-medium text-text-primary">
        {guidance.title}
      </p>
      <span className="hidden min-w-0 truncate text-[10px] text-text-muted sm:inline">
        {guidance.recoveryHint}
      </span>
    </div>
  );
}
