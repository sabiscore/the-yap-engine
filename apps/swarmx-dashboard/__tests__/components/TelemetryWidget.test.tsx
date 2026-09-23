import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TelemetryWidget } from "@/components/telemetry/TelemetryWidget";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return renderToString(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("TelemetryWidget Component", () => {
  it("renders with fallback store state when no props are provided", () => {
    const html = renderWithClient(<TelemetryWidget />);

    // Section container & accessibility
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Real-time System Metrics"');
    expect(html).toContain("bg-bg-elevated");
    expect(html).toContain("border-border");

    // Scoped polite live region exists
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');

    // All 4 metric card titles are present
    expect(html).toContain("CPU Load");
    expect(html).toContain("ZRAM Limit");
    expect(html).toContain("Fleet Fanout");
    expect(html).toContain("Ollama Status");

    // Screen reader accessible text is present
    expect(html).toContain("sr-only");
    expect(html).toContain("CPU Load is at");
    expect(html).toContain("ZRAM utilization at");
    expect(html).toContain("Agent concurrency fanout limit is");
    expect(html).toContain("Ollama warming status:");
  });

  it("renders controlled safe state with high-contrast text-status-active tokens", () => {
    const html = renderWithClient(
      <TelemetryWidget
        cpuLoad={28.4}
        zramPct={32}
        agentFanout={4}
        activeAgents={1}
        totalAgents={3}
        errorAgents={0}
        pressureLevel="normal"
        availableMb={4200}
        ollamaWarming={{ done: true, coldStartEtaSecs: null, online: true }}
      />
    );

    // CPU card
    expect(html).toContain("28.4%");
    expect(html).toContain("text-status-active");
    expect(html).toContain("CPU Load is at 28.4 percent, status safe");

    // ZRAM card
    expect(html).toContain("32%");
    expect(html).toContain("4200 MB avail");
    expect(html).toContain("normal");

    // Fleet Fanout card
    expect(html).toContain("x4");
    expect(html).toContain("1 active · 3 total");

    // Ollama status card
    expect(html).toContain("READY");
    expect(html).toContain("All models resident");

    // In normal state, polite live alert is empty
    expect(html).toContain('<div class="sr-only" aria-live="polite" aria-atomic="true"></div>');
  });

  it("renders controlled warning state with text-status-warning tokens and dynamic ETA", () => {
    const html = renderWithClient(
      <TelemetryWidget
        cpuLoad={72.5}
        zramPct={68}
        agentFanout={2}
        activeAgents={2}
        totalAgents={2}
        errorAgents={0}
        pressureLevel="high"
        availableMb={1100}
        ollamaWarming={{ done: false, coldStartEtaSecs: 35, online: true }}
      />
    );

    // CPU warning status
    expect(html).toContain("72.5%");
    expect(html).toContain("text-status-warning");
    expect(html).toContain("border-status-warning/40");

    // ZRAM warning status
    expect(html).toContain("68%");
    expect(html).toContain("high");
    expect(html).toContain("1100 MB avail");

    // Fanout warning status (activeAgents >= concurrencyLimit)
    expect(html).toContain("x2");
    expect(html).toContain("2 active · 2 total");

    // Ollama warming status with dynamic ETA
    expect(html).toContain("WARMING");
    expect(html).toContain("~35s ETA");
    expect(html).not.toContain("140");
    expect(html).not.toContain("45");
  });

  it("renders controlled critical state with text-status-error tokens and live region announcement", () => {
    const html = renderWithClient(
      <TelemetryWidget
        cpuLoad={91.8}
        zramPct={88}
        agentFanout={1}
        activeAgents={1}
        totalAgents={2}
        errorAgents={1}
        pressureLevel="critical"
        availableMb={620}
        ollamaWarming={{ done: false, coldStartEtaSecs: null, online: false }}
      />
    );

    // High-contrast error token
    expect(html).toContain("91.8%");
    expect(html).toContain("text-status-error");
    expect(html).toContain("border-status-error/40");

    // ZRAM critical
    expect(html).toContain("88%");
    expect(html).toContain("critical");
    expect(html).toContain("620 MB avail");

    // Fanout error badge
    expect(html).toContain("x1");
    expect(html).toContain("1 active · 2 total");

    // Ollama offline
    expect(html).toContain("OFFLINE");
    expect(html).toContain("cold (ETA unavailable)");

    // Polite live region announces critical condition
    expect(html).toContain('aria-live="polite" aria-atomic="true">Warning: High CPU load at 91.8 percent.</div>');
  });

  it("dynamically formats non-hardcoded cold-start ETA across different warmup states", () => {
    // 1. Dynamic ETA value of 18 seconds
    const html18 = renderWithClient(
      <TelemetryWidget
        ollamaWarming={{ done: false, coldStartEtaSecs: 18, online: true }}
      />
    );
    expect(html18).toContain("WARMING");
    expect(html18).toContain("~18s ETA");
    expect(html18).not.toContain("140");
    expect(html18).not.toContain("45");

    // 2. Cold start with null ETA
    const htmlNull = renderWithClient(
      <TelemetryWidget
        ollamaWarming={{ done: false, coldStartEtaSecs: null, online: true }}
      />
    );
    expect(htmlNull).toContain("WARMING");
    expect(htmlNull).toContain("cold (ETA unavailable)");
    expect(htmlNull).not.toContain("140");
    expect(htmlNull).not.toContain("45");

    // 3. Warmed state
    const htmlDone = renderWithClient(
      <TelemetryWidget
        ollamaWarming={{ done: true, coldStartEtaSecs: null, online: true }}
      />
    );
    expect(htmlDone).toContain("READY");
    expect(htmlDone).toContain("All models resident");
  });

  it("applies container query classes for responsive reflow", () => {
    const html = renderWithClient(<TelemetryWidget className="custom-test-class" />);

    expect(html).toContain("custom-test-class");
    expect(html).toContain("@sm:grid-cols-2");
    expect(html).toContain("@lg:grid-cols-4");
  });
});
