"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Clapperboard, Info, Loader2, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QUICK_START_PRESETS, mapQuickStartPresetToDraft, type QuickStartPreset } from "@/lib/video-form-presets";
import { useVideoStore } from "../../stores/video";
import type { VideoJobRequest } from "../../lib/video-dashboard";

type ModelRoute = NonNullable<VideoJobRequest["modelTier"]> | "auto";
type TemplateFamilyRoute = NonNullable<VideoJobRequest["templateFamily"]> | "none";

type SelectOption<T extends string> = {
  value: T;
  label: string;
  help?: string;
  previewSrc?: string | undefined;
  previewUnavailable?: boolean;
};

const VOICE_PREVIEW_ASSETS_READY = true;
const VOICE_PREVIEW_ASSETS: Record<string, string> = {
  default: "/audio/voice-previews/kokoro-narrator.wav",
  calm: "/audio/voice-previews/kokoro-warm.wav",
  energetic: "/audio/voice-previews/kokoro-energetic.wav",
  narrator: "/audio/voice-previews/kokoro-narrator.wav",
  kokoro_warm: "/audio/voice-previews/kokoro-warm.wav",
  kokoro_narrator: "/audio/voice-previews/kokoro-narrator.wav",
  kokoro_energetic: "/audio/voice-previews/kokoro-energetic.wav",
  kokoro_contrarian: "/audio/voice-previews/kokoro-contrarian.wav",
  kokoro_storytime_dual: "/audio/voice-previews/kokoro-storytime-dual.wav",
};

function previewAsset(key: keyof typeof VOICE_PREVIEW_ASSETS): string | undefined {
  return VOICE_PREVIEW_ASSETS_READY ? VOICE_PREVIEW_ASSETS[key] : undefined;
}

function playPreview(src: string): void {
  if (typeof Audio === "undefined") return;
  void new Audio(src).play();
}

