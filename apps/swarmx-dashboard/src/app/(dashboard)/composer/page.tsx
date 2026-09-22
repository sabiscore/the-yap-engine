"use client";

import React, { useState } from "react";
import { cn, safeErrorMessage } from "@/lib/utils";
import { resolveClientApiBaseUrl } from "@/lib/api-config";
import { useEventsStore } from "@/stores/events";
import { useApiHealth, type ApiHealthState } from "@/hooks/useApiHealth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Send, Bot, Sparkles, RefreshCw, FolderOpen, Pin,
  Cpu, Database, AlertCircle, GitBranch, Activity, Loader2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ComposerMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  agentId?: string;
  isError?: boolean;
  mode?: "local" | "model" | "fallback";
  diagnostics?: {
    reason?: string;
    ollamaReachable?: boolean;
    ollamaEndpoint?: string;
    model?: string;
    selectedModel?: string;
    timeoutMs?: number;
    retryCount?: number;
    circuitOpen?: boolean;
  };
}

interface ComposerState {
  messages: ComposerMessage[];
  isLoading: boolean;
  sessionId: string;
  loadingStartedAt: number | null;
}

interface ComposerApiResponse {
  message: string;
  agentId?: string;
  sessionId?: string;
  mode?: "local" | "model" | "fallback";
  diagnostics?: ComposerMessage["diagnostics"];
}

// [V6.1-ENH-04] Use API-provided mode + diagnostics to render explicit
// model-offline/fallback guidance and operator retry affordances.

function makeComposerSessionId(): string {
  return `composer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveDirectApiBaseUrl(): string {
  const configured = resolveClientApiBaseUrl();
  if (configured) return configured;
  return "http://127.0.0.1:3001";
}

const COMPOSER_RECENT_SCOPES_KEY = "swarmx:composer:recent-scopes";
const CLIENT_TIMEOUT_MS = Number.parseInt(
  process.env.NEXT_PUBLIC_SWARMX_COMPOSER_CLIENT_TIMEOUT_MS ?? "120000",
  10,
);
const DEFAULT_PROJECT_SCOPE =
  process.env.NEXT_PUBLIC_SWARMX_PROJECT_PATH ?? "/home/scar/Documents/theyapengine";

function classifyPromptComplexity(message: string): "light" | "standard" | "deep" {
  const q = message.toLowerCase();
  const deepSignals = ["deep", "analyze", "architecture", "incident", "evolution", "workflow", "multi-agent"];
  const deepHits = deepSignals.filter((s) => q.includes(s)).length;
  if (message.trim().length > 320 || deepHits >= 2) return "deep";
  if (message.trim().length <= 120) return "light";
  return "standard";
}

function clientAbortTimeoutMs(message: string): number {
  const normalizedDefault = Number.isFinite(CLIENT_TIMEOUT_MS) && CLIENT_TIMEOUT_MS > 0 ? CLIENT_TIMEOUT_MS : 120_000;
  const complexity = classifyPromptComplexity(message);
  if (complexity === "light") return Math.min(normalizedDefault, 60_000);
  if (complexity === "deep") return Math.max(normalizedDefault, 120_000);
  return normalizedDefault;
}

function loadRecentScopes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = globalThis.localStorage.getItem(COMPOSER_RECENT_SCOPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .slice(0, 5);
  } catch {
    return [];
  }
}

// ── Dynamic preset prompts based on fleet state ───────────────────────────────

function useDynamicPresets() {
  const queues = useEventsStore((s) => s.queues);
  const errors = useEventsStore((s) => s.errorAgentCount);
  const active = useEventsStore((s) => s.activeAgentCount);

  return React.useMemo(() => {
    const presets: { icon: React.ElementType; label: string; prompt: string; highlight?: boolean }[] = [];

    if (errors > 0) {
      presets.push({
        icon: AlertCircle,
        label: `Diagnose ${errors} error${errors > 1 ? "s" : ""}`,
        prompt: "Find all agents in error state and describe their last error message and possible cause.",
        highlight: true,
      });
    }

    const totalWaiting = [...(queues?.values() ?? [])].reduce((a, q) => a + q.waiting, 0);
    if (totalWaiting > 10) {
      presets.push({
        icon: Database,
        label: `Explain queue pressure (${totalWaiting} waiting)`,
        prompt: `Queue depth is at ${totalWaiting}. Summarize current queue state and suggest how to reduce pressure.`,
        highlight: true,
      });
    }

    presets.push(
      { icon: Activity,   label: "Summarize fleet status",           prompt: "List all running agents and their current tasks, grouped by role." },
      { icon: Cpu,        label: "Find high-CPU agents",             prompt: "Show me agents with CPU usage above 80% and what they're working on." },
      { icon: GitBranch,  label: "Recent workflow runs",             prompt: "What workflows have run in the last hour? Show success/fail breakdown." },
      { icon: Database,   label: "Queue depth across all queues",    prompt: "Summarize the current queue depth across all BullMQ queues." },
      { icon: Bot,        label: "Idle agents report",               prompt: `${active} agents are active. How many are idle and why aren't they assigned tasks?` },
      { icon: AlertCircle,label: "OOM risk assessment",              prompt: "Show OOM events in the swarmx.slice cgroup and assess memory risk." },
    );

    return presets.slice(0, 6);
  }, [queues, errors, active]);
}

