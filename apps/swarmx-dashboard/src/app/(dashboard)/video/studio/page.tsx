"use client";

import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Lightbulb, Sparkles } from "lucide-react";
import { useVideoStore } from "../../../../stores/video";
import type { VideoJobRequest } from "../../../../lib/video-dashboard";

const EXAMPLE_PROMPT = "Explain why sleep debt changes reaction time using a surprising opening, 3 visual proof beats, and a memorable takeaway.";

const PRESETS = [
  { id: "fact", label: "Fact Drop", short: "Surprise + proof", prompt: "Turn one surprising fact into a fast, high-retention short with a strong curiosity gap.", style: "faceless_broll", tone: "educational" },
  { id: "myth", label: "Myth Bust", short: "Challenge a belief", prompt: "Bust a common myth with a sharp hook, 3 proof beats, and a memorable conclusion.", style: "kinetic_text", tone: "contrarian" },
  { id: "story", label: "Storytime", short: "Hook → escalation → payoff", prompt: "Tell a compact story with a cold open, escalating beats, visual changes, and payoff.", style: "storytime", tone: "cinematic" },
  { id: "list", label: "Countdown", short: "Fast value ladder", prompt: "Create a countdown with escalating value, fast visual beats, and a strong final reveal.", style: "faceless_broll", tone: "urgent" },
] as const;

