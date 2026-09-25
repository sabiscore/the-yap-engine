"use client";

import Link from "next/link";
import { Brain, Eye, Gauge, Cpu } from "lucide-react";

const STACK = [
  {
    role: "Forge",
    model: "Qwen3 8B",
    quant: "Q4_K_M",
    size: "~5.2 GB",
    ctx: "6K",
    icon: Brain,
    note: "Primary coding + reasoning",
  },
  {
    role: "Relay",
    model: "Qwen3 4B",
    quant: "Q4_K_M",
    size: "~2.6 GB",
    ctx: "4K",
    icon: Cpu,
    note: "Utility + fallback",
  },
  {
    role: "Vision",
    model: "Qwen3-VL 4B",
    quant: "Q4_K_M",
    size: "~3.3 GB",
    ctx: "4K",
    icon: Eye,
    note: "Serialized frame analysis",
  },
] as const;

export function LocalAgentStack() {
  return (
    <section className="rounded-lg border border-border bg-bg-surface p-4 card-interactive">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-text-muted">
            <Gauge className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            OpenClaw local stack
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            Serialized local inference · 8–16 GB profile
          </p>
        </div>
        <Link
          href="/settings"
          className="text-[10px] font-mono text-accent underline underline-offset-2 hover:text-text-primary"
        >
          Inspect
        </Link>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {STACK.map(({ role, model, quant, size, ctx, icon: Icon, note }) => (
          <div
            key={role}
            className="rounded-md border border-border bg-bg-elevated/40 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span className="text-[10px] font-mono uppercase tracking-wide text-text-muted">
                {role}
              </span>
            </div>
            <div className="mt-1 text-sm font-semibold text-text-primary">{model}</div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] font-mono text-text-muted">
              <span>{quant}</span>
              <span>{size}</span>
              <span>{ctx} ctx</span>
            </div>
            <div className="mt-1.5 text-[10px] text-text-muted">{note}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-[9px] font-mono text-text-muted">
        <span>1 inference at a time</span>
        <span>keep-alive 0s</span>
        <span>native Ollama API</span>
      </div>
    </section>
  );
}