// ── Typewriter welcome ────────────────────────────────────────────────────────

const WELCOME_LINES = [
  "Query your fleet in plain English.",
  "Diagnose errors before they cascade.",
  "Orchestrate agents with a sentence.",
  "Ask anything. The swarm is listening.",
];

function WelcomeTypewriter() {
  const [lineIndex, setLineIndex] = React.useState(0);
  const [displayed, setDisplayed] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);

  React.useEffect(() => {
    const target = WELCOME_LINES[lineIndex] ?? "";

    if (!isDeleting && displayed === target) {
      const pause = setTimeout(() => setIsDeleting(true), 2400);
      return () => clearTimeout(pause);
    }

    if (isDeleting && displayed === "") {
      const next = setTimeout(() => {
        setIsDeleting(false);
        setLineIndex((i) => (i + 1) % WELCOME_LINES.length);
      }, 0);
      return () => clearTimeout(next);
    }

    const speed = isDeleting ? 28 : 52;
    const timer = setTimeout(() => {
      setDisplayed((prev) =>
        isDeleting ? prev.slice(0, -1) : target.slice(0, prev.length + 1)
      );
    }, speed);
    return () => clearTimeout(timer);
  }, [displayed, isDeleting, lineIndex]);

  return (
    <span className="text-xs font-mono text-text-secondary typewriter-cursor">
      {displayed}
    </span>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { readonly msg: ComposerMessage }) {
  const isUser = msg.role === "user";
  const isError = msg.isError === true;
  // [V6.1-FIX-19] Use the browser's system locale/timezone — do not hardcode region.
  const time = new Date(msg.timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={cn("flex gap-3 px-4 py-3 panel-enter", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div
        className={cn(
          "h-6 w-6 rounded-full shrink-0 flex items-center justify-center mt-0.5",
          isUser
            ? "bg-accent/20 text-accent"
            : isError
            ? "bg-red-500/10 text-red-400"
            : "bg-(--color-accent-dim) text-text-secondary"
        )}
      >
        {isUser ? (
          <span className="text-[9px] font-mono font-bold">YOU</span>
        ) : isError ? (
          <AlertCircle className="h-3 w-3" />
        ) : (
          <Bot className="h-3 w-3" />
        )}
      </div>

      {/* Content */}
      <div className={cn("max-w-[75%] space-y-1", isUser ? "items-end" : "items-start")}>
        {msg.agentId && (
          <div className={cn("text-[9px] font-mono text-text-muted", isUser ? "text-right" : "text-left")}>
            {msg.agentId}
          </div>
        )}
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-xs font-mono leading-relaxed",
            isUser
              ? "bg-(--color-accent-dim) text-accent border border-accent/20 text-right"
              : isError
              ? "bg-red-950/30 text-red-300 border border-red-500/30"
              : "bg-bg-elevated text-text-secondary border border-border"
          )}
        >
          <pre className="whitespace-pre-wrap font-mono">{msg.content}</pre>
        </div>
        <div className={cn("text-[9px] font-mono text-text-muted", isUser ? "text-right" : "text-left")}>
          {time}
        </div>
      </div>
    </div>
  );
}

// ── Thinking indicator ────────────────────────────────────────────────────────