export default function VideoStudioPage() {
  const router = useRouter();
  const submitJob = useVideoStore((state) => state.submitJob);
  const submitError = useVideoStore((state) => state.submitError);
  const isSubmitting = useVideoStore((state) => state.isSubmitting);
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState<VideoJobRequest["tone"]>("educational");
  const [style, setStyle] = useState<VideoJobRequest["style"]>("faceless_broll");
  const [platform, setPlatform] = useState<VideoJobRequest["platform"]>("tiktok");
  const [duration, setDuration] = useState(30);

  const ready = useMemo(() => prompt.trim().length >= 8 && !isSubmitting, [prompt, isSubmitting]);
  const promptLength = prompt.length;
  const promptLengthClass = promptLength > 1900 ? "text-status-warning" : "text-text-muted";

  function usePreset(preset: (typeof PRESETS)[number]) {
    setPrompt(preset.prompt);
    setStyle(preset.style);
    setTone(preset.tone);
  }

  function tryExample() {
    setPrompt(EXAMPLE_PROMPT);
    setTone("educational");
    setStyle("faceless_broll");
    setDuration(30);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    const request: VideoJobRequest = {
      prompt: prompt.trim(),
      platform: platform ?? "tiktok",
      tone: tone ?? "educational",
      style: style ?? "faceless_broll",
      targetDurationSeconds: duration,
      captionStyle: "bold_center",
    };
    const createdJobId = await submitJob(request);
    if (createdJobId) router.push(`/video/${encodeURIComponent(createdJobId)}`);
  }

  return (
    <main className="min-h-screen bg-bg text-text-primary px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.22em] text-accent">
              <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />
              SwarmX Video Studio
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Turn an idea into a short people want to finish.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">Give SwarmX the idea, angle and vibe. The pipeline handles hook strategy, script, storyboard, voice, visuals, captions and production QC.</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={tryExample} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs font-medium text-text-secondary transition hover:border-border-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
              Try an example
            </button>
            <a href="/video" className="text-xs font-mono text-text-muted underline-offset-4 hover:text-accent hover:underline">Open jobs</a>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <form onSubmit={submit} className="rounded-2xl border border-border-active bg-bg-elevated/90 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] md:p-6">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-xs font-mono uppercase tracking-wider text-text-muted" htmlFor="video-prompt">What should the video be about?</label>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg/60 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-text-muted">
                <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />
                AI-directed
              </span>
            </div>
            <textarea id="video-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: Explain why sleep debt changes reaction time using a surprising opening and 3 visual proof beats." rows={7} maxLength={2000} aria-describedby="video-prompt-help" className="mt-3 w-full resize-none rounded-xl border border-border bg-bg px-4 py-4 text-sm leading-6 outline-none transition placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/20" />
            <div className="mt-2 flex items-start justify-between gap-4">
              <p id="video-prompt-help" className="max-w-xl text-[11px] leading-5 text-text-muted">Best results come from a clear hook, the feeling you want, the visual idea, and the takeaway. SwarmX fills in the production detail.</p>
              <span className={`shrink-0 font-mono text-[10px] tabular-nums ${promptLengthClass}`}>{promptLength}/2000</span>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Start from a format</p>
                <p className="text-[10px] text-text-muted">One click sets the creative defaults.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {PRESETS.map((preset) => (
                  <button type="button" key={preset.id} onClick={() => usePreset(preset)} className="group rounded-xl border border-border bg-bg/70 p-3 text-left transition hover:-translate-y-0.5 hover:border-border-active hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent">
                    <span className="block text-xs font-semibold text-text-primary">{preset.label}</span>
                    <span className="mt-1 block text-[10px] font-mono uppercase tracking-wide text-accent">{preset.short}</span>
                    <span className="mt-2 block text-[11px] leading-5 text-text-secondary">{preset.prompt}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <Field label="Platform"><select value={platform} onChange={(e) => setPlatform(e.target.value as VideoJobRequest["platform"])} className="control"><option value="tiktok">TikTok</option><option value="reels">Instagram Reels</option><option value="shorts">YouTube Shorts</option><option value="generic">Generic</option></select></Field>
              <Field label="Tone"><select value={tone} onChange={(e) => setTone(e.target.value as VideoJobRequest["tone"])} className="control"><option value="educational">Educational</option><option value="urgent">Urgent</option><option value="contrarian">Contrarian</option><option value="cinematic">Cinematic</option><option value="warm">Warm</option><option value="minimal">Minimal</option></select></Field>
              <Field label="Visual style"><select value={style} onChange={(e) => setStyle(e.target.value as VideoJobRequest["style"])} className="control"><option value="faceless_broll">Faceless b-roll</option><option value="kinetic_text">Kinetic text</option><option value="storytime">Storytime</option><option value="tutorial">Tutorial</option><option value="myth_busting">Myth busting</option></select></Field>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-bg/50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div><p className="text-xs font-medium">Target duration</p><p className="text-[11px] text-text-muted">Shorter formats iterate faster; the production pipeline supports up to 3 minutes.</p></div>
                <div className="flex items-center gap-3"><input aria-label="Target duration" type="range" min={15} max={90} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-44" /><span className="w-12 text-right font-mono text-xs tabular-nums">{duration}s</span></div>
              </div>
            </div>

            <button disabled={!ready} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3.5 text-sm font-semibold text-bg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40" type="submit">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {isSubmitting ? "Building your video…" : "Make a Yap"}
            </button>
            {submitError && <div className="mt-4 rounded-xl border border-status-error/35 bg-status-error/10 p-4 text-sm text-status-error" role="alert">{submitError}</div>}
          </form>

          <aside className="rounded-2xl border border-border bg-bg-elevated/60 p-5">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-muted">What SwarmX optimizes</p>
            <div className="mt-5 space-y-4">
              {[
                ["01", "Stop the scroll", "Contrasting hooks, curiosity gaps and open loops before render spend."],
                ["02", "Keep momentum", "Compact beats, visual changes and a delayed payoff instead of flat exposition."],
                ["03", "Sound human", "Existing voice routing keeps delivery consistent with the chosen tone and story mode."],
                ["04", "Make every frame earn its place", "Remote L4 generation or the certified local render path feeds the same FFmpeg assembly."],
                ["05", "Caption to the actual voice", "Audio-derived word timing is available for kinetic-text workflows."],
                ["06", "Ship clean", "Artifact, media, template and publication gates run before an export is considered ready."],
              ].map(([n, title, body]) => <div key={n} className="flex gap-3"><span className="mt-0.5 font-mono text-xs text-accent">{n}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-text-muted">{body}</p></div></div>)}
            </div>
          </aside>
        </section>
      </div>
      <style jsx>{`.control{width:100%;margin-top:.5rem;border-radius:.75rem;border:1px solid var(--color-border);background:var(--color-bg);padding:.7rem .8rem;font-size:.8rem;outline:none}.control:focus{border-color:var(--color-accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--color-accent) 20%,transparent)}`}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-mono text-text-muted">{label}{children}</label>;
}
