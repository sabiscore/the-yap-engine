"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Film, Play, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PreProductionStatusBadge } from "@/components/series/PreProductionStatusBadge";
import { EpisodeScriptPanel } from "@/components/series/EpisodeScriptPanel";
import { ScenePromptViewer } from "@/components/series/ScenePromptViewer";
import { EpisodeViralityPanel } from "@/components/series/EpisodeViralityPanel";
import { AudioPlanPanel } from "@/components/series/AudioPlanPanel";
import { PlatformAssetsPanel } from "@/components/series/PlatformAssetsPanel";
import { QualityGatePanel } from "@/components/series/QualityGatePanel";
import { ContinuityReportPanel } from "@/components/series/ContinuityReportPanel";
import { CinematicDirectionsPanel } from "@/components/series/CinematicDirectionsPanel";
import { PassStatusRow } from "@/components/series/PassStatusRow";
import { useSeriesStore } from "@/stores/series";

const POLL_INTERVAL_MS = 4_000;

const IN_PROGRESS_STATUSES = new Set(["scripting", "prompting", "audio_assets", "scoring"]);

export default function EpisodePreProductionPage() {
  const params = useParams<{ id: string; episodeNumber: string }>();
  const router = useRouter();
  const seriesId = params?.id ?? "";
  const episodeNumber = Number.parseInt(params?.episodeNumber ?? "1", 10);

  const fetchSeriesDetail = useSeriesStore((s) => s.fetchSeriesDetail);
  const prepareEpisode    = useSeriesStore((s) => s.prepareEpisode);
  const produceEpisode    = useSeriesStore((s) => s.produceEpisode);
  const rerunEpisodePass  = useSeriesStore((s) => s.rerunEpisodePass);
  const series = useSeriesStore((s) => s.series.get(seriesId));

  const [isPreparing, setIsPreparing] = useState(false);
  const [isProducing, setIsProducing] = useState(false);
  const [rerunningPass, setRerunningPass] = useState<"a" | "b" | "c" | "d" | null>(null);
  const [overrideGate, setOverrideGate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Initial fetch
  useEffect(() => {
    if (!seriesId) return;
    void fetchSeriesDetail(seriesId);
  }, [seriesId, fetchSeriesDetail]);

  // Poll while pre-production is in progress
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preProduction = series?.preProduction?.[episodeNumber];
  const preStatus = preProduction?.status;

  useEffect(() => {
    if (!seriesId) return;
    if (preStatus && IN_PROGRESS_STATUSES.has(preStatus)) {
      pollRef.current = setInterval(() => {
        void fetchSeriesDetail(seriesId);
      }, POLL_INTERVAL_MS);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [seriesId, preStatus, fetchSeriesDetail]);

  const handleRerunPass = useCallback(async (pass: "a" | "b" | "c" | "d") => {
    setActionError(null);
    setRerunningPass(pass);
    try {
      await rerunEpisodePass(seriesId, episodeNumber, pass);
      // Poll will pick up changes; trigger one immediate refresh
      await fetchSeriesDetail(seriesId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to rerun pass ${pass.toUpperCase()}.`);
    } finally {
      setRerunningPass(null);
    }
  }, [seriesId, episodeNumber, rerunEpisodePass, fetchSeriesDetail]);

  const handlePrepare = useCallback(async () => {
    setActionError(null);
    setIsPreparing(true);
    try {
      await prepareEpisode(seriesId, episodeNumber);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start pre-production.");
    } finally {
      setIsPreparing(false);
    }
  }, [seriesId, episodeNumber, prepareEpisode]);

  const handleProduce = useCallback(async () => {
    setActionError(null);
    setIsProducing(true);
    try {
      const result = await produceEpisode(seriesId, episodeNumber);
      if (result?.jobId) {
        router.push(`/video/${result.jobId}`);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to produce episode.");
    } finally {
      setIsProducing(false);
    }
  }, [seriesId, episodeNumber, produceEpisode, router]);

  // Derived
  const roadmapEntry = series?.episodeRoadmap?.find((e) => e.episodeNumber === episodeNumber);
  const episodeTitle = roadmapEntry?.title ?? `Episode ${episodeNumber}`;
  const isInProgress = preStatus && IN_PROGRESS_STATUSES.has(preStatus);
  const isComplete = preStatus === "complete";
  const isFailed = preStatus === "failed";
  const canProduce = isComplete && (overrideGate || (preProduction?.qualityGateResult?.passed ?? false));

  if (!series) {
    return (
      <div className="flex h-full items-center justify-center" aria-busy="true">
        <div className="animate-pulse rounded border border-border bg-bg-elevated p-8 text-sm text-text-muted">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg-surface/95 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/series/${seriesId}`)}
              className="shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Series
            </Button>
            <Film className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="font-mono text-[10px] shrink-0 text-text-muted">EP {episodeNumber}</span>
            <span className="truncate text-sm font-semibold text-text-primary">{episodeTitle}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {preStatus && <PreProductionStatusBadge status={preStatus} />}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-6">

          {/* Error banner */}
          {actionError && (
            <div
              className="flex items-start gap-2 rounded border border-status-error/35 bg-status-error/10 px-3 py-2 text-xs text-status-error"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {actionError}
            </div>
          )}

          {/* Pre-production failure error */}
          {isFailed && preProduction?.error && (
            <div
              className="flex items-start gap-2 rounded border border-status-error/35 bg-status-error/10 px-3 py-2 text-xs text-status-error"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {preProduction.errorCode && (
                  <span className="mr-1 font-mono text-[10px]">{preProduction.errorCode}</span>
                )}
                Pre-production failed: {preProduction.error}
              </span>
            </div>
          )}

          {/* Pass status row — visible whenever preProduction exists */}
          {preProduction?.passStatus && (
            <PassStatusRow
              passStatus={preProduction.passStatus}
              rerunningPass={rerunningPass}
              onRerun={handleRerunPass}
            />
          )}

          {/* No pre-production yet */}
          {!preStatus && (
            <div className="flex flex-col items-center gap-4 rounded border border-dashed border-border py-12">
              <p className="text-sm text-text-muted">
                Pre-production has not been started for this episode.
              </p>
              <button
                type="button"
                onClick={handlePrepare}
                disabled={isPreparing}
                className={cn(
                  "flex items-center gap-2 rounded border border-border-accent bg-[var(--color-accent-dim)] px-4 py-2",
                  "text-sm font-medium text-accent hover:border-accent hover:bg-accent/20",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                  "disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
                )}
              >
                {isPreparing
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Play className="h-4 w-4" aria-hidden="true" />
                }
                Prepare Episode {episodeNumber}
              </button>
            </div>
          )}

          {/* In-progress skeleton */}
          {isInProgress && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Pre-production running — polling every 4 s…
              </p>
              {[1, 2, 3].map((n) => (
                <div key={n} className="animate-pulse rounded border border-border bg-bg-surface p-4">
                  <div className="mb-2 h-4 w-1/3 rounded bg-bg-input" />
                  <div className="space-y-1.5">
                    <div className="h-3 w-full rounded bg-bg-input" />
                    <div className="h-3 w-4/5 rounded bg-bg-input" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Complete — full pre-production output */}
          {isComplete && preProduction && (
            <div className="space-y-6">
              {/* Episode Script */}
              <section aria-labelledby="script-heading">
                <h2 id="script-heading" className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Episode Script
                </h2>
                {preProduction.script && <EpisodeScriptPanel script={preProduction.script} />}
              </section>

              {/* Virality Score */}
              {preProduction.viralityScore && (
                <section aria-labelledby="virality-heading">
                  <h2 id="virality-heading" className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Signal estimate — not measured
                  </h2>
                  <EpisodeViralityPanel score={preProduction.viralityScore} />
                </section>
              )}

              {/* Quality Gate */}
              {preProduction.qualityGateResult && (
                <section aria-labelledby="gate-heading">
                  <h2 id="gate-heading" className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Quality Gate
                  </h2>
                  <QualityGatePanel result={preProduction.qualityGateResult} />
                </section>
              )}

              {/* Continuity Report */}
              {preProduction.continuityReport && (
                <section aria-labelledby="continuity-heading">
                  <h2 id="continuity-heading" className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Continuity Report
                  </h2>
                  <ContinuityReportPanel report={preProduction.continuityReport} />
                </section>
              )}

              {/* Scene Prompts */}
              {preProduction.scenePrompts && preProduction.scenePrompts.length > 0 && (
                <section aria-labelledby="prompts-heading">
                  <h2 id="prompts-heading" className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    AI Prompt Suites
                  </h2>
                  <ScenePromptViewer scenes={preProduction.scenePrompts} />
                </section>
              )}

              {/* Cinematic Directions */}
              {preProduction.scenePrompts && preProduction.scenePrompts.length > 0 && (
                <section aria-labelledby="cinematics-heading">
                  <h2 id="cinematics-heading" className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Cinematic Directions
                  </h2>
                  <CinematicDirectionsPanel
                    scenes={preProduction.scenePrompts}
                    {...(series.worldGuide !== undefined ? { worldGuide: series.worldGuide } : {})}
                  />
                </section>
              )}

              {/* Audio Plan */}
              {preProduction.audioPlan && (
                <section aria-labelledby="audio-heading">
                  <h2 id="audio-heading" className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Audio Plan
                  </h2>
                  <AudioPlanPanel plan={preProduction.audioPlan} />
                </section>
              )}

              {/* Platform Assets */}
              {preProduction.platformAssets && preProduction.platformAssets.length > 0 && (
                <section aria-labelledby="assets-heading">
                  <h2 id="assets-heading" className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Platform Publishing Assets
                  </h2>
                  <div className="rounded border border-border bg-bg-surface overflow-hidden">
                    <PlatformAssetsPanel
                      assets={preProduction.platformAssets}
                      primaryPlatform={series.brief.platformPrimary}
                    />
                  </div>
                </section>
              )}

              {/* Produce section */}
              <section
                className="rounded border border-border bg-bg-surface p-4"
                aria-label="Produce episode"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {canProduce
                        ? "Ready to produce"
                        : preProduction.qualityGateResult?.passed === false
                          ? "Quality gate has failures"
                          : "Produce episode"}
                    </p>
                    {!preProduction.qualityGateResult?.passed && (
                      <p className="mt-0.5 text-xs text-text-muted">
                        Resolve the quality gate issues above, or override to produce anyway.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {!preProduction.qualityGateResult?.passed && (
                      <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={overrideGate}
                          onChange={(e) => setOverrideGate(e.target.checked)}
                          className="accent-accent"
                          aria-label="Override quality gate and produce anyway"
                        />
                        Override gate
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={handleProduce}
                      disabled={isProducing || !canProduce}
                      className={cn(
                        "flex items-center gap-2 rounded border border-border-accent bg-[var(--color-accent-dim)] px-4 py-2",
                        "text-sm font-medium text-accent hover:border-accent hover:bg-accent/20",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                        "disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
                      )}
                      aria-label={`Produce episode ${episodeNumber}`}
                    >
                      {isProducing
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <Play className="h-4 w-4" aria-hidden="true" />
                      }
                      Produce
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* Failed — retry option */}
          {isFailed && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handlePrepare}
                disabled={isPreparing}
                className={cn(
                  "flex items-center gap-2 rounded border border-border px-4 py-2",
                  "text-sm text-text-secondary hover:text-text-primary hover:border-border-accent",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                  "disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
                )}
              >
                {isPreparing
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Play className="h-4 w-4" aria-hidden="true" />
                }
                Retry Pre-production
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
