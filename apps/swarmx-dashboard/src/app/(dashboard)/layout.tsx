"use client";

import React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { CommandBar } from "@/components/layout/CommandBar";
import { ConnectionBanner } from "@/components/layout/ConnectionBanner";
import { NavRail } from "@/components/layout/NavRail";
import { TelemetryRail } from "@/components/layout/TelemetryRail";
import { TerminalStrip } from "@/components/layout/TerminalStrip";
import { ShortcutsOverlay } from "@/components/layout/ShortcutsOverlay";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSwarmXEvents } from "@/hooks/useSwarmXEvents";
import { useApiHealth } from "@/hooks/useApiHealth";
import { useKeyboard } from "@/hooks/useKeyboard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePathname } from "next/navigation";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const BREADCRUMB_MAP: Record<string, string> = {
  "/": "Overview",
  "/agents": "Agent Fleet",
  "/workflows": "Workflows",
  "/composer": "Composer",
  "/logs": "Logs",
  "/video": "Video",
  "/series": "Series",
  "/system": "System",
  "/settings": "Settings",
};

// Inner client component that mounts hooks (must be "use client")
function DashboardShell({ children }: { readonly children: React.ReactNode }) {
  useSwarmXEvents();
  useKeyboard();

  const breadcrumb = useBreadcrumb();
  const apiHealth = useApiHealth();

  return (
    <AppShell>
      {/* Row 1, Col 1-3 */}
      <CommandBar breadcrumb={breadcrumb} apiHealth={apiHealth} />

      {/* Row 2, Col 1 */}
      <NavRail />

      {/* Row 2, Col 2 — scrollable content zone */}
      <main
        className="@container row-start-2 col-start-2 overflow-hidden flex flex-col bg-bg-base"
        id="main-content"
        tabIndex={-1}
      >
        <ConnectionBanner apiHealth={apiHealth} />
        <ScrollArea className="flex-1 h-full">
          <div className="min-h-full">
            {children}
          </div>
        </ScrollArea>
      </main>

      {/* Row 2, Col 3 */}
      <TelemetryRail />

      {/* Row 3, Col 1-3 */}
      <TerminalStrip />

      {/* Portals */}
      <CommandPalette />
      <ShortcutsOverlay />
    </AppShell>
  );
}

function useBreadcrumb(): string {
  const pathname = usePathname();
  return BREADCRUMB_MAP[pathname] ?? "The Yap Engine";
}

export default function DashboardLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-50 focus:rounded focus:border focus:border-border-active focus:bg-bg-elevated focus:px-2 focus:py-1 focus:text-xs focus:text-text-primary"
      >
        Skip to main content
      </a>
      <DashboardShell>{children}</DashboardShell>
    </QueryClientProvider>
  );
}
