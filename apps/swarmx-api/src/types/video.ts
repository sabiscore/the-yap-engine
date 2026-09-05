/**
 * apps/swarmx-api/src/types/video.ts
 * SwarmXQ Video Subsystem — Shared Domain Types
 * Phase 1: Canonical contracts for queue, routes, orchestrator, and dashboard.
 */

import type {
  CertificationTier,
  MediaQualityReport,
  VideoHealthEventData,
  VideoJobEventData,
  VideoJob as CanonicalVideoJob,
  VideoExportPlatform,
  VideoJobStatus as CanonicalVideoJobStatus,
  VideoArtifacts,
  RendererCapabilityTier,
  OperatorTraceEntry,
  ViralitySignal,
  VideoError,
  PublishResult,
  VideoTone,
  VoiceProfileId,
  VoiceStoryMode,
  VoiceArtifact,
  ScriptQualityWarning,
} from "@swarmx/types/video-types";
import type { SeriesEpisodeContext } from "@swarmx/types/series-types";

// ─── Job Lifecycle ────────────────────────────────────────────────────────────

export type VideoJobStatus = CanonicalVideoJobStatus | "running" | "completed";

export type VideoJobStage =
  | "intent_classification"
  | "planning"
  | "scripting"
  | "storyboard_generation"
  | "render_assembly"
  | "finalizing";

export const VIDEO_JOB_STAGE_ORDER: VideoJobStage[] = [
  "intent_classification",
  "planning",
  "scripting",
  "storyboard_generation",
  "render_assembly",
  "finalizing",
];

export const VIDEO_JOB_STAGE_LABELS: Record<VideoJobStage, string> = {
  intent_classification: "Intent Classification",
  planning: "Planning",
  scripting: "Scripting",
  storyboard_generation: "Storyboard Generation",
  render_assembly: "Render & Assembly",
  finalizing: "Finalizing",
};

// ─── Request / Response ───────────────────────────────────────────────────────

export interface VideoJobRequest {
  /** Plain-language description of the video to generate. */
  prompt: string;
  /** Target platform influencing style, aspect ratio, and length. */
  platform?: VideoExportPlatform | "youtube_shorts";
  /** Niche category — informs scripting model routing. */
  niche?: "motivational" | "finance" | "facts" | "true_crime" | "tech" | "other";
  /**
   * Structural template family. Canonical field per ADR-3 (Yap Engine
   * completion directive v4): this branch's 8-value taxonomy is the
   * surviving set, extended with `pov-immersion` and `reddit-story` ported
   * in from the `swarmxq-main` 4-value `template` field. `myth-vs-fact`
   * already overlapped exactly; `listicle-countdown` was dropped as a
   * duplicate of the existing `list/countdown` value rather than ported
   * verbatim. The `template` field name itself was not adopted — this
   * branch's orchestrator, presets, and dashboard already integrate against
   * `templateFamily`, so extending it was the lower-risk reconciliation.
   */
  templateFamily?: "myth-vs-fact" | "list/countdown" | "mystery/reveal" | "product-demo" | "quote-to-insight" | "chart/data" | "motivational" | "series-recap" | "pov-immersion" | "reddit-story";
  /** Preferred output duration in seconds. Clamped to 15–180 by orchestrator. */
  targetDurationSeconds?: number;
  /** Model tier override — defaults to auto-routing via complexity score. */
  modelTier?: "fast" | "worker" | "supervisor" | "reasoner";
  /** Intended audience, used to shape script and caption guidance. */
  audience?: string;
  /** Creative tone for script and caption generation (8 variants). */
  tone?: VideoTone;
  /** Visual/story format guidance for local and ComfyUI render plans. */
  style?: "faceless_broll" | "kinetic_text" | "storytime" | "tutorial" | "myth_busting";
  /** Caption placement and density preference. */
  captionStyle?: "bold_center" | "lower_third" | "minimal";
  /** Voice style hint for local TTS/render metadata. */
  voice?: "default" | "calm" | "energetic" | "narrator";
  /** Optional pinned Kokoro profile for recurring creators (backward compatible). */
  voiceProfileId?: VoiceProfileId;
  /** Optional narration mode for future multi-speaker story styles. */
  storyMode?: VoiceStoryMode;
  /** Client-supplied idempotency key. */
  clientRequestId?: string;
  // ── Series Engine fields (populated by series planner when producing an episode) ──
  seriesId?: string;
  episodeNumber?: number;
  totalEpisodes?: number;
  seriesContext?: SeriesEpisodeContext;
}