function Select<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  disabled?: boolean;
}) {
  const selected = options.find((option) => option.value === value);
  const selectedPreviewSrc = selected?.previewSrc;
  const selectedLabel = selected?.label ?? label;
  const showPreviewControl = Boolean(selectedPreviewSrc || selected?.previewUnavailable);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[10px] font-mono uppercase tracking-wide text-text-muted">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          disabled={disabled}
          className={cn(
            "h-9 min-w-0 flex-1 rounded border border-border bg-bg-input px-2.5 text-sm text-text-primary",
            "transition-colors duration-(--duration-micro)",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {showPreviewControl && (
          <button
            type="button"
            onClick={() => {
              if (selectedPreviewSrc) playPreview(selectedPreviewSrc);
            }}
            disabled={disabled || !selectedPreviewSrc}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-bg-surface text-text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
            title={selectedPreviewSrc ? `Play ${selectedLabel} preview` : "Kokoro preview asset is not generated yet"}
            aria-label={selectedPreviewSrc ? `Play ${selectedLabel} voice preview` : `${selectedLabel} voice preview unavailable`}
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {selected?.help && (
        <p className="flex items-start gap-1 text-[10px] leading-4 text-text-muted">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{selected.help}</span>
        </p>
      )}
    </div>
  );
}

interface VideoJobFormProps {
  onSubmitted?: (jobId: string) => void;
  submissionBlocked?: boolean;
  submissionBlockReason?: string | null;
  presetFocusSignal?: number;
}

export function VideoJobForm({
  onSubmitted,
  submissionBlocked = false,
  submissionBlockReason = null,
  presetFocusSignal = 0,
}: VideoJobFormProps) {
  const formId = useId();
  const presetGroupRef = useRef<HTMLDivElement | null>(null);
  const { submitJob, isSubmitting, submitError, clearErrors } = useVideoStore();

  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState<NonNullable<VideoJobRequest["platform"]>>("tiktok");
  const [niche, setNiche] = useState<NonNullable<VideoJobRequest["niche"]>>("motivational");
  const [targetDuration, setTargetDuration] = useState("30");
  const [modelRoute, setModelRoute] = useState<ModelRoute>("auto");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<NonNullable<VideoJobRequest["tone"]>>("educational");
  const [style, setStyle] = useState<NonNullable<VideoJobRequest["style"]>>("faceless_broll");
  const [templateFamily, setTemplateFamily] = useState<TemplateFamilyRoute>("none");
  const [captionStyle, setCaptionStyle] = useState<NonNullable<VideoJobRequest["captionStyle"]>>("bold_center");
  const [voice, setVoice] = useState<NonNullable<VideoJobRequest["voice"]>>("default");
  const [voiceProfileId, setVoiceProfileId] = useState<NonNullable<VideoJobRequest["voiceProfileId"]>>("auto");
  const [storyMode, setStoryMode] = useState<NonNullable<VideoJobRequest["storyMode"]>>("single_narrator");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lastQueuedId, setLastQueuedId] = useState<string | null>(null);

  const trimmedPrompt = prompt.trim();
  const canSubmit = trimmedPrompt.length > 0 && !isSubmitting && !submissionBlocked;
  const modelTier = modelRoute === "auto" ? undefined : modelRoute;
  const submitDescriptionId = submissionBlocked ? `${formId}-submit-blocked` : undefined;

  useEffect(() => {
    if (presetFocusSignal === 0) return;
    presetGroupRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    presetGroupRef.current?.focus();
  }, [presetFocusSignal]);

  const applyQuickStart = (preset: QuickStartPreset) => {
    const draft = mapQuickStartPresetToDraft(preset);
    setPrompt(draft.prompt);
    setPlatform(draft.platform);
    setNiche(draft.niche);
    setTargetDuration(draft.targetDuration);
    setTone(draft.tone);
    setStyle(draft.style);
    setTemplateFamily(draft.templateFamily ?? "none");
    setCaptionStyle(draft.captionStyle);
    setVoice(draft.voice);
    setVoiceProfileId(draft.voiceProfileId);
    setStoryMode(draft.storyMode);
    setAudience(draft.audience);
    setShowAdvanced(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submissionBlocked) {
      return;
    }
    clearErrors();

    const jobRequest: VideoJobRequest = {
      prompt: trimmedPrompt,
      platform,
      niche,
      targetDurationSeconds: Number(targetDuration),
      tone,
      style,
      captionStyle,
      voice,
      voiceProfileId,
      storyMode,
      ...(audience.trim() ? { audience: audience.trim() } : {}),
      ...(modelTier !== undefined ? { modelTier } : {}),
      ...(templateFamily !== "none" ? { templateFamily } : {}),
    };

    const jobId = await submitJob(jobRequest);

    if (jobId) {
      setPrompt("");
      setLastQueuedId(jobId);
      onSubmitted?.(jobId);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="live-panel-edge flex flex-col gap-4 rounded border border-border bg-bg-elevated/80 p-4 shadow-[var(--shadow-accent-glow)]"
      aria-labelledby={`${formId}-title`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={`${formId}-title`} className="text-sm font-semibold tracking-tight text-text-primary">
              New Video Job
            </h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            Shape the brief, then queue a low-RAM-safe render by default.
          </p>
        </div>
        <span className="shrink-0 rounded border border-border-accent bg-[var(--color-accent-dim)] px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-accent">
          {modelRoute === "auto" ? "Auto route" : "Override"}
        </span>
      </div>

      {submissionBlocked && (
        <div
          id={`${formId}-submit-blocked`}
          className="flex items-start gap-2 rounded border border-status-error/35 bg-status-error/10 px-3 py-2 text-xs text-status-error"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p>
            {submissionBlockReason ?? "Video submission is blocked until runtime readiness recovers."}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${formId}-prompt`}
          className="text-[10px] font-mono uppercase tracking-wide text-text-muted"
        >
          Prompt
        </label>
        <div
          ref={presetGroupRef}
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Quick-start prompt presets"
          tabIndex={-1}
        >
          {QUICK_START_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyQuickStart(preset)}
              disabled={isSubmitting}
              className={cn(
                "rounded border border-border bg-bg-surface px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-text-secondary",
                "hover:border-border-active hover:bg-bg-elevated",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              title={`Apply ${preset.label} preset`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <textarea
          id={`${formId}-prompt`}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Create a 30-second faceless TikTok-style video titled '3 habits that improve focus'..."
          rows={4}
          maxLength={2000}
          disabled={isSubmitting}
          className={cn(
            "min-h-28 w-full resize-none rounded border border-border bg-bg-input px-3 py-2.5",
            "text-sm leading-6 text-text-primary placeholder:text-text-muted",
            "transition-colors duration-(--duration-micro)",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-text-muted">
            Auto route omits `modelTier`; explicit overrides remain available for compatible hosts.
          </span>
          <span className="shrink-0 font-mono text-[10px] text-text-muted tabular-nums">
            {prompt.length}/2000
          </span>
        </div>
        <p className="text-[10px] leading-4 text-text-muted">
          High-signal prompts specify: (1){" "}
          <strong className="text-text-secondary">hook angle</strong> — the contrarian or
          surprising claim that opens the video; (2){" "}
          <strong className="text-text-secondary">emotional arc</strong> — what the viewer
          moves through from start to close; (3){" "}
          <strong className="text-text-secondary">concrete takeaway</strong> — the one
          actionable thing they leave with; (4){" "}
          <strong className="text-text-secondary">CTA intent</strong> — the behavior or save
          desired. Generic topic-only prompts produce flat scripts.
        </p>
      </div>

      <section className="rounded border border-border/60 bg-bg-surface/30 p-3" aria-label="Essentials">
        <div className="mb-2 text-[10px] font-mono uppercase tracking-wide text-text-muted">Essentials</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Select
            id={`${formId}-platform`}
            label="Platform"
            value={platform}
            onChange={setPlatform}
            disabled={isSubmitting}
            options={[
              { value: "tiktok", label: "TikTok" },
              { value: "youtube_shorts", label: "YT Shorts" },
              { value: "reels", label: "Reels" },
              { value: "generic", label: "Generic" },
            ]}
          />
          <Select
            id={`${formId}-duration`}
            label="Duration"
            value={targetDuration}
            onChange={setTargetDuration}
            disabled={isSubmitting}
            options={[
              { value: "15", label: "15s" },
              { value: "30", label: "30s" },
              { value: "60", label: "60s" },
              { value: "90", label: "90s" },
              { value: "120", label: "2 min" },
              { value: "180", label: "3 min" },
            ]}
          />
          <Select
            id={`${formId}-voice`}
            label="Voice"
            value={voice}
            onChange={setVoice}
            disabled={isSubmitting}
            options={[
              { value: "default", label: "Default", help: "Auto-selects a Kokoro speaker from the selected tone when Kokoro is available.", previewSrc: previewAsset("default"), previewUnavailable: !VOICE_PREVIEW_ASSETS_READY },
              { value: "calm", label: "Calm", help: "Uses a warmer, slower delivery for reflective story and tutorial pacing.", previewSrc: previewAsset("calm"), previewUnavailable: !VOICE_PREVIEW_ASSETS_READY },
              { value: "energetic", label: "Energetic", help: "Uses a faster, assertive delivery for kinetic text and urgent hooks.", previewSrc: previewAsset("energetic"), previewUnavailable: !VOICE_PREVIEW_ASSETS_READY },
              { value: "narrator", label: "Narrator", help: "Uses a measured voice that suits cinematic and faceless b-roll formats.", previewSrc: previewAsset("narrator"), previewUnavailable: !VOICE_PREVIEW_ASSETS_READY },
            ]}
          />
        </div>
      </section>

      <section className="rounded border border-border/60 bg-bg-surface/30 p-3" aria-label="Advanced options">
        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          className="flex w-full items-center justify-between text-[10px] font-mono uppercase tracking-wide text-text-muted"
          aria-expanded={showAdvanced}
          aria-controls={`${formId}-advanced-grid`}
        >
          <span>Advanced</span>
          <span aria-hidden="true">{showAdvanced ? "▴" : "▾"}</span>
        </button>

        {showAdvanced && (
          <div id={`${formId}-advanced-grid`} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Select
              id={`${formId}-niche`}
              label="Niche"
              value={niche}
              onChange={setNiche}
              disabled={isSubmitting}
              options={[
                { value: "tech", label: "Tech", help: "Shifts accents brighter and cooler so UI or code concepts feel sharper." },
                { value: "motivational", label: "Motivational", help: "Keeps accents warmer and slightly brighter for higher-energy calls to action." },
                { value: "finance", label: "Finance", help: "Shifts accents toward blue-green for a cooler, analytical look." },
                { value: "facts", label: "Facts", help: "Uses colder, cleaner accents so explainers read as evidence-led." },
                { value: "true_crime", label: "True Crime", help: "Desaturates the accent and darkens the palette for a colder reveal tone." },
                { value: "other", label: "Other", help: "Uses the tone palette with only a small neutral adjustment." },
              ]}
            />
            <Select
              id={`${formId}-model`}
              label="Model"
              value={modelRoute}
              onChange={setModelRoute}
              disabled={isSubmitting}
              options={[
                { value: "auto", label: "Auto (recommended)" },
                { value: "fast", label: "Fast (3.8B)" },
                { value: "worker", label: "Worker (7B)" },
                { value: "supervisor", label: "Supervisor (7B)" },
                { value: "reasoner", label: "Reasoner (7B)" },
              ]}
            />
            <Select
              id={`${formId}-tone`}
              label="Tone"
              value={tone}
              onChange={setTone}
              disabled={isSubmitting}
              options={[
                { value: "educational", label: "Educational", help: "Blue-led palette with steady motion for explanatory pacing." },
                { value: "urgent", label: "Urgent", help: "Red-orange palette with stronger early pulse for time-pressure hooks." },
                { value: "warm", label: "Warm", help: "Peach accent and gentler drift for mentor-style narration." },
                { value: "contrarian", label: "Contrarian", help: "High-contrast red accent for disagreement and myth-busting beats." },
                { value: "cinematic", label: "Cinematic", help: "Gold accent and slower ambient motion for story-first framing." },
                { value: "minimal", label: "Minimal", help: "White-on-black treatment with restrained motion and sparse captions." },
                { value: "faceless_broll", label: "Faceless B-roll", help: "Neutral palette that lets b-roll and voice-over carry the scene." },
                { value: "kinetic_text", label: "Kinetic Text", help: "High-contrast caption focus with faster pulse and sharper panels." },
              ]}
            />
            <Select
              id={`${formId}-style`}
              label="Style"
              value={style}
              onChange={setStyle}
              disabled={isSubmitting}
              options={[
                { value: "faceless_broll", label: "Faceless B-roll", help: "Slower soft-panel movement beneath captions for voice-over scenes." },
                { value: "kinetic_text", label: "Kinetic Text", help: "Faster pulse and scan motion to make text the primary visual object." },
                { value: "storytime", label: "Storytime", help: "Calmer drift and optional dialogue voice routing for quoted lines." },
                { value: "tutorial", label: "Tutorial", help: "Stable instructional pacing with low-amplitude motion." },
                { value: "myth_busting", label: "Myth Busting", help: "Sharper reveal pulse during the hook before settling into proof." },
              ]}
            />
            <Select
              id={`${formId}-template-family`}
              label="Template"
              value={templateFamily}
              onChange={setTemplateFamily}
              disabled={isSubmitting}
              options={[
                { value: "none", label: "None (auto)", help: "Lets the planner choose beat structure freely, without a fixed template." },
                { value: "myth-vs-fact", label: "Myth vs Fact", help: "Hook states the myth, body reveals the surprising fact, resolution explains why it persisted." },
                { value: "list/countdown", label: "List / Countdown", help: "Hook sets the stakes, body cycles through 3-5 items fast, resolution synthesizes the takeaway." },
                { value: "mystery/reveal", label: "Mystery / Reveal", help: "Hook presents an anomaly, body drops clues, resolution reveals the answer." },
                { value: "product-demo", label: "Product Demo", help: "Hook is the pain point, body demonstrates the solution, resolution shows the outcome." },
                { value: "quote-to-insight", label: "Quote to Insight", help: "Hook drops a quote, body analyzes its meaning, resolution applies it to the viewer." },
                { value: "chart/data", label: "Chart / Data", help: "Hook is a striking stat, body visualizes the trend, resolution explains the implication." },
                { value: "motivational", label: "Motivational", help: "Hook is a moment of defeat, body shows the pivot, resolution delivers the triumph." },
                { value: "series-recap", label: "Series Recap", help: "Hook reminds the cliffhanger, body blitzes plot points, resolution teases the next episode." },
                { value: "pov-immersion", label: "POV Immersion", help: "First-person, real-time sensory beats — drops the viewer directly into the moment." },
                { value: "reddit-story", label: "Reddit Story", help: "Found-story readaloud framing with a narrator's aside and a punchline resolution." },
              ]}
            />
            <Select
              id={`${formId}-caption-style`}
              label="Captions"
              value={captionStyle}
              onChange={setCaptionStyle}
              disabled={isSubmitting}
              options={[
                { value: "bold_center", label: "Bold Center", help: "Large centered cards for high-retention text-first shorts." },
                { value: "lower_third", label: "Lower Third", help: "Moves captions lower so background motion and b-roll stay visible." },
                { value: "minimal", label: "Minimal", help: "Smaller caption box with lighter backing for sparse visual treatments." },
              ]}
            />
            <Select
              id={`${formId}-voice-profile`}
              label="Voice Profile"
              value={voiceProfileId}
              onChange={setVoiceProfileId}
              disabled={isSubmitting}
              options={[
                { value: "auto", label: "Auto", help: "Uses benchmark ranking unless a Kokoro profile is pinned." },
                { value: "kokoro_warm", label: "Kokoro Warm", help: "Pins the warm Kokoro speaker across repeat submissions.", previewSrc: previewAsset("kokoro_warm"), previewUnavailable: !VOICE_PREVIEW_ASSETS_READY },
                { value: "kokoro_narrator", label: "Kokoro Narrator", help: "Pins a measured narrator voice for explainers and cinematic shorts.", previewSrc: previewAsset("kokoro_narrator"), previewUnavailable: !VOICE_PREVIEW_ASSETS_READY },
                { value: "kokoro_energetic", label: "Kokoro Energetic", help: "Pins a faster speaker for urgent and kinetic text formats.", previewSrc: previewAsset("kokoro_energetic"), previewUnavailable: !VOICE_PREVIEW_ASSETS_READY },
                { value: "kokoro_contrarian", label: "Kokoro Contrarian", help: "Pins a sharper speaker for myth-busting and disagreement hooks.", previewSrc: previewAsset("kokoro_contrarian"), previewUnavailable: !VOICE_PREVIEW_ASSETS_READY },
                { value: "kokoro_storytime_dual", label: "Kokoro Storytime Dual", help: "Pins narrator plus a second Kokoro speaker for quoted storytime lines.", previewSrc: previewAsset("kokoro_storytime_dual"), previewUnavailable: !VOICE_PREVIEW_ASSETS_READY },
              ]}
            />
            <Select
              id={`${formId}-story-mode`}
              label="Story Mode"
              value={storyMode}
              onChange={setStoryMode}
              disabled={isSubmitting}
              options={[
                { value: "single_narrator", label: "Single Narrator" },
                { value: "dialogue_storytime", label: "Dialogue Storytime" },
              ]}
            />
          </div>
        )}
      </section>

      {showAdvanced && (
        <p className="text-[10px] leading-4 text-text-muted">
          Tone controls palette/motion mood, style controls shot grammar and pacing, and voice profile pins how narration should sound across repeat uploads.
        </p>
      )}

      <details className="group rounded border border-border/60 bg-bg-surface/40 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[10px] font-mono uppercase tracking-wider text-text-muted transition-colors hover:text-text-secondary">
          <span>Model tier reference</span>
          <span className="text-[10px] text-text-muted transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
        </summary>
        <ul className="mt-2 space-y-1 text-[10px] leading-4 text-text-muted">
          <li><strong className="text-text-secondary">Auto</strong> — pipeline picks the safe model for current RAM. On LOW_RAM hosts (&lt;6.2 GB free), all four text stages use Pilot-lite (3.8 B Q4). Cold load ~120 s, warm ~8 min end-to-end.</li>
          <li><strong className="text-text-secondary">Fast</strong> — Pilot-lite for every stage. Needs ~3.3 GB. Best latency; simpler narrative.</li>
          <li><strong className="text-text-secondary">Worker / Supervisor / Reasoner</strong> — 7 B tiers for richer planning &amp; scripting. Need ≥ 6.2 GB free. <em>Silently ignored in LOW_RAM_MODE</em>: the pipeline falls back to Pilot-lite instead of failing admission.</li>
        </ul>
      </details>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor={`${formId}-audience`}
            className="text-[10px] font-mono uppercase tracking-wide text-text-muted"
          >
            Audience
          </label>
          <input
            id={`${formId}-audience`}
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
            maxLength={160}
            disabled={isSubmitting}
            placeholder="Busy founders, new creators, students..."
            className={cn(
              "h-9 w-full rounded border border-border bg-bg-input px-2.5 text-sm text-text-primary",
              "placeholder:text-text-muted transition-colors duration-(--duration-micro)",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
        </div>
      </div>

      {modelRoute !== "auto" && (
        <div className="flex items-start gap-2 rounded border border-status-warning/30 bg-status-warning/8 px-3 py-2 text-xs text-status-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p>
            Model overrides apply to every text stage. Use Auto for the controlled low-RAM video path.
          </p>
        </div>
      )}

      {/* Submission status region — live for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {submissionBlocked ? "Video job submission is blocked by runtime readiness." : null}
        {isSubmitting ? "Queuing video job…" : null}
        {lastQueuedId && !isSubmitting && !submitError ? "Video job queued successfully. Track progress in the queue below." : null}
      </div>

      {submitError && (
        <div
          className="rounded border border-status-error/35 bg-status-error/10 px-3 py-2 text-xs text-status-error"
          role="alert"
        >
          {submitError}
        </div>
      )}

      {lastQueuedId && !isSubmitting && !submitError && (
        <p className="text-xs text-status-success font-mono" role="status">
          Job queued — {lastQueuedId.slice(0, 8)}… Track progress in the queue.
        </p>
      )}

      <div className="flex items-center justify-end">
        <Button
          type="submit"
          variant="accent"
          size="lg"
          disabled={!canSubmit}
          aria-busy={isSubmitting}
          aria-describedby={submitDescriptionId}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Queuing job…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Generate Video
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
