"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Clapperboard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisclosureModeBadge } from "@/components/ui/disclosure-mode-badge";
import { useVideoStore } from "../../../../stores/video";
import { useUIStore } from "@/stores/ui";
import { VideoJobTimeline } from "../../../../components/video/VideoJobTimeline";
import { ViralityMeter } from "../../../../components/video/ViralityMeter";
import { CaptionEditor } from "../../../../components/video/CaptionEditor";
import { PlatformPublishPanel } from "../../../../components/video/PlatformPublishPanel";
import { VideoPipelinePulse } from "@/components/video/VideoPipelinePulse";
import type { VideoExportPlatform } from "@swarmx/types/video-types";
import { errorCodeHint, errorCodeNextAction, getVideoPublishPlatform } from "../../../../lib/video-dashboard";
import VideoJobDetailLoading from "./loading";

type ScriptSectionKey = "HOOK" | "BODY" | "RESOLUTION" | "CTA";

const SCRIPT_SECTION_STYLES: Record<ScriptSectionKey, { label: string; className: string; accent: string }> = {
  HOOK: {
    label: "Hook",
    className: "border-l-2 border-status-warning/60 bg-status-warning/8",
    accent: "text-status-warning",
  },
  BODY: {
    label: "Body",
    className: "border-l-2 border-accent/60 bg-accent/8",
    accent: "text-accent",
  },
  RESOLUTION: {
    label: "Resolution",
    className: "border-l-2 border-status-success/60 bg-status-success/8",
    accent: "text-status-success",
  },
  CTA: {
    label: "CTA",
    className: "border-l-2 border-status-throttled/60 bg-status-throttled/8",
    accent: "text-status-throttled",
  },
};

/**
 * Parse [HOOK]/[BODY]/[RESOLUTION]/[CTA] markers from raw script text.
 * Returns null when no markers are present so the caller can fall back to
 * showing the raw script — the pipeline always emits markers, but this
 * keeps the UI safe for historical or partial outputs.
 */
function parseScriptSections(text: string): Array<{ key: ScriptSectionKey; content: string }> | null {
  const pattern = /\[(HOOK|BODY|RESOLUTION|CTA)\]/g;
  const matches: Array<{ key: ScriptSectionKey; index: number; endOfTag: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    matches.push({ key: match[1] as ScriptSectionKey, index: match.index, endOfTag: match.index + match[0].length });
  }
  if (matches.length === 0) return null;

  return matches.map((m, i) => {
    const end = i + 1 < matches.length ? matches[i + 1]!.index : text.length;
    return { key: m.key, content: text.slice(m.endOfTag, end).trim() };
  });
}