// [V5.9-FIX-01] ThinkingIndicator now self-ticks elapsed time so slow-hint
// and fallback-hint actually surface after 8 s and 20 s respectively.
function ThinkingIndicator({ startedAt }: { readonly startedAt: number }) {
  const [elapsedMs, setElapsedMs] = React.useState(() => Date.now() - startedAt);

  React.useEffect(() => {
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const showSlowHint = elapsedMs >= 8000;
  const showDegradedHint = elapsedMs >= 30000;
  const showFallbackHint = elapsedMs >= 20000;
  const elapsedSec = Math.floor(elapsedMs / 1000);

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 panel-enter"
      role="status"
      aria-live="polite"
      aria-label={`Composer model thinking${elapsedSec > 2 ? `, ${elapsedSec} seconds elapsed` : ""}`}
    >
      <div className="h-6 w-6 rounded-full bg-(--color-accent-dim) flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="h-3 w-3 text-accent animate-pulse" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 bg-bg-elevated border border-border rounded-lg px-3 py-2">
          <div className="think-dot" aria-hidden="true" />
          <div className="think-dot" aria-hidden="true" />
          <div className="think-dot" aria-hidden="true" />
          <span className="text-[10px] font-mono text-text-muted ml-1">
            thinking{elapsedSec > 2 ? ` · ${elapsedSec}s` : "…"}
          </span>
        </div>
        {showSlowHint && (
          <div className="max-w-136 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-[10px] font-mono text-text-secondary">
            Cold model loads can take a little longer on this host.
            {showFallbackHint ? " If the model stays cold, Yap Engine will fall back to a direct fleet summary." : ""}
          </div>
        )}
        {showDegradedHint && (
          <div className="max-w-136 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-[10px] font-mono text-yellow-200">
            The model path is degraded right now. You can still ask operational fleet questions for instant local answers.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Preset suggestion chips ───────────────────────────────────────────────────

function PresetChips({ onSelect }: { readonly onSelect: (p: string) => void }) {
  const presets = useDynamicPresets();

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-3 w-3 text-accent" />
        <span className="text-[9px] font-mono text-text-muted uppercase tracking-widest">
          Suggested queries
        </span>
        <span className="ai-chip ml-auto">AI</span>
      </div>
      <div className="composer-suggestions">
        {presets.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.label}
              onClick={() => onSelect(p.prompt)}
              aria-label={`Use preset prompt: ${p.label}`}
              className={cn(
                "composer-suggestion-chip",
                p.highlight && "border-accent/30 bg-accent/5 text-accent/80"
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="h-2.5 w-2.5 shrink-0" />
                <span className="font-semibold">{p.label}</span>
              </div>
              <span className="text-[9px] opacity-70 leading-relaxed">
                {p.prompt.length > 72 ? p.prompt.slice(0, 69) + "…" : p.prompt}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── API status badge ──────────────────────────────────────────────────────────

function ApiStatusDot({ health }: { readonly health: ApiHealthState }) {
  // [V6.1-FIX-19] Render a neutral placeholder while the first probe is in-flight
  // so the header width stays stable (no layout shift once apiOnline resolves).
  if (health.apiOnline === null) {
    return (
      <span className="flex items-center gap-1 rounded border border-border/40 px-1.5 py-0.5 text-[9px] font-mono text-text-muted opacity-50">
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
        API
      </span>
    );
  }

  if (!health.apiOnline) {
    return (
      <span
        title="Yap Engine API unreachable — check port 3001"
        className="flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-mono text-red-300"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        API OFFLINE
      </span>
    );
  }

  if (health.ollamaOnline === false) {
    // API is up but Ollama backend is down — already surfaced via MODEL OFFLINE badge
    return (
      <span
        title={`API online${health.latencyMs !== null ? ` · ${health.latencyMs}ms` : ""}. Ollama unreachable.`}
        className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[9px] font-mono text-text-muted"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
        API
        {health.latencyMs !== null && (
          <span className="opacity-60">{health.latencyMs}ms</span>
        )}
      </span>
    );
  }

  return (
    <span
      title={`API online${health.latencyMs !== null ? ` · ${health.latencyMs}ms` : ""}. Ollama reachable.`}
      className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[9px] font-mono text-text-muted"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
      API
      {health.latencyMs !== null && (
        <span className="opacity-60">{health.latencyMs}ms</span>
      )}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ComposerPage() {
  const agents = useEventsStore((s) => s.agents);
  const governorState = useEventsStore((s) => s.governorState);
  const startupSummary = useEventsStore((s) => s.startupSummary);
  const apiHealth = useApiHealth();
  const [state, setState] = useState<ComposerState>({
    messages: [],
    isLoading: false,
    sessionId: makeComposerSessionId(),
    loadingStartedAt: null,
  });
  const [input, setInput] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [projectScope, setProjectScope] = useState(DEFAULT_PROJECT_SCOPE);
  // [V5.9-FIX-08] Initialize localStorage-backed state lazily to avoid
  // synchronous setState inside effects (React compiler cascade warning).
  const [recentScopes, setRecentScopes] = useState<string[]>(() => loadRecentScopes());
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  // [V6.2-FIX-16] Derive pressureLevel before sendMessage callback so the
  // closure captures the correct value and the dependency array is complete.
  const pressureLevel = governorState?.pressureLevel;

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages.length]);

  const saveProjectScope = React.useCallback((scope: string) => {
    const trimmed = scope.trim();
    if (!trimmed) return;
    setRecentScopes((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 5);
      try {
        globalThis.localStorage.setItem(COMPOSER_RECENT_SCOPES_KEY, JSON.stringify(next));
      } catch { /* non-fatal */ }
      return next;
    });
  }, []);

  const sendMessage = React.useCallback(async (content: string) => {
    if (!content.trim() || state.isLoading) return;

    const sessionId = state.sessionId.trim() || makeComposerSessionId();
    if (sessionId !== state.sessionId) {
      setState((prev) => ({ ...prev, sessionId }));
    }

    const userMsg: ComposerMessage = {
      role: "user",
      content: content.trim(),
      timestamp: Date.now(),
    };
    setLastPrompt(content.trim());

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      isLoading: true,
      loadingStartedAt: Date.now(),
    }));
    setInput("");

    // [V6.2-ENH-02] Adaptive client-side abort budget aligned with API routing.
    // Prevents client aborting deep prompts too early while keeping light prompts snappy.
    const abortCtrl = new AbortController();
    const abortAfterMs = clientAbortTimeoutMs(content);
    const abortTimer = setTimeout(() => abortCtrl.abort(), abortAfterMs);

    try {
      const payload = {
        sessionId,
        message: content.trim(),
        context: {
          projectScope: projectScope.trim() || undefined,
          recentProjects: recentScopes,
          agents: [...agents.entries()].map(([id, a]) => ({
            id,
            name: a.name,
            status: a.status,
            role: a.role,
          })),
          // [V6.2-ENH-05] Relay runtime pressure level so the API can bypass
          // model calls when the host is under critical memory pressure.
          pressureLevel: pressureLevel ?? undefined,
        },
      };

      const requestInit: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortCtrl.signal,
      };

      let res = await fetch("/api/composer/chat", requestInit);
      if (!res.ok && res.status >= 500) {
        const fallbackUrl = `${resolveDirectApiBaseUrl()}/api/composer/chat`;
        res = await fetch(fallbackUrl, requestInit);
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // [V6.2-ENH-02] Read server-advertised timeout so future abort timers
      // can align with the server's effective budget for this prompt type.
      const serverTimeoutMs = Number.parseInt(res.headers.get("X-Request-Timeout-Ms") ?? "", 10);
      if (Number.isFinite(serverTimeoutMs) && serverTimeoutMs > 0) {
        // Store on window for the next sendMessage() call (best-effort).
        (globalThis as Record<string, unknown>)["__swarmx_last_server_timeout_ms"] = serverTimeoutMs;
      }

      const data = await res.json() as ComposerApiResponse;

      setState((prev) => ({
        ...prev,
        sessionId: data.sessionId?.trim() || prev.sessionId,
        messages: [
          ...prev.messages,
          {
            role: "assistant",
            content: data.message,
            timestamp: Date.now(),
            ...(data.agentId !== undefined && { agentId: data.agentId }),
            ...(data.mode !== undefined && { mode: data.mode }),
            ...(data.diagnostics !== undefined && { diagnostics: data.diagnostics }),
          },
        ],
        isLoading: false,
        loadingStartedAt: null,
      }));
    } catch (err) {
      // [V5.9-FIX-03] Classify error type for actionable operator feedback.
      let errorText: string;
      if (err instanceof DOMException && err.name === "AbortError") {
        errorText =
          `Request timed out after ${Math.round(abortAfterMs / 1000)} s.\n\nThe model may still be loading on the host. Try again in a few seconds, or check that Ollama is running:\n  curl http://localhost:11434/api/tags`;
      } else if (err instanceof Error && /HTTP 503/.test(err.message)) {
        errorText =
          "API returned 503 — the model service is temporarily unavailable.\n\nOllama may be loading or swapping a model. Wait a moment then retry.";
      } else if (err instanceof Error && /HTTP 502/.test(err.message)) {
        errorText =
          "API gateway error (502). The orchestration backend may be restarting.\n\nRun: bash scripts/startup-enhanced.sh --dashboard";
      } else if (err instanceof Error && /HTTP 429/.test(err.message)) {
        errorText =
          "Rate limit reached (429). Too many requests in a short window. Wait a few seconds and try again.";
      } else if (err instanceof Error && /HTTP 4\d\d/.test(err.message)) {
        errorText = `Request rejected by API: ${safeErrorMessage(err, "check the API logs for details")}.\n\nCheck that the session payload is valid and the API version matches the dashboard.`;
      } else if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
        errorText =
          "Could not reach the Yap Engine API.\n\nConfirm the API is running at port 3001:\n  curl http://127.0.0.1:3001/health";
      } else {
        errorText = `Swarm brain error: ${safeErrorMessage(err, "unknown error")}.\n\nCheck API logs for details.`;
      }

      setState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            role: "assistant",
            content: errorText,
            timestamp: Date.now(),
            isError: true,
          },
        ],
        isLoading: false,
        loadingStartedAt: null,
      }));
    } finally {
      clearTimeout(abortTimer);
    }
  }, [state.sessionId, state.isLoading, agents, projectScope, recentScopes, pressureLevel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const runningCount = [...agents.values()].filter((a) => a.status === "running").length;
  const isDegraded = pressureLevel === "high" || pressureLevel === "critical";
  // [V6.2-FIX-22] Live health poll (12 s interval) is authoritative once resolved.
  // The startupSummary is populated once at boot by the SSE startup event: if
  // Ollama was unreachable at that moment (e.g., still starting), the stale
  // "false" value would permanently show MODEL OFFLINE even after Ollama comes up.
  // When apiHealth.ollamaOnline has resolved (non-null), use it. Only fall back to
  // the startup snapshot while the first live probe is still in-flight (null).
  const isModelOffline =
    apiHealth.ollamaOnline !== null
      ? apiHealth.ollamaOnline === false
      : startupSummary?.ollamaReachable === false;
  const lastAssistant = [...state.messages].reverse().find((m) => m.role === "assistant");
  const showFallbackHint = lastAssistant?.mode === "fallback";
  // [V6.2-FIX-26] Distinguish cold-load warming-up from generic fallback.
  const isModelWarmingUp =
    lastAssistant?.mode === "fallback" &&
    lastAssistant?.diagnostics?.reason === "model_warming_up";
  // [V6.2-ENH-07] Show an explicit retry countdown while the model warms so
  // operators can see when an automatic retry will fire.
  const [uiNowMs, setUiNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!isModelWarmingUp) return;
    const tick = setInterval(() => setUiNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [isModelWarmingUp, lastAssistant?.timestamp]);
  const warmingUpRetrySeconds =
    isModelWarmingUp && lastAssistant
      ? Math.max(0, Math.ceil((lastAssistant.timestamp + 90_000 - uiNowMs) / 1000))
      : null;
  const warmingUpProgressPct =
    warmingUpRetrySeconds !== null
      ? Math.min(100, Math.max(0, ((90 - warmingUpRetrySeconds) / 90) * 100))
      : 0;
  const canRetryLastPrompt = !state.isLoading && lastPrompt.trim().length > 0;

  // [V6.2-FIX-26] Auto-retry after model warm-up: when the last response is a
  // warming-up notice, schedule a one-shot retry after 90 s so the operator
  // doesn't have to manually poll.
  const warmingUpRetryHandled = React.useRef(false);
  React.useEffect(() => {
    if (!isModelWarmingUp || warmingUpRetryHandled.current || !lastPrompt.trim()) return;
    warmingUpRetryHandled.current = true;
    const tid = setTimeout(() => {
      warmingUpRetryHandled.current = false;
      sendMessage(lastPrompt);
    }, 90_000);
    return () => clearTimeout(tid);
  }, [isModelWarmingUp, lastPrompt, sendMessage]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Sparkles className="h-4 w-4 text-accent" />
            {runningCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent beacon-active" />
            )}
          </div>
          <h1 className="text-sm font-mono font-semibold text-text-primary">AI Composer</h1>
          <span className="text-[10px] font-mono text-text-muted">
            {runningCount > 0
              ? `${runningCount} agent${runningCount === 1 ? "" : "s"} available`
              : "Fleet standing by"}
          </span>
          {isDegraded && (
            <span
              className="rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-mono text-yellow-200"
              role="status"
              aria-label="System is in degraded mode due to high resource pressure"
            >
              DEGRADED MODE
            </span>
          )}
          {isModelOffline && (
            <span
              className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-mono text-red-300"
              role="status"
              aria-label="Model backend is offline — Ollama is unreachable"
            >
              MODEL OFFLINE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ApiStatusDot health={apiHealth} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setState({ messages: [], isLoading: false, sessionId: makeComposerSessionId(), loadingStartedAt: null })}
            aria-label="Start a new Composer session"
            className="gap-1.5 text-text-muted hover:text-text-primary"
          >
            <RefreshCw className="h-3 w-3" />
            New Session
          </Button>
        </div>
      </div>

      {/* Project scope */}
      <div className="border-b border-border bg-bg-surface/50 px-4 py-3 space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-3.5 w-3.5 text-accent" />
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-widest">Project Scope</div>
        </div>
        <div className="flex gap-2">
          <Input
            value={projectScope}
            onChange={(e) => setProjectScope(e.target.value)}
            placeholder="/path/to/local/project"
            className="flex-1 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0"
            onClick={() => saveProjectScope(projectScope)}
          >
            <Pin className="h-3 w-3" />
            Pin
          </Button>
        </div>
        {recentScopes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recentScopes.map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setProjectScope(scope)}
                className={cn(
                  "px-2 py-1 text-[10px] font-mono rounded border border-border",
                  "text-text-secondary hover:text-accent hover:border-accent/30 hover:bg-accent/5",
                  "transition-colors duration-(--duration-micro)"
                )}
                title={scope}
              >
                {scope.length > 42 ? `${scope.slice(0, 39)}...` : scope}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" aria-label="Composer conversation" aria-busy={state.isLoading}>
        {apiHealth.apiOnline === false && (
          <div className="mx-4 mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[10px] font-mono text-red-200">
            <p>
              Yap Engine API is unreachable. Confirm it is running on port 3001:{" "}
              <span className="font-semibold">curl http://127.0.0.1:3001/health</span>
            </p>
          </div>
        )}
        {/* [V6.2-FIX-26] Model warming-up banner — distinct from generic fallback */}
        {isModelWarmingUp && (
          <div className="mx-4 mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-[10px] font-mono text-sky-100">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 text-sky-300 animate-spin shrink-0" />
                  <span className="font-semibold text-sky-200">Model warming up</span>
                </div>
                <p className="text-sky-100/90">
                  phi4-fast (4.1 GB) is loading in the background — typically 60-120 s on this
                  host. Auto-retry scheduled in ~90 s, or click Retry manually.
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-sky-400/20" aria-hidden>
                  <div
                    className="h-full rounded-full bg-sky-300/70 transition-all duration-500"
                    style={{ width: `${warmingUpProgressPct}%` }}
                  />
                </div>
                {lastAssistant?.diagnostics?.ollamaEndpoint && (
                  <p className="text-sky-200/70">
                    Ollama: {lastAssistant.diagnostics.ollamaEndpoint}
                  </p>
                )}
                <p className="text-sky-200/60">
                  Monitor: <span className="text-sky-300">ollama ps</span>{" "}
                  or <span className="text-sky-300">curl {lastAssistant?.diagnostics?.ollamaEndpoint ?? "http://127.0.0.1:11434"}/api/ps</span>
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => { warmingUpRetryHandled.current = true; sendMessage(lastPrompt); }}
                disabled={!canRetryLastPrompt}
                className="h-7 shrink-0 border-sky-400/30 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20"
              >
                {warmingUpRetrySeconds !== null && warmingUpRetrySeconds > 0
                  ? `Retry in ${warmingUpRetrySeconds}s`
                  : "Retry now"}
              </Button>
            </div>
          </div>
        )}
        {(isModelOffline || (showFallbackHint && !isModelWarmingUp)) && (
          <div className="mx-4 mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-[10px] font-mono text-yellow-100">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p>
                  {isModelOffline
                    ? "Ollama is currently unreachable. Composer will continue with local fleet summaries."
                    : "Model path fell back to a fleet summary for the last response."}
                </p>
                {lastAssistant?.diagnostics?.reason && (
                  <p className="text-yellow-200/90">
                    Reason: {lastAssistant.diagnostics.reason}
                  </p>
                )}
                {lastAssistant?.diagnostics?.ollamaEndpoint && (
                  <p className="text-yellow-200/90">
                    Endpoint: {lastAssistant.diagnostics.ollamaEndpoint}
                  </p>
                )}
                {typeof lastAssistant?.diagnostics?.retryCount === "number" && (
                  <p className="text-yellow-200/90">
                    Retries: {lastAssistant.diagnostics.retryCount}
                  </p>
                )}
                {lastAssistant?.diagnostics?.circuitOpen && (
                  <p className="text-yellow-200/90">
                    Circuit breaker is open due to repeated model failures; retry after cooldown.
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => sendMessage(lastPrompt)}
                disabled={!canRetryLastPrompt}
                className="h-7 border-yellow-400/30 bg-yellow-500/5 text-yellow-100 hover:bg-yellow-500/15"
              >
                Retry
              </Button>
            </div>
          </div>
        )}
        {state.messages.length === 0 ? (
          <div className="space-y-4">
            {/* Welcome state */}
            <div className="flex flex-col items-center justify-center py-10 gap-4 px-6">
              {/* Animated swarm logo */}
              <div className="relative h-16 w-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-border/40 orbit-ring" style={{ animationDuration: "10s" }} />
                <div className="absolute inset-2 rounded-full border border-accent/20 orbit-ring-ccw" />
                <div className="absolute inset-4 rounded-full border border-border/20" />
                <Bot className="h-5 w-5 text-accent relative z-10" />
              </div>
              <div className="text-center space-y-2">
                <div className="text-sm font-mono font-semibold text-text-primary">
                  Yap Engine Composer
                </div>
                <div className="min-h-[1.2rem]">
                  <WelcomeTypewriter />
                </div>
              </div>
            </div>
            <Separator />
            <PresetChips onSelect={sendMessage} />
          </div>
        ) : (
          <div className="py-2" role="log" aria-live="polite" aria-relevant="additions text">
            {state.messages.map((msg, i) => (
              <MessageBubble key={`${msg.timestamp}-${i}`} msg={msg} />
            ))}
            {/* [V5.9-FIX-09] Avoid impure Date.now() calls during render. */}
            {state.isLoading && state.loadingStartedAt !== null && (
              <ThinkingIndicator startedAt={state.loadingStartedAt} />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        {state.messages.length > 0 && (
          <PresetChips onSelect={sendMessage} />
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2 mt-2">
          <div className="relative flex-1">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your agents, workflows, or system state…"
              aria-label="Composer message input"
              className="flex-1 resize-none text-xs pr-4"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="send"
              disabled={state.isLoading}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setInput("");
                }
              }}
            />
          </div>
          <Button
            type="submit"
            variant="accent"
            size="sm"
            disabled={state.isLoading || !input.trim()}
            className="gap-1.5 shrink-0"
          >
            {state.isLoading ? (
              <>
                <span className="think-dot h-1.5 w-1.5" />
                <span className="think-dot h-1.5 w-1.5" />
                <span className="think-dot h-1.5 w-1.5" />
              </>
            ) : (
              <>
                <Send className="h-3 w-3" />
                Send
              </>
            )}
          </Button>
        </form>
        <p className="text-[9px] font-mono text-text-muted mt-1.5 text-center">
          ↵ Enter · Esc clears input · Sessions are ephemeral · Context includes live fleet state
        </p>
        {isDegraded && (
          <p className="text-[9px] font-mono text-yellow-200/90 mt-1 text-center" aria-live="polite">
            Model responses may fallback under pressure. Operational status queries remain instant.
          </p>
        )}
      </div>
    </div>
  );
}
