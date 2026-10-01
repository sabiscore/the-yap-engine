"use client";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSwarmXEvents } from "@/hooks/useSwarmXEvents";
import { useKeyboard } from "@/hooks/useKeyboard";
import { ShortcutsOverlay } from "@/components/layout/ShortcutsOverlay";
import { CommandPalette } from "@/components/command-palette/CommandPalette";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function DashboardRuntime({ children }: { readonly children: React.ReactNode }) {
  useSwarmXEvents();
  useKeyboard();

  return (
    <>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto min-h-[calc(100dvh-3.5rem)] w-full max-w-7xl bg-bg-base px-4 py-4 sm:px-6 sm:py-6"
      >
        {children}
      </main>
      <CommandPalette />
      <ShortcutsOverlay />
    </>
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
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:border focus:border-border-active focus:bg-bg-elevated focus:px-3 focus:py-2 focus:text-xs focus:text-text-primary"
      >
        Skip to main content
      </a>
      <DashboardRuntime>{children}</DashboardRuntime>
    </QueryClientProvider>
  );
}