function ScriptSectionView({ text }: { text: string }) {
  const sections = useMemo(() => parseScriptSections(text), [text]);

  if (!sections) {
    return (
      <p className="mt-1 whitespace-pre-wrap rounded border border-border bg-bg-surface p-3 text-xs leading-5 text-text-secondary">
        {text}
      </p>
    );
  }

  return (
    <div className="mt-1 space-y-2">
      {sections.map((section, index) => {
        const style = SCRIPT_SECTION_STYLES[section.key];
        return (
          <div
            key={`${section.key}-${index}`}
            className={`rounded-r border border-border/60 ${style.className} px-3 py-2`}
          >
            <p className={`text-[10px] font-mono uppercase tracking-wider ${style.accent}`}>
              {style.label}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-text-secondary">
              {section.content}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function VideoJobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";

  // Scalar selectors: React 19's useSyncExternalStore calls getSnapshot multiple times per pass; object literals always differ → tearing → #185.
  const job = useVideoStore((s) => s.jobs.get(id));
  const fetchJobDetail = useVideoStore((s) => s.fetchJobDetail);
  const selectJob = useVideoStore((s) => s.selectJob);
  const publishJob = useVideoStore((s) => s.publishJob);
  const recordJobSseStream = useVideoStore((s) => s.recordJobSseStream);
  const retryFromStage = useVideoStore((s) => s.retryFromStage);
  const operatorViewMode = useUIStore((s) => s.operatorViewMode);

  useEffect(() => {
    if (!id) return;
    selectJob(id);
    void fetchJobDetail(id);
    const teardown = recordJobSseStream(id);
    return () => {
      teardown?.();
    };
  }, [id, selectJob, fetchJobDetail, recordJobSseStream]);

  const publishHistory = useMemo(
    () => job?.publishHistory ?? job?.outputArtifacts?.publishHistory ?? [],
    [job],
  );

  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryInProgress, setRetryInProgress] = useState(false);

  if (!job) {
    return (
      <main
        aria-busy="true"
        aria-label="Loading video job details"
        className="h-full min-h-0"
      >
        <VideoJobDetailLoading />
      </main>
    );
  }

  const selectedPlatform: VideoExportPlatform = getVideoPublishPlatform(job);

  return (
    <main className="h-full min-h-0 flex flex-col" aria-label="Video job details">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg-surface/95 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.push("/video")}
            className="shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Queue
          </Button>
          <span className="truncate font-mono text-xs text-text-muted">Video / {job.id.slice(0, 8)}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[minmax(320px,55%)_minmax(280px,45%)]">
        <section className="space-y-4">
          <div className="rounded border border-border bg-bg-elevated p-3">
            {job.output?.publicUrl ? (
              <div className="mx-auto aspect-[9/16] max-h-[70vh] w-full max-w-[420px] overflow-hidden rounded bg-black">
                <video
                  src={job.output.publicUrl}
                  controls
                  aria-label={`Generated video: ${job.request.prompt.slice(0, 60)}`}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="mx-auto flex aspect-[9/16] max-h-[70vh] w-full max-w-[420px] items-center justify-center rounded border border-border bg-bg-surface text-sm text-text-muted">
                <div className="space-y-2 text-center">
                  <Clapperboard className="mx-auto h-7 w-7 text-text-muted" aria-hidden="true" />
                  <p>Generating preview</p>
                </div>
              </div>
            )}
          </div>

          {!job.output && <VideoPipelinePulse job={job} />}

          <div className="rounded border border-border bg-bg-elevated p-4">
            <p className="text-[10px] text-text-muted font-mono uppercase tracking-wider">Metadata</p>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-text-secondary sm:grid-cols-2">
              <div><span className="text-text-muted">ID:</span> {job.id.slice(0, 12)}...</div>
              <div><span className="text-text-muted">Mode:</span> {job.request.modelTier ?? "auto"}</div>
              <div><span className="text-text-muted">Tone:</span> {job.request.tone ?? "educational"}</div>
              <div><span className="text-text-muted">Style:</span> {(job.request.style ?? "faceless_broll").replace(/_/g, " ")}</div>
              <div><span className="text-text-muted">Captions:</span> {(job.request.captionStyle ?? "bold_center").replace(/_/g, " ")}</div>
              <div><span className="text-text-muted">Voice:</span> {job.request.voice ?? "default"}</div>
              {job.request.audience && (
                <div className="sm:col-span-2"><span className="text-text-muted">Audience:</span> {job.request.audience}</div>
              )}
              <div><span className="text-text-muted">Resolution:</span> {job.output ? `${job.output.widthPx}x${job.output.heightPx}` : "pending"}</div>
              <div><span className="text-text-muted">Created:</span> {new Date(job.createdAt).toLocaleString()}</div>
              {job.output && (
                <>
                  <div><span className="text-text-muted">Size:</span> {(job.output.fileSizeBytes / 1024 / 1024).toFixed(1)} MB</div>
                  <div><span className="text-text-muted">Duration:</span> {job.output.durationSeconds.toFixed(1)}s</div>
                  <div><span className="text-text-muted">Renderer:</span> {(job.output.rendererTier ?? "ffmpeg_text_smoke").replace(/_/g, " ")}</div>
                  <div><span className="text-text-muted">Certification:</span> {(job.output.certificationTier ?? "TECHNICALLY_VALID").replace(/_/g, " ")}</div>
                </>
              )}
            </div>
          </div>

          {job.output && (
            <div className="rounded border border-border bg-bg-elevated p-4" role="status" aria-live="polite">
              <p className="text-[10px] text-text-muted font-mono uppercase tracking-wider">Production Package</p>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-text-secondary sm:grid-cols-2">
                <div>
                  <span className="text-text-muted">Voice provider:</span>{" "}
                  {job.output.voiceArtifact?.providerId ?? "pending"}
                </div>
                <div>
                  <span className="text-text-muted">Voice tier:</span>{" "}
                  {job.output.voiceArtifact?.qualityTier?.replace(/_/g, " ") ?? "pending"}
                </div>
                <div>
                  <span className="text-text-muted">Template QC:</span>{" "}
                  {job.output.mediaQualityReport?.certificationTier?.replace(/_/g, " ") ?? "pending"}
                </div>
                <div>
                  <span className="text-text-muted">Rights:</span>{" "}
                  {job.output.rightsManifestPath ? "manifest available" : "pending"}
                </div>
                <div className="sm:col-span-2">
                  <span className="text-text-muted">Package:</span>{" "}
                  <span className="break-all">{job.output.productionPackageDir ?? "pending"}</span>
                </div>
              </div>
              {job.output.mediaQualityReport?.interpretedFindings?.length ? (
                <ul className="mt-3 space-y-1 text-xs text-text-secondary" aria-label="Template-aware quality findings">
                  {job.output.mediaQualityReport.interpretedFindings.slice(0, 3).map((finding, index) => (
                    <li key={`${finding.detector}-${index}`} className="rounded border border-border bg-bg-surface px-2 py-1">
                      <span className="font-medium text-text-primary">
                        {finding.detector.replace(/_/g, " ")} {finding.interpretedStatus}
                      </span>
                      <span className="text-text-muted"> · {finding.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          {(job.output?.scriptText || job.output?.storyboardFrames?.length) && (
            <div className="rounded border border-border bg-bg-elevated p-4">
              <p className="text-[10px] text-text-muted font-mono uppercase tracking-wider">Creative Review</p>
              {job.output.scriptText && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-text-secondary">Script</p>
                  <ScriptSectionView text={job.output.scriptText} />
                </div>
              )}
              {job.output.storyboardFrames && job.output.storyboardFrames.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-text-secondary">Storyboard</p>
                  <ol className="mt-1 space-y-1 rounded border border-border bg-bg-surface p-3 text-xs leading-5 text-text-secondary">
                    {job.output.storyboardFrames.map((frame, index) => (
                      <li key={`${frame}-${index}`} className="flex gap-2">
                        <span className="font-mono text-text-muted">{index + 1}.</span>
                        <span>{frame}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          <div className="rounded border border-border bg-bg-elevated p-4">
            <VideoJobTimeline job={job} />
          </div>

          {job.operatorTrace && job.operatorTrace.length > 0 && (
            <div className="rounded border border-border bg-bg-elevated p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] text-text-muted font-mono uppercase tracking-wider">Operator Trace</p>
                <DisclosureModeBadge />
              </div>
              {operatorViewMode !== "operator" ? (
                <p className="text-xs text-text-muted">
                  Hidden in client view. Switch to operator view (⌘⇧O) to see model routing, latency, and token usage.
                </p>
              ) : (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">Operator trace for job {job.id.slice(0, 8)}</caption>
                  <thead>
                    <tr className="text-text-muted">
                      <th className="text-left py-1">Stage</th>
                      <th className="text-left py-1">Operator</th>
                      <th className="text-left py-1">Latency</th>
                      <th className="text-left py-1">Tokens</th>
                      <th className="text-left py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.operatorTrace.map((entry, idx) => (
                      <tr key={`${entry.stage}-${idx}`} className="border-t border-border/60">
                        <td className="py-1 text-text-secondary">{String(entry.stage)}</td>
                        <td className="py-1 text-text-secondary">{entry.operator}</td>
                        <td className="py-1 text-text-muted">{entry.latencyMs ?? 0}ms</td>
                        <td className="py-1 text-text-muted">{entry.tokenCount ?? 0}</td>
                        <td className={entry.success === false ? "py-1 text-red-400" : "py-1 text-emerald-400"}>
                          {entry.success === false ? "failed" : "ok"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-4">
          {job.status === "failed" && (
            <div
              className="rounded border border-status-error/35 bg-status-error/10 p-4"
              role="alert"
              aria-label="Render failed"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-status-error"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-status-error">Render Failed</p>
                  {job.error && (
                    <>
                      <p className="mt-1 font-mono text-xs text-status-error">{job.error.code}</p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {errorCodeHint(job.error.code)}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        Next action: {errorCodeNextAction(job.error.code)}
                      </p>
                    </>
                  )}
                  {retryError && (
                    <p className="mt-2 text-xs text-status-error" role="alert">{retryError}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.error?.retryable && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={retryInProgress}
                        onClick={async () => {
                          setRetryError(null);
                          setRetryInProgress(true);
                          const stage = job.error?.stage ?? job.currentStage ?? "scripting";
                          const ok = await retryFromStage(job.id, stage);
                          if (!ok) {
                            setRetryError(
                              "Resume failed — use Resubmit to create a new job with the same settings."
                            );
                          }
                          setRetryInProgress(false);
                        }}
                        aria-label="Retry job from the failed stage"
                      >
                        <RefreshCw
                          className={`mr-1.5 h-3.5 w-3.5 ${retryInProgress ? "animate-spin" : ""}`}
                          aria-hidden="true"
                        />
                        {retryInProgress ? "Retrying…" : "Retry from Stage"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => router.push("/video")}
                      aria-label="Go back to queue and resubmit"
                    >
                      Resubmit
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {job.viralitySignal && (
            <div className="rounded border border-border bg-bg-elevated p-4">
              <ViralityMeter signal={job.viralitySignal} />
            </div>
          )}

          {job.status === "completed" && !job.viralitySignal && (
            <div
              className="rounded border border-border bg-bg-elevated p-4"
              role="status"
              aria-live="polite"
            >
              <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
                Virality Score
              </p>
              <p className="text-xs text-text-secondary">
                Virality scoring unavailable in low-RAM mode.
              </p>
              <p className="mt-1 text-xs text-text-muted">
                The Oracle model (DeepSeek-R1) requires more RAM than is available on this
                host profile. No score was computed — this is expected on CPU-only 16 GB
                hosts. A score will appear once a full-RAM profile is active.
              </p>
            </div>
          )}

          {job.viralitySignal?.captionDraft && (
            <div className="rounded border border-border bg-bg-elevated p-4">
              <CaptionEditor
                jobId={job.id}
                initialDraft={job.viralitySignal.captionDraft}
                platform={selectedPlatform}
              />
            </div>
          )}

          {job.status === "completed" && (
            <div className="rounded border border-border bg-bg-elevated p-4">
              <PlatformPublishPanel
                job={job}
                publishHistory={publishHistory}
                onPublish={async (platform, scheduledAt) => {
                  const result = await publishJob(job.id, {
                    platform,
                    ...(scheduledAt ? { scheduledAt } : {}),
                  });
                  await fetchJobDetail(job.id);
                  return result;
                }}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
