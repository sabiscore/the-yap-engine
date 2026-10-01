"use client";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSwarmXEvents } from "@/hooks/useSwarmXEvents";
import { useKeyboard } from "@/hooks/useKeyboard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { ShortcutsOverlay } from "@/components/layout/ShortcutsOverlay";
import { SystemStatus } from "@/components/SystemStatus";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function DashboardShell({ children }: { readonly children: React.ReactNode }) {
  useSwarmXEvents();
  useKeyboard();

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-base">
      <SystemStatus />

      <main
        className="min-h-0 flex-1 overflow-hidden bg-bg-base"
        id="main-content"
        tabIndex={-1}
      >
        <ScrollArea className="h-full">
          <div className="min-h-full px-3 pb-24 pt-3 sm:px-5 sm:pb-8 sm:pt-4 md:px-6">
            {children}
          </div>
        </ScrollArea>
      </main>

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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-[60] focus:rounded-md focus:border focus:border-border-active focus:bg-bg-elevated focus:px-3 focus:py-2 focus:text-xs focus:text-text-primary"
      >
        Skip to main content
      </a>
      <DashboardShell>{children}</DashboardShell>
    </QueryClientProvider>
  );
}
