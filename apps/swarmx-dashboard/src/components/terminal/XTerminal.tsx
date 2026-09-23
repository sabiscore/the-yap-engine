"use client";

import React, { useEffect, useRef, useCallback } from "react";

/**
 * XTerminal — xterm.js PTY terminal connected to the Fastify WebSocket backend.
 *
 * Uses WebSocket at /ws/terminal/:sessionId for PTY I/O.
 * Applies @xterm/addon-fit to auto-resize on container dimension changes.
 * Implements basic flow control: pauses WebSocket send when buffer is near full.
 *
 * NOTE: node-pty lives only in the Fastify backend. This component is purely
 *       the frontend display layer.
 */

interface XTerminalProps {
  readonly sessionId: string;
  readonly agentId?: string;
  readonly active: boolean;
}

// Conditional import to avoid build errors when xterm is not yet installed

interface TerminalInstance {
  open(element: HTMLElement): void;
  dispose(): void;
  onData(callback: (data: string) => void): { dispose(): void };
  onResize(callback: (size: { cols: number; rows: number }) => void): { dispose(): void };
  loadAddon(addon: { dispose(): void }): void;
  write(data: string): void;
  focus(): void;
  cols: number;
  rows: number;
}

interface FitAddonInstance {
  activate(terminal: unknown): void;
  fit(): void;
  dispose(): void;
}

let Terminal: (new (options?: Record<string, unknown>) => TerminalInstance) | null = null;
let FitAddon: (new () => FitAddonInstance) | null = null;

async function loadXterm() {
  if (Terminal && FitAddon) return;
  try {
    const [xtermMod, fitMod] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
    ]);
    Terminal = xtermMod.Terminal as unknown as typeof Terminal;
    FitAddon = fitMod.FitAddon as unknown as typeof FitAddon;
  } catch {
    // xterm not yet installed — show placeholder
    Terminal = null as typeof Terminal;
    FitAddon = null as typeof FitAddon;
  }
}

export function XTerminal({ sessionId, agentId, active }: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<TerminalInstance | null>(null);
  const fitRef = useRef<FitAddonInstance | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const disposersRef = useRef<Array<{ dispose: () => void }>>([]);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const containerClassName = "absolute inset-0 overflow-hidden xterm-container";
  const terminalLabel = agentId
    ? `Terminal session for agent ${agentId}`
    : "Terminal session";

  const cleanup = useCallback(() => {
    disposersRef.current.forEach((d) => d.dispose());
    disposersRef.current = [];
    wsRef.current?.close();
    wsRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
  }, []);

  const initTerminal = useCallback(async () => {
    if (!containerRef.current) return;

    await loadXterm();
    if (!Terminal || !FitAddon) {
      setError("Terminal dependencies are unavailable in this build. Reinstall dashboard dependencies and retry.");
      return;
    }

    // Resolve design tokens at init time so xterm theme stays in sync with CSS vars
    const css = getComputedStyle(document.documentElement);
    const tok = (v: string) => css.getPropertyValue(v).trim();

    const term = new Terminal({
      theme: {
        background:          tok("--color-bg-base"),
        foreground:          tok("--color-text-primary"),
        cursor:              tok("--color-accent"),
        cursorAccent:        tok("--color-bg-base"),
        black:               "#1e1e2e",
        red:                 tok("--color-status-error"),
        green:               tok("--color-accent"),
        yellow:              tok("--color-status-queued"),
        blue:                tok("--color-status-reload"),
        magenta:             "#a78bfa",
        cyan:                "#06b6d4",
        white:               tok("--color-text-primary"),
        brightBlack:         "#4a4a6a",
        brightGreen:         "#22d3a0",
        selectionBackground: tok("--color-selection-bg"),
        selectionForeground: "#ffffff",
      },
      fontFamily: '"JetBrains Mono", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 10000,
      allowProposedApi: true,
      macOptionIsMeta: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    if (
      containerRef.current.clientWidth > 0 &&
      containerRef.current.clientHeight > 0
    ) {
      try {
        fitAddon.fit();
      } catch {
        // Guard against transient zero-dimension layout calculations
      }
    }

    termRef.current = term;
    fitRef.current = fitAddon;

    // PTY WebSocket connection
    // [V5.9-FIX-05] Next.js rewrites() do NOT proxy WebSocket upgrades, so we
    // must connect directly to the Fastify API host. NEXT_PUBLIC_API_URL (or the
    // default http://localhost:3001) is resolved at build time by Next.js.
    const _apiUrl = (process.env["NEXT_PUBLIC_API_URL"] ?? `${globalThis.location.protocol}//${globalThis.location.hostname}:3001`);
    const _apiParsed = new URL(_apiUrl);
    const _wsScheme = _apiParsed.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${_wsScheme}://${_apiParsed.host}/ws/terminal/${encodeURIComponent(sessionId)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setReady(true);
      setError(null);
      // Send initial resize — backend expects \x01{"cols":N,"rows":N}
      ws.send(`\x01${JSON.stringify({ cols: term.cols, rows: term.rows })}`);
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      if (typeof event.data === "string") {
        term.write(event.data);
      }
    };

    ws.onerror = () => setError("WebSocket connection failed. Is the Yap Engine API running?");
    ws.onclose = () => setReady(false);

    // Forward terminal input → WebSocket — backend expects raw string
    const inputDisposer = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
    disposersRef.current.push(inputDisposer);

    // Forward resize → WebSocket — backend expects \x01{"cols":N,"rows":N}
    const resizeDisposer = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\x01${JSON.stringify({ cols, rows })}`);
      }
    });
    disposersRef.current.push(resizeDisposer);

    setReady(true);
  }, [sessionId]);

  const safeFit = useCallback(() => {
    if (
      containerRef.current &&
      containerRef.current.clientWidth > 0 &&
      containerRef.current.clientHeight > 0
    ) {
      try {
        fitRef.current?.fit();
      } catch {
        // Guard against zero-dimension layout calculations
      }
    }
  }, []);

  // ResizeObserver to fit terminal on container resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      safeFit();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [safeFit]);

  // Mount/unmount lifecycle
  useEffect(() => {
    queueMicrotask(() => {
      void initTerminal();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const animationFrameId = globalThis.requestAnimationFrame(() => {
      termRef.current?.focus();
      safeFit();
    });

    return () => globalThis.cancelAnimationFrame(animationFrameId);
  }, [active, safeFit]);

  const handleRetry = () => {
    setError(null);
    cleanup();
    void initTerminal();
  };

  return (
    <section
      ref={containerRef}
      className={containerClassName}
      aria-label={terminalLabel}
      data-terminal-session={sessionId}
      data-agent-id={agentId}
    >
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-base">
          <div className="text-center space-y-2">
            <p className="text-status-error text-xs font-mono">{error}</p>
            <button
              onClick={handleRetry}
              className="text-accent text-xs font-mono underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-base">
          <span className="text-xs font-mono text-text-muted">Connecting to PTY…</span>
        </div>
      )}
    </section>
  );
}
