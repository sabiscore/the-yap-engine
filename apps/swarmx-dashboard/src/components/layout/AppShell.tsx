"use client";

import React from "react";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

interface AppShellProps {
  readonly children: React.ReactNode;
}

/**
 * Four-zone CSS Grid layout shell.
 *
 * Columns: [nav] · [content] · [telemetry]
 * Rows:    [command-bar] · [main] · [terminal]
 *
 * Grid transitions animate on nav expand/collapse and terminal show/hide.
 * All zone dimensions are CSS custom properties for single-source-of-truth sizing.
 */
export function AppShell({ children }: AppShellProps) {
  const navExpanded = useUIStore((s) => s.navExpanded);
  const terminalVisible = useUIStore((s) => s.terminalVisible);
  const terminalFullscreen = useUIStore((s) => s.terminalFullscreen);
  const telemetryRailVisible = useUIStore((s) => s.telemetryRailVisible);

  if (terminalFullscreen) {
    return (
      <div className="h-dvh w-full flex flex-col bg-bg-base overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "h-dvh w-full overflow-hidden",
        "grid grid-cols-[var(--app-nav-width)_1fr_var(--app-telemetry-width)]",
        "grid-rows-[var(--command-bar-height)_1fr_var(--app-terminal-height)]",
        "transition-[grid-template-columns,grid-template-rows] duration-(--duration-panel) ease-snap",
        "motion-reduce:transition-none",
        navExpanded
          ? "[--app-nav-width:var(--nav-rail-expanded)]"
          : "[--app-nav-width:var(--nav-rail-width)]",
        telemetryRailVisible
          ? "[--app-telemetry-width:0px] lg:[--app-telemetry-width:var(--telemetry-width)]"
          : "[--app-telemetry-width:0px]",
        terminalVisible
          ? "[--app-terminal-height:0px] md:[--app-terminal-height:var(--terminal-height)]"
          : "[--app-terminal-height:0px]"
      )}
    >
      {children}
    </div>
  );
}