export interface VideoJobResponse {
  jobId: string;
  status: VideoJobStatus;
  createdAt: string; // ISO 8601
  estimatedDurationMs?: number;
  message?: string;
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export interface VideoStageProgress {
  stage: VideoJobStage;
  /** 0–100 fractional progress within this stage. */
  stageProgress: number;
  /** Overall job progress 0–100. */
  overallProgress: number;
  message?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

// ─── Output Metadata ──────────────────────────────────────────────────────────

export interface VideoOutputMetadata {
  /** Relative path under SWARMX_VIDEO_EXPORT_DIR. */
  relativePath: string;
  /** Absolute path on-disk — API-internal only. */
  absolutePath: string;
  /** Public URL served by the API. */
  publicUrl: string;
  fileSizeBytes: number;
  durationSeconds: number;
  widthPx: number;
  heightPx: number;
  fps: number;
  format: "mp4" | "webm";
  /** SHA-256 of the output file. */
  checksum: string;
  generatedAt: string; // ISO 8601
  /** Script text used during scripting stage. */
  scriptText?: string;
  /** List of storyboard frame descriptions. */
  storyboardFrames?: string[];
  /** Ollama model tags actually used per stage. */
  modelsUsed: Partial<Record<VideoJobStage, string>>;
  /** V3 renderer tier used to create this artifact. */
  rendererTier?: RendererCapabilityTier;
  /** V3 certification level after deterministic package checks. */
  certificationTier?: CertificationTier;
  /** Human-readable reasons why the job did not reach PRODUCTION_PACK_VALID. */
  certificationBlockers?: string[];
  /** Voice/provider lineage for the narration artifact. */
  voiceArtifact?: VoiceArtifact;
  /** Deterministic media QC report generated during render/finalize. */
  mediaQualityReport?: MediaQualityReport;
  /** Directory containing transcript, captions, manifest, QC, rights, and platform package files. */
  productionPackageDir?: string;
  renderManifestPath?: string;
  transcriptPath?: string;
  srtPath?: string;
  vttPath?: string;
  rightsManifestPath?: string;
  platformPackagePath?: string;
  thumbnailPath?: string;
  alignedAssPath?: string;
  alignedSrtPath?: string;
  alignedVttPath?: string;
  wordTimingPath?: string;
}

// ─── Full Job Record ──────────────────────────────────────────────────────────

export interface VideoJob {
  id: string;
  status: VideoJobStatus;
  request: VideoJobRequest;
  stages: Partial<Record<VideoJobStage, VideoStageProgress>>;
  currentStage?: VideoJobStage;
  /** Overall progress 0–100. */
  overallProgress: number;
  output?: VideoOutputMetadata;
  error?: VideoJobError;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  /** Retry count against the same job id (v1: 0 or 1). */
  retryCount: number;
  /** Effective retry ceiling applied by the queue for this job. */
  maxRetries?: number;
  /** Next scheduled automatic retry attempt timestamp (ISO), if pending. */
  nextRetryAt?: string;
  /** Delay (ms) until next automatic retry, if pending. */
  nextRetryDelayMs?: number;
  resumeFromStage?: VideoJobStage;
  /** Pressure tier at job start. */
  pressureTierAtStart?: "normal" | "high" | "critical";
  clientRequestId?: string;

  // VIDEO-ALPHA compatibility bridge fields (gradually becoming canonical).
  operatorTrace?: OperatorTraceEntry[];
  viralitySignal?: ViralitySignal;
  outputArtifacts?: VideoArtifacts;
  publishHistory?: PublishResult[];
  errorLog?: VideoError[];
  scriptQualityWarnings?: ScriptQualityWarning[];
  stageValidationTrace?: StageValidationEntry[];
  /** 0–1 hook quality score set immediately after scripting completes.
   *  Cleared and replaced by viralitySignal.hookStrength post-pipeline. */
  preliminaryHookScore?: number;
}

// Re-export for downstream consumers of the API bridge.
export type { ScriptQualityWarning };

export interface StageValidationEntry {
  schemaVersion: 1;
  stage: VideoJobStage;
  passed: boolean;
  issues?: string[];
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export interface VideoJobError {
  code: VideoErrorCode;
  message: string;
  stage?: VideoJobStage;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export type VideoErrorCode =
  | "PRESSURE_CRITICAL"
  | "TIMEOUT"
  | "OLLAMA_UNAVAILABLE"
  | "COMFY_UNAVAILABLE"
  | "COMFY_OUTPUT_DIR_MISSING"
  | "COMFY_OUTPUT_PATH_TRAVERSAL"
  | "COMFY_PROTOCOL_ERROR"
  | "SCRIPTING_FAILED"
  | "STORYBOARD_FAILED"
  | "RENDER_FAILED"
  | "RENDER_BACKEND_INVALID"
  | "MODAL_RENDER_REQUEST_FAILED"
  | "MODAL_RENDER_UNAVAILABLE"
  | "WORD_ALIGNMENT_UNAVAILABLE"
  | "WORD_ALIGNMENT_FAILED"
  | "ASSET_WRITE_FAILED"
  | "ARTIFACT_PATH_TRAVERSAL"
  | "ARTIFACT_MISSING"
  | "ARTIFACT_EMPTY"
  | "ARTIFACT_INVALID"
  | "STUB_RENDER_DISABLED"
  | "FFMPEG_UNAVAILABLE"
  | "FFPROBE_UNAVAILABLE"
  | "ESPEAK_UNAVAILABLE"
  | "VOICE_PROVIDER_UNAVAILABLE"
  | "FONT_UNAVAILABLE"
  | "FRAME_BUDGET_EXCEEDED"
  | "comfyui_ram_budget_exceeded"
  | "INTENT_VALIDATION_FAILED"
  | "SCRIPT_SCHEMA_INVALID"
  | "CANCELLED_BY_USER"
  | "UNKNOWN";

// ─── List / Filter ────────────────────────────────────────────────────────────

export interface VideoJobListQuery {
  status?: VideoJobStatus;
  platform?: VideoJobRequest["platform"];
  limit?: number;
  offset?: number;
}

export interface VideoJobListResponse {
  jobs: VideoJob[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export interface VideoJobCancelResponse {
  jobId: string;
  cancelled: boolean;
  previousStatus: VideoJobStatus;
  message: string;
}

// Canonical export alias for bridge migration.
export type VideoJobCanonical = CanonicalVideoJob;
export type { VideoJobEventData, VideoHealthEventData };

// ─── Utility ──────────────────────────────────────────────────────────────────

export function isTerminalStatus(status: VideoJobStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function stageIndex(stage: VideoJobStage): number {
  return VIDEO_JOB_STAGE_ORDER.indexOf(stage);
}

/**
 * Compute overall progress (0–100) from individual stage progresses.
 * Each stage is weighted equally; completed stages count as 100%.
 */
export function computeOverallProgress(
  stages: Partial<Record<VideoJobStage, VideoStageProgress>>
): number {
  const total = VIDEO_JOB_STAGE_ORDER.length;
  let sum = 0;
  for (const stage of VIDEO_JOB_STAGE_ORDER) {
    const sp = stages[stage];
    if (sp) {
      sum += sp.stageProgress;
    }
  }
  return Math.round(sum / total);
}
