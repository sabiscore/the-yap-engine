"use client";

import { Sparkles, WandSparkles } from "lucide-react";
import { VideoJobForm } from "@/components/video/VideoJobForm";
import { PRODUCT_BRAND } from "@/lib/brand";


const CREATIVE_PRINCIPLES = [
  ["01", "Hook first", "Start from tension, surprise, or a strong point of view before the render budget is spent."],
  ["02", "Shape the story", "Pick a structure and tone; the engine turns the brief into paced scenes, voice, captions, and visual beats."],
  ["03", "Polish the signal", "Word-timed captions, audio design, QC, and export packaging happen downstream automatically."],
] as const;

export default function VideoStudioPage() {
  return (
    <main className="yap-surface relative min-h-full overflow-y-auto bg-bg-base text-text-primary">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-accent/8 blur-3xl" />
        <div className="absolute -right-24 top-40 h-80 w-80 rounded-full bg-status-reload/6 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-accent">
              <WandSparkles className="size-3.5" aria-hidden="true" />
              {PRODUCT_BRAND.shortName} Studio
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-[2.7rem]">
              Turn one good idea into a short worth finishing.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
              Shape the creative intent. {PRODUCT_BRAND.name} handles the production chain — hook,
              script, visuals, voice, captions, QC, and export — while keeping the local runtime
              within its low-memory guardrails.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/video"
              className="inline-flex h-9 items-center rounded-md border border-border bg-bg-surface px-3 text-xs font-medium text-text-secondary transition-colors hover:border-border-active hover:text-text-primary"
            >
              Open queue
            </a>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(280px,0.52fr)]">
          <section className="min-w-0">
            <VideoJobForm />
          </section>

          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border bg-bg-elevated/65 p-5">
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
                Creative system
              </p>
              <div className="mt-5 flex flex-col gap-5">
                {CREATIVE_PRINCIPLES.map(([number, title, body]) => (
                  <div key={number} className="flex gap-3">
                    <span className="pt-0.5 font-mono text-xs text-accent">{number}</span>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-accent/20 bg-accent/6 p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-accent" aria-hidden="true" />
                <p className="text-sm font-semibold text-text-primary">Designed for fast iteration</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                Start with 15–30 seconds for the fastest creative loop. The queue, renderer,
                and voice stack expose pressure and readiness rather than hiding failures behind a spinner.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
