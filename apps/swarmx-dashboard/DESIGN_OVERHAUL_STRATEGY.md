# The Yap Engine: Dashboard UI/UX Design Overhaul & Refactoring Strategy

This document outlines a comprehensive, production-ready design overhaul for The Yap Engine dashboard, optimized for rapid implementation within an AI-assisted IDE workflow.

## 1. Information Architecture & Layout (Next.js/Tailwind)

**The Problem:** The current three-column layout is visually dense. Active job queues, prompt inputs, and system logs lack clear spatial separation and compete for attention.

**The Solution:**
Transition from a rigid three-column grid to a **Collapsible, Container-Query Driven Flex/Grid Layout** with progressive disclosure.
- **Main Viewport:** Split into a primary work area (Prompt & Pipeline configuration) and a secondary monitoring area.
- **Queue Management:** Consolidate queues into a tabbed interface within a unified "Job Center".
- **Telemetry Panel:** Convert the static TelemetryRail into a **Floating / Collapsible Observability Panel**.

**Ready-to-Implement Layout Structure:**
```tsx
// src/components/layout/DashboardLayout.tsx
import { cn } from "@/lib/utils";
import { Sidebar } from "./Sidebar";
import { TelemetryPanel } from "./TelemetryPanel";
import { PipelineWorkspace } from "./PipelineWorkspace";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg-base text-text-primary @container">
      {/* Collapsible Sidebar for Navigation */}
      <Sidebar className="w-16 hover:w-64 transition-all duration-300 ease-snap z-50 border-r border-border shrink-0" aria-label="Main Navigation" />
      
      {/* Primary Workspace */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative" role="main">
        <PipelineWorkspace>{children}</PipelineWorkspace>
      </main>

      {/* Floating/Pinned Telemetry Drawer utilizing Container Queries */}
      <aside 
        className={cn(
          "w-80 shrink-0 border-l border-border bg-bg-surface transition-transform duration-300",
          // Use container queries to gracefully float or hide on smaller parent containers
          "@max-lg:absolute @max-lg:right-0 @max-lg:h-full @max-lg:z-40 @max-md:translate-x-full"
        )}
        aria-label="System Telemetry"
      >
        <TelemetryPanel />
      </aside>
    </div>
  );
}
```

## 2. Component Design & Observability

**The Problem:** Telemetry graphs and agent fleet statuses blend into the background.

**The Solution:**
Design a high-contrast, segmented **Telemetry Module** using distinct surfaces and accessible ARIA live regions for screen readers.

**Ready-to-Implement Telemetry Widget:**
```tsx
// src/components/telemetry/TelemetryWidget.tsx
import { Cpu, MemoryStick, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface TelemetryWidgetProps {
  cpuLoad: number;
  zramPct: number;
  agentFanout: number;
}

export function TelemetryWidget({ cpuLoad, zramPct, agentFanout }: TelemetryWidgetProps) {
  const cpuStatus = cpuLoad > 85 ? "critical" : cpuLoad > 60 ? "warning" : "safe";
  
  return (
    <div 
      className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-bg-elevated border border-border shadow-sm"
      role="region" 
      aria-live="polite" 
      aria-label="Real-time System Metrics"
    >
      {/* CPU Load Metric */}
      <div className="flex flex-col gap-2 p-3 rounded-lg bg-bg-surface/50 border border-white/5 relative overflow-hidden">
        <div className="flex items-center gap-2 text-xs font-ui text-slate-400 uppercase tracking-wider" aria-hidden="true">
          <Cpu className="w-4 h-4" /> CPU Load
        </div>
        <div className={cn("text-2xl font-mono font-bold tracking-tight", 
          cpuStatus === "critical" ? "text-rose-500" :
          cpuStatus === "warning" ? "text-amber-500" : "text-emerald-400"
        )}>
          {cpuLoad.toFixed(1)}%
          <span className="sr-only">CPU Load is at {cpuLoad.toFixed(1)}%</span>
        </div>
        <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-800" aria-hidden="true">
          <div 
            className={cn("h-full transition-all duration-500", 
              cpuStatus === "critical" ? "bg-rose-500" :
              cpuStatus === "warning" ? "bg-amber-500" : "bg-emerald-400"
            )}
            style={{ width: `${cpuLoad}%` }} 
          />
        </div>
      </div>

      {/* ZRAM Usage */}
      <div className="flex flex-col gap-2 p-3 rounded-lg bg-bg-surface/50 border border-white/5">
        <div className="flex items-center gap-2 text-xs font-ui text-slate-400 uppercase tracking-wider">
          <MemoryStick className="w-4 h-4" aria-hidden="true" /> ZRAM Limit
        </div>
        <div className="text-2xl font-mono font-bold text-slate-200">
          {zramPct.toFixed(0)}<span className="text-sm text-slate-500">%</span>
          <span className="sr-only">ZRAM Usage at {zramPct.toFixed(0)} percent</span>
        </div>
      </div>

      {/* Agent Fanout */}
      <div className="flex flex-col gap-2 p-3 rounded-lg bg-bg-surface/50 border border-white/5">
        <div className="flex items-center gap-2 text-xs font-ui text-slate-400 uppercase tracking-wider">
          <Activity className="w-4 h-4" aria-hidden="true" /> Fanout
        </div>
        <div className="text-2xl font-mono font-bold text-emerald-400">
          x{agentFanout}
          <span className="sr-only">Agent Fanout multiplier is {agentFanout}</span>
        </div>
      </div>
    </div>
  );
}
```

