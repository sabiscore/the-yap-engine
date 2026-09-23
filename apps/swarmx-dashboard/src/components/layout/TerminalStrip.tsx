"use client";

import React, { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import { Plus, X, Maximize2, Minimize2, ChevronDown } from "lucide-react";
import type { TerminalTab } from "@swarmx/types";

// Dynamically import XTerminal to avoid SSR issues
const XTerminal = lazy(() =>
  import("@/components/terminal/XTerminal").then((m) => ({ default: m.XTerminal }))
);

// ── Tab indicator dot ─────────────────────────────────────────────────────────

function TabDot({ exitCode }: { readonly exitCode: number | null }) {
  if (exitCode === null) return <span className="status-dot" data-status="active" />;
  if (exitCode === 0) return <span className="status-dot" data-status="success" />;
  return <span className="status-dot" data-status="error" />;
}

// ── Single PTY terminal tab ───────────────────────────────────────────────────

interface TerminalInstanceProps {
  readonly tab: TerminalTab;
  readonly active: boolean;
}

function TerminalInstance({ tab, active }: TerminalInstanceProps) {
  return (
    <div
      className={cn("absolute inset-0", active ? "block" : "hidden")}
      data-terminal-instance
      data-tab-id={tab.id}
    >
      <Suspense fallback={<div className="w-full h-full bg-bg-base" />}>
        <XTerminal
          sessionId={tab.sessionId}
          {...(tab.agentId !== undefined && { agentId: tab.agentId })}
          active={active}
        />
      </Suspense>
    </div>
  );
}

// ── Main TerminalStrip ────────────────────────────────────────────────────────

export function TerminalStrip() {
  const terminalVisible = useUIStore((s) => s.terminalVisible);
  const terminalFullscreen = useUIStore((s) => s.terminalFullscreen);
  const terminalTabs = useUIStore((s) => s.terminalTabs);
  const activeTerminalTabId = useUIStore((s) => s.activeTerminalTabId);
  const toggleTerminal = useUIStore((s) => s.toggleTerminal);
  const toggleTerminalFullscreen = useUIStore((s) => s.toggleTerminalFullscreen);
  const addTerminalTab = useUIStore((s) => s.addTerminalTab);
  const removeTerminalTab = useUIStore((s) => s.removeTerminalTab);
  const setActiveTerminalTab = useUIStore((s) => s.setActiveTerminalTab);

  if (terminalFullscreen) {
    // Full-screen mode: render outside the grid as a portal-like overlay
    return (
      <div className="fixed inset-0 z-60 flex flex-col bg-bg-base">
        <TerminalTabBar
          tabs={terminalTabs}
          activeId={activeTerminalTabId}
          onTabClick={setActiveTerminalTab}
          onTabClose={removeTerminalTab}
          onAddTab={() => addTerminalTab()}
          onToggle={toggleTerminal}
          onToggleFullscreen={toggleTerminalFullscreen}
          isFullscreen={true}
        />
        <div className="relative flex-1 overflow-hidden">
          {terminalTabs.map((tab) => (
            <TerminalInstance
              key={tab.id}
              tab={tab}
              active={tab.id === activeTerminalTabId}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "col-span-3 row-start-3 flex flex-col",
        "h-(--terminal-strip-height)",
        "bg-bg-base",
        terminalVisible ? "border-t border-border" : "border-t-0",
        "overflow-hidden",
        "transition-[height] duration-(--duration-panel) ease-snap",
        terminalVisible
          ? "[--terminal-strip-height:0px] md:[--terminal-strip-height:var(--terminal-height)]"
          : "[--terminal-strip-height:0px]",
        !terminalVisible && "pointer-events-none"
      )}
      aria-hidden={!terminalVisible ? "true" : undefined}
      inert={!terminalVisible ? true : undefined}
    >
      <TerminalTabBar
        tabs={terminalTabs}
        activeId={activeTerminalTabId}
        onTabClick={setActiveTerminalTab}
        onTabClose={removeTerminalTab}
        onAddTab={() => addTerminalTab()}
        onToggle={toggleTerminal}
        onToggleFullscreen={toggleTerminalFullscreen}
        isFullscreen={false}
      />
      <div className="relative flex-1 overflow-hidden">
        {terminalTabs.map((tab) => (
          <TerminalInstance
            key={tab.id}
            tab={tab}
            active={tab.id === activeTerminalTabId}
          />
        ))}
      </div>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

interface TerminalTabBarProps {
  readonly tabs: TerminalTab[];
  readonly activeId: string | null;
  readonly onTabClick: (id: string) => void;
  readonly onTabClose: (id: string) => void;
  readonly onAddTab: () => void;
  readonly onToggle: () => void;
  readonly onToggleFullscreen: () => void;
  readonly isFullscreen: boolean;
}

function TerminalTabBar({
  tabs,
  activeId,
  onTabClick,
  onTabClose,
  onAddTab,
  onToggle,
  onToggleFullscreen,
  isFullscreen,
}: TerminalTabBarProps) {
  return (
    <div
      className={cn(
        "flex items-center h-8 border-b border-border bg-bg-surface shrink-0 px-1 gap-0.5"
      )}
      aria-label="Terminal sessions"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <div key={tab.id} className="group inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onTabClick(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onTabClick(tab.id);
                }
              }}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 px-2 h-6 rounded text-[10px] font-mono",
                "transition-colors duration-(--duration-micro)",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                isActive
                  ? "bg-bg-elevated text-text-primary border border-border"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-elevated/50"
              )}
            >
            <TabDot exitCode={tab.lastExitCode} />
            <span className="max-w-20 truncate">
              {tab.agentId ? `agent:${tab.agentId}` : tab.label}
            </span>
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                className="ml-0.5 opacity-0 group-hover:opacity-70 hover:opacity-100 hover:text-status-error transition-opacity"
                aria-label={`Close ${tab.label}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        );
      })}

      {/* Add tab */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onAddTab}
        className="h-5 w-5 text-text-muted hover:text-text-primary"
        aria-label="New terminal tab (⌘T)"
        title="New terminal tab (⌘T)"
      >
        <Plus className="h-3 w-3" />
      </Button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Controls */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onToggleFullscreen}
        className="h-5 w-5 text-text-muted hover:text-text-primary"
        aria-label={isFullscreen ? "Exit full-screen (⌘⇧`)" : "Full-screen terminal (⌘⇧`)"}
        title={isFullscreen ? "Exit full-screen" : "Full-screen (⌘⇧`)"}
      >
        {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onToggle}
        className="h-5 w-5 text-text-muted hover:text-text-primary"
        aria-label="Collapse terminal (⌘`)"
        title="Collapse (⌘`)"
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  );
}
