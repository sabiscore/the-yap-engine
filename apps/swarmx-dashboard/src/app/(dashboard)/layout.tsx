"use client";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SystemStatus } from "@/components/SystemStatus";
import { TerminalStrip } from "@/components/layout/TerminalStrip";
import { ShortcutsOverlay } from "@/components/layout/ShortcutsOverlay";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useSwarmXEvents } from "@/hooks/useSwarmXEvents";

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
  "/video": "Video Studio",
  "/series": "Series",
  "/system": "System",
  "/settings": "Settings",
};

function DashboardShell({ children }: { readonly children: React.ReactNode }) {
  useSwarmXEvents();
  useKeyboard();

  const pathname = usePathname();
  const breadcrumb = BREADCRUMB_MAP[pathname] ?? "The Yap Engine";

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-bg-base">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-16 focus:z-[70] focus:rounded focus:border focus:border-border-active focus:bg-bg-elevated focus:px-3 focus:py-2 focus:text-xs focus:text-text-primary"
      >
        Skip to main content
      </a>

      <SystemStatus />

      <div className="min-h-0 flex-1">
        <main
          className="@container mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col bg-bg-base"
          id="main-content"
          tabIndex={-1}
          aria-label={breadcrumb}
        >
          <ScrollArea className="h-full flex-1">
            <div className="min-h-full pb-24 md:pb-0">{children}</div>
          </ScrollArea>
        </main>
      </div>

      <div className="shrink-0">
        <TerminalStrip />
      </div>

      <CommandPalette />
      <ShortcutsOverlay />
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardShell>{children}</DashboardShell>
    </QueryClientProvider>
  );
}