## 3. Typography & Data Hierarchy

**The Problem:** Dense technical data and UI elements compete for attention using similar font weights and colors.

**The Solution:**
Define a strict typography scale using modern Tailwind properties and the existing project theme.
- **Primary Headings (Pipelines, Job Names):** `text-text-primary font-ui font-semibold tracking-tight text-xl`
- **Secondary Labels (Widget Titles):** `text-text-secondary font-ui text-xs uppercase tracking-wider font-medium`
- **Metrics & Telemetry Data:** `text-text-primary font-mono text-2xl tabular-nums`
- **Logs & Execution Output:** `text-text-muted font-mono text-sm leading-relaxed whitespace-pre-wrap`
- **Status Colors (for visual hierarchy):**
  - Active: `text-status-active` / `bg-status-active/10` / `border-status-active/20`
  - Warning/Throttled: `text-status-warning` / `bg-status-warning/10` / `border-status-warning/20`
  - Error: `text-status-error` / `bg-status-error/10` / `border-status-error/20`

## 4. Intuitive Pipeline UX

**The Problem:** Managing a complex pipeline requires frictionless interactions.

**The Solution:**
Implement specific UX affordances using modern CSS (container queries, `:has()`, view transitions) and standard A11y patterns.

1. **Progressive Disclosure for Pipeline Configs:**
   - Use semantic `<details>` and `<summary>` elements or accessible Accordions to hide advanced settings.
   - *Utility classes:* `group-open:animate-in group-open:fade-in group-open:slide-in-from-top-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`

2. **Interactive Queue Management (Drag-and-Drop & Triage):**
   - Provide a Kanban-style tabbed view with proper keyboard navigation (`role="tablist"`, `aria-selected`).
   - *Queue Item styling:* `relative group p-4 rounded-lg border border-border bg-bg-surface hover:border-border-active hover:shadow-md transition-all cursor-grab active:cursor-grabbing focus-visible:ring-2`
   - *Quick Actions (Reveal on hover/focus):* `absolute right-4 top-4 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex gap-2`

3. **Status Feedback & Animations:**
   - Active rendering jobs should have a subtle pulse.
   - *Utility classes:* `animate-pulse text-status-active`.
   - Use CSS `:has()` to dim surrounding pipelines when one is actively hovered or focused:
     `group/pipeline hover:bg-bg-surface focus-within:bg-bg-surface [&:not(:hover):not(:focus-within)]:opacity-60 transition-opacity`

---

## 5. Implementation Status & Verification

All four core pillars of the design overhaul strategy have been fully implemented, verified, and integrated into production:

1. **Information Architecture & Layout (R1)**:
   - `AppShell.tsx`: Responsive 4-zone CSS grid with dynamic column variables, smooth transitions, and non-destructive terminal canvas lifecycle.
   - `(dashboard)/layout.tsx`: Root `@container` styling on `<main id="main-content">` enabling container query responsiveness across all inner routes.
   - `TelemetryRail.tsx`: Responsive rail supporting both desktop fixed width and off-canvas floating drawer.

2. **Component Design & Observability (R2)**:
   - `TelemetryWidget.tsx`: 4 high-contrast metric cards covering CPU load, ZRAM / memory pressure, active agent fanout, and dynamic Ollama warming states.
   - Fully accessible with `aria-live="polite"` scoped alert regions, `sr-only` metric descriptors, and WCAG 2.1 AA compliant tokens (`text-status-*`, `bg-bg-elevated`).
   - Integrated into `TelemetryRail.tsx`, `page.tsx` (Overview), and `video/studio/page.tsx`.

3. **Typography & Data Hierarchy (R3)**:
   - Complete semantic token mapping using Tailwind v4 theme variables (`text-text-primary`, `text-text-secondary`, `text-text-muted`, `text-status-active`, `text-status-warning`, `text-status-error`).
   - Monospace font strictly reserved for IDs, timers, telemetry metrics, and code blocks; UI navigation cleanly styled in sans-serif typography.

4. **Intuitive Pipeline UX (R4)**:
   - `VideoJobForm.tsx`: Progressive parameter disclosure into 3 `<details>`/`<summary>` groups (Model Tier & Execution, Voice & Audio, Creative & Visual Parameters) with deduplicated template family selection.
   - `video/page.tsx`: Tabbed queue triage using Radix UI tabs (`All`, `Active`, `Queued`, `Failed`, `History`) powered by comprehensive active status detection (`isActiveVideoStatus`).
   - `VideoJobCard.tsx`: Floating action toolbar revealed on hover and keyboard `focus-within`, with active rendering emerald borders, accent strips, and motion-safe pulsing.

### Verification Matrix
- **Vitest Suite**: 84 passing tests across 10 test files (`pnpm -F @swarmx/dashboard test`).
- **TypeScript Compilation**: Zero errors under `tsc --noEmit` across `@swarmx/types`, `@swarmx/api`, and `@swarmx/dashboard`.
- **Production Build**: Next.js Turbopack build compiled all 14 routes successfully in production mode.
- **Repository Invariants**: Zero `console.*` in services/routes, zero legacy `-scar` model tags, and dynamic cold-start ETA assertions intact.
