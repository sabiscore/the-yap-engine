"use client";

import React, { useMemo } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { useEventsStore } from "@/stores/events";
import { Button } from "@/components/ui/button";
import type { ApiHealthState } from "@/hooks/useApiHealth";
import { getRuntimeGuidance } from "@/lib/runtime-guidance";

function formatAge(lastEventAt: number | null): string {
  if (lastEventAt == null) {
    return "No telemetry received yet";
  }

  const ageMs = Math.max(0, Date.now() - lastEventAt);
  if (ageMs < 1_000) {
    return "Telemetry just resumed";
  }
  if (ageMs < 60_000) {
    return `Last update ${Math.round(ageMs / 1_000)}s ago`;
  }
  return `Last update ${Math.round(ageMs / 60_000)}m ago`;
}

interface ConnectionBannerProps {
  readonly apiHealth: ApiHealthState;
}

export function ConnectionBanner({ apiHealth }: ConnectionBannerProps) {
  const isStale = useEventsStore((state) => state.isStale);
  const connectionStatus = useEventsStore((state) => state.connectionStatus);
  const lastEventAt = useEventsStore((state) => state.lastEventAt);
  const governorState = useEventsStore((state) => state.governorState);
  const startupSummary = useEventsStore((state) => state.startupSummary);
  const pressureLevel = governorState?.pressureLevel ?? startupSummary?.pressureLevel;
  const availableMb = governorState?.availableMb ?? startupSummary?.availableMb;
  const runtimeGuidance = getRuntimeGuidance({
    apiOnline: apiHealth.apiOnline,
    ollamaOnline: apiHealth.ollamaOnline,
    pressureLevel,
    availableMb,
  });

  const hasSseIssue = isStale || connectionStatus === "disconnected" || connectionStatus === "connecting";
  const visible = hasSseIssue || runtimeGuidance !== null;
  const sseMessage = useMemo(() => {
    if (connectionStatus === "disconnected") {
      return "Live telemetry stream disconnected. Operator metrics may be stale.";
    }
    if (connectionStatus === "connecting") {
      return "Connecting to the Yap Engine event stream.";
    }
    return "Telemetry has gone stale. Validate the API before acting on these metrics.";
  }, [connectionStatus]);

  if (!visible) {
    return null;
  }

  const isConnecting = connectionStatus === "connecting";
  const isAlert =
    connectionStatus === "disconnected" ||
    runtimeGuidance?.tone === "critical";
  const showRetry = !isConnecting && (hasSseIssue || apiHealth.apiOnline === false);

  return (
    <div
      className="border-b border-status-warning/30 bg-status-warning/10 px-4 py-2 panel-enter"
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {isConnecting && runtimeGuidance === null ? (
            <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning animate-spin" aria-hidden="true" />
          ) : (
            <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-status-warning">
              {runtimeGuidance?.title ?? sseMessage}
            </p>
            <p className="text-[10px] font-mono text-text-muted">
              {runtimeGuidance?.detail ?? formatAge(lastEventAt)}
            </p>
            {runtimeGuidance && (
              <p className="mt-0.5 text-[10px] font-mono text-text-secondary">
                {runtimeGuidance.recoveryHint}
              </p>
            )}
            {runtimeGuidance && hasSseIssue && (
              <p className="mt-0.5 text-[10px] font-mono text-text-muted">
                {sseMessage} {formatAge(lastEventAt)}.
              </p>
            )}
          </div>
        </div>
        {showRetry && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5 border border-status-warning/30 text-status-warning hover:bg-status-warning/10"
            onClick={() => globalThis.location.reload()}
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
