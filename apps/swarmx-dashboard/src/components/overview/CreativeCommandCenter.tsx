"use client";

import Link from "next/link";
import { AudioLines, Clapperboard, Layers3, WandSparkles } from "lucide-react";

const ACTIONS = [
  { href: "/video", label: "Create video", note: "Brief → concept → render", icon: Clapperboard },
  { href: "/video?view=backgrounds", label: "Background lab", note: "Recipes + visual depth", icon: Layers3 },
  { href: "/video?view=audio", label: "Audio timeline", note: "Timing + visual anchors", icon: AudioLines },
  { href: "/video?view=review", label: "Visual review", note: "QC + bounded revision", icon: WandSparkles },
] as const;

export function CreativeCommandCenter() {
  return (
    <section className="rounded-lg border border-border bg-bg-surface p-4 card-interactive panel-enter">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-text-muted">
            <WandSparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Creative command center
          </div>
          <h2 className="mt-1 text-sm font-semibold text-text-primary">
            Compile ideas into reviewable scenes
          </h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-text-muted">
            Creative DNA, scene graphs, advanced backgrounds, audio timing and localized
            rerenders are treated as one production system.
          </p>
        </div>
        <span className="rounded-full border border-border px-2 py-1 text-[9px] font-mono text-text-muted">
          incremental
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIONS.map(({ href, label, note, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="group rounded-md border border-border bg-bg-elevated/40 p-3 transition-colors hover:border-accent/50 hover:bg-bg-elevated"
          >
            <div className="flex items-center justify-between">
              <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="text-[9px] font-mono text-text-muted group-hover:text-accent">→</span>
            </div>
            <div className="mt-3 text-xs font-semibold text-text-primary">{label}</div>
            <div className="mt-1 text-[10px] leading-relaxed text-text-muted">{note}</div>
          </Link>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-2 text-[9px] font-mono text-text-muted">
        <span>audio-first</span>
        <span>scene-local invalidation</span>
        <span>deterministic QC</span>
        <span>human-gated publish</span>
      </div>
    </section>
  );
}
