/**
 * integrations/openclaw/swarmx-bridge.ts
 * Bounded OpenClaw dispatch boundary for SwarmXQ / The Yap Engine.
 * OpenClaw is a control plane only. SwarmXQ owns validation, queue/worker
 * lifecycle, model admission, orchestration, artifact persistence and QC.
 */
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { VideoJobRequest, VideoArtifacts } from "@swarmx/types/video-types";
import { normalizeVideoTemplateFamily, VIDEO_TEMPLATE_FAMILY_VALUES } from "@swarmx/types/video-types";
import { loadEnv, readSecretEnv } from "../../apps/swarmx-api/src/lib/env.js";

const DEFAULT_HTTP_TIMEOUT_MS = 10_000;
const MAX_HTTP_TIMEOUT_MS = 30_000;
const MIN_HTTP_TIMEOUT_MS = 250;
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_WAIT_TIMEOUT_MS = 300_000;
const MAX_WAIT_TIMEOUT_MS = 900_000;
const MIN_POLL_INTERVAL_MS = 500;
const MAX_POLL_INTERVAL_MS = 10_000;
const MAX_JOB_ID_LENGTH = 128;
const MAX_MANIFEST_BYTES = 512 * 1024;
const MAX_CLI_INPUT_BYTES = 10 * 1024;

export interface BridgeOptions {
  /** Test seam and trusted in-process override; must match the validated configured origin. */
  apiUrl?: string;
  /** Test seam. Production CLI reads only the documented secret environment key. */
  apiToken?: string;
  fetchFn?: typeof fetch;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
}

export interface BridgeJobSnapshot {
  id: string;
  status: string;
  currentStage?: string;
  overallProgress?: number;
  createdAt?: string;
  updatedAt?: string;
  error?: { code?: string; message?: string };
  outputArtifacts?: VideoArtifacts;
  artifactEvidence?: Record<string, unknown>;
}

export interface WaitForJobOptions extends BridgeOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  onProgress?: (job: BridgeJobSnapshot) => void;
}

export interface CreateJobResult {
  jobId: string;
  status: string;
  createdAt: string;
  message: string;
}

export interface CancelJobResult {
  jobId: string;
  cancelled: boolean;
  previousStatus?: string;
}

export interface ArtifactManifestResult {
  jobId: string;
  status: string;
  outputArtifacts?: VideoArtifacts;
  artifactEvidence?: Record<string, unknown>;
  manifestData?: Record<string, unknown> | null;
  manifestWarning?: "manifest_not_found" | "manifest_too_large" | "manifest_invalid";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < min || resolved > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return resolved;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function parseBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("SwarmX API URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SwarmX API URL must use HTTP or HTTPS");
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("SwarmX API URL must be an origin only; credentials, paths, queries and fragments are forbidden");
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new Error("Plain HTTP is permitted only for loopback SwarmX API hosts");
  }
  return url;
}

function resolveApiUrl(options?: BridgeOptions): string {
  const configured = parseBaseUrl(loadEnv().SWARMX_API_URL);
  const selected = parseBaseUrl(options?.apiUrl ?? configured.origin);
  if (selected.origin !== configured.origin) {
    throw new Error("SwarmX API URL override does not match the validated configured API origin");
  }
  return configured.origin;
}

function resolveHeaders(options: BridgeOptions | undefined, requireWriteAuth = false): Record<string, string> {
  const token = options?.apiToken?.trim() || readSecretEnv("SWARMX_VIDEO_API_TOKEN");
  if (requireWriteAuth && !token) {
    throw new Error("SWARMX_VIDEO_API_TOKEN is required for OpenClaw video write actions");
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["x-video-api-key"] = token;
  }
  return headers;
}

function requestTimeout(options?: BridgeOptions): number {
  return boundedInteger(options?.requestTimeoutMs, DEFAULT_HTTP_TIMEOUT_MS, MIN_HTTP_TIMEOUT_MS, MAX_HTTP_TIMEOUT_MS, "requestTimeoutMs");
}

function responseLimit(options?: BridgeOptions): number {
  return boundedInteger(options?.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES, 1024, MAX_RESPONSE_BYTES, "maxResponseBytes");
}

async function readJsonLimited(response: Response, maxBytes: number): Promise<unknown> {
  const contentLength = response.headers?.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    throw new Error(`SwarmX API response exceeds the ${maxBytes}-byte limit`);
  }

  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error(`SwarmX API response exceeds the ${maxBytes}-byte limit`);
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error("SwarmX API returned invalid JSON");
    }
  }

  // Lightweight mock compatibility for unit tests. Node's actual Fetch Response
  // uses the bounded streaming branch above.
  if (typeof response.text === "function") {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error(`SwarmX API response exceeds the ${maxBytes}-byte limit`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error("SwarmX API returned invalid JSON");
    }
  }
  if (typeof response.json === "function") {
    const value: unknown = await response.json();
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxBytes) {
      throw new Error(`SwarmX API response exceeds the ${maxBytes}-byte limit`);
    }
    return value;
  }
  throw new Error("SwarmX API response body is unavailable");
}

async function requestJson(path: string, init: RequestInit, options?: BridgeOptions, requireWriteAuth = false): Promise<unknown> {
  const baseUrl = resolveApiUrl(options);
  const timeoutMs = requestTimeout(options);
  const maxBytes = responseLimit(options);
  const fetchFn = options?.fetchFn ?? fetch;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const operation = async (): Promise<unknown> => {
    const response = await fetchFn(`${baseUrl}${path}`, {
      ...init,
      headers: resolveHeaders(options, requireWriteAuth),
      signal: controller.signal,
      redirect: "error",
    });
    const body = await readJsonLimited(response, maxBytes);
    if (!response.ok) {
      const code = isRecord(body) && typeof body.error === "string" && /^[a-z0-9_-]{1,80}$/i.test(body.error)
        ? body.error
        : undefined;
      // Do not echo arbitrary provider/server text into the LLM context: error
      // bodies can include user content, paths, or accidentally echoed secrets.
      throw new Error(`SwarmX API request failed (${response.status})${code ? ` [${code}]` : ""}`);
    }
    return body;
  };

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`SwarmX API request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const TEMPLATE_FAMILIES: readonly string[] = VIDEO_TEMPLATE_FAMILY_VALUES;
const PLATFORMS = ["tiktok", "youtube_shorts", "reels", "generic"] as const;
const NICHES = ["motivational", "finance", "facts", "true_crime", "tech", "other"] as const;
const MODEL_TIERS = ["fast", "worker", "supervisor", "reasoner"] as const;
const TONES = ["educational", "urgent", "warm", "contrarian", "cinematic", "minimal", "faceless_broll", "kinetic_text"] as const;
const STYLES = ["faceless_broll", "kinetic_text", "storytime", "tutorial", "myth_busting"] as const;
const CAPTION_STYLES = ["bold_center", "lower_third", "minimal"] as const;
const VOICES = ["default", "calm", "energetic", "narrator"] as const;
const VOICE_PROFILES = ["auto", "kokoro_warm", "kokoro_narrator", "kokoro_energetic", "kokoro_contrarian", "kokoro_storytime_dual"] as const;
const STORY_MODES = ["single_narrator", "dialogue_storytime"] as const;
const ALLOWED_REQUEST_KEYS = new Set([
  "prompt", "platform", "niche", "templateFamily", "template", "targetDurationSeconds",
  "modelTier", "audience", "tone", "style", "captionStyle", "voice", "voiceProfileId",
  "storyMode", "clientRequestId",
]);

function assertEnum(value: unknown, allowed: readonly string[], key: string): void {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`Invalid video request field: ${key}`);
}

function canonicalJson(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

/** Runtime validation mirrors the creator-facing API boundary and rejects extra fields. */
export function validateVideoJobRequest(input: unknown): VideoJobRequest {
  if (!isRecord(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new Error("Video job request must be a JSON object");
  }
  const unexpected = Object.keys(input).filter((key) => !ALLOWED_REQUEST_KEYS.has(key));
  if (unexpected.length > 0) throw new Error(`Unsupported video request field: ${unexpected[0]}`);

  const prompt = input.prompt;
  if (typeof prompt !== "string" || prompt.trim().length === 0 || prompt.length > 2000) {
    throw new Error("prompt must contain 1–2000 characters");
  }
  const result: Record<string, unknown> = { prompt };
  if (input.platform !== undefined) { assertEnum(input.platform, PLATFORMS, "platform"); result.platform = input.platform; }
  if (input.niche !== undefined) { assertEnum(input.niche, NICHES, "niche"); result.niche = input.niche; }
  if (input.templateFamily !== undefined || input.template !== undefined) {
    if (input.templateFamily !== undefined && input.template !== undefined && input.templateFamily !== input.template) {
      throw new Error("template and templateFamily cannot conflict");
    }
    const template = input.templateFamily ?? input.template;
    if (typeof template !== "string" || (!TEMPLATE_FAMILIES.includes(template) && template !== "listicle-countdown")) {
      throw new Error("Invalid video request field: templateFamily");
    }
    result.templateFamily = normalizeVideoTemplateFamily(template);
  }
  if (input.targetDurationSeconds !== undefined) {
    if (typeof input.targetDurationSeconds !== "number" || !Number.isFinite(input.targetDurationSeconds) || input.targetDurationSeconds < 15 || input.targetDurationSeconds > 180) {
      throw new Error("targetDurationSeconds must be between 15 and 180");
    }
    result.targetDurationSeconds = input.targetDurationSeconds;
  }
  if (input.modelTier !== undefined) { assertEnum(input.modelTier, MODEL_TIERS, "modelTier"); result.modelTier = input.modelTier; }
  if (input.audience !== undefined) {
    if (typeof input.audience !== "string" || input.audience.trim().length === 0 || input.audience.length > 160) throw new Error("audience must contain 1–160 characters");
    result.audience = input.audience;
  }
  if (input.tone !== undefined) { assertEnum(input.tone, TONES, "tone"); result.tone = input.tone; }
  if (input.style !== undefined) { assertEnum(input.style, STYLES, "style"); result.style = input.style; }
  if (input.captionStyle !== undefined) { assertEnum(input.captionStyle, CAPTION_STYLES, "captionStyle"); result.captionStyle = input.captionStyle; }
  if (input.voice !== undefined) { assertEnum(input.voice, VOICES, "voice"); result.voice = input.voice; }
  if (input.voiceProfileId !== undefined) { assertEnum(input.voiceProfileId, VOICE_PROFILES, "voiceProfileId"); result.voiceProfileId = input.voiceProfileId; }
  if (input.storyMode !== undefined) { assertEnum(input.storyMode, STORY_MODES, "storyMode"); result.storyMode = input.storyMode; }
  if (input.clientRequestId !== undefined) {
    if (typeof input.clientRequestId !== "string" || input.clientRequestId.trim().length === 0 || input.clientRequestId.length > 128) {
      throw new Error("clientRequestId must contain 1–128 characters");
    }
    result.clientRequestId = input.clientRequestId;
  } else {
    result.clientRequestId = `openclaw-${createHash("sha256").update(canonicalJson(result)).digest("hex").slice(0, 48)}`;
  }
  return result as unknown as VideoJobRequest;
}

function stringField(record: Record<string, unknown>, key: string, maxLength = 2048): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value.slice(0, maxLength) : undefined;
}

const ARTIFACT_PATH_KEYS = [
  "manifestPath", "outputPath", "outputPublicUrl", "thumbnailPath", "firstFramePath",
  "frameDirectory", "interpolatedFrameDirectory", "captionPath", "metadataPath",
] as const;

function projectArtifacts(value: unknown): VideoArtifacts | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, unknown> = {};
  for (const key of ARTIFACT_PATH_KEYS) {
    const field = stringField(value, key);
    if (field) result[key] = field;
  }
  if (isRecord(value.exportPathByPlatform)) {
    const platforms: Record<string, string> = {};
    for (const platform of ["tiktok", "reels", "shorts", "generic"]) {
      const field = value.exportPathByPlatform[platform];
      if (typeof field === "string" && field.length <= 2048) platforms[platform] = field;
    }
    if (Object.keys(platforms).length) result.exportPathByPlatform = platforms;
  }
  return Object.keys(result).length ? result as unknown as VideoArtifacts : undefined;
}

function projectArtifactEvidence(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, unknown> = {};
  const scalarFields = [
    "checksum", "fileSizeBytes", "durationSeconds", "widthPx", "heightPx", "fps",
    "format", "generatedAt", "rendererTier", "certificationTier", "renderManifestPath",
    "transcriptPath", "srtPath", "vttPath", "rightsManifestPath", "platformPackagePath",
    "thumbnailPath", "voiceLineagePath", "templateLineagePath", "qualityReportPath",
  ];
  for (const key of scalarFields) {
    const field = value[key];
    if (typeof field === "string" && field.length <= 2048) result[key] = field;
    else if (typeof field === "number" && Number.isFinite(field)) result[key] = field;
  }
  if (isRecord(value.voiceArtifact)) {
    const voice: Record<string, unknown> = {};
    for (const key of ["providerId", "voiceId", "voiceProfileId", "qualityTier", "durationSeconds", "sha256", "licenseState"]) {
      const field = value.voiceArtifact[key];
      if ((typeof field === "string" && field.length <= 256) || (typeof field === "number" && Number.isFinite(field))) voice[key] = field;
    }
    if (Object.keys(voice).length) result.voiceArtifact = voice;
  }
  if (isRecord(value.mediaQualityReport)) {
    const report: Record<string, unknown> = {};
    for (const key of ["schemaVersion", "passed", "certificationTier", "rendererTier", "timestamp"]) {
      const field = value.mediaQualityReport[key];
      if (typeof field === "string" || typeof field === "boolean") report[key] = field;
    }
    if (Object.keys(report).length) result.mediaQualityReport = report;
  }
  return Object.keys(result).length ? result : undefined;
}

function projectJob(value: unknown): BridgeJobSnapshot {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || typeof value.status !== "string") {
    throw new Error("SwarmX API returned an invalid video job record");
  }
  const result: BridgeJobSnapshot = { id: value.id.slice(0, MAX_JOB_ID_LENGTH), status: value.status.slice(0, 64) };
  const currentStage = stringField(value, "currentStage", 128);
  const createdAt = stringField(value, "createdAt", 64);
  const updatedAt = stringField(value, "updatedAt", 64);
  const progress = value.overallProgress;
  if (currentStage) result.currentStage = currentStage;
  if (createdAt) result.createdAt = createdAt;
  if (updatedAt) result.updatedAt = updatedAt;
  if (typeof progress === "number" && Number.isFinite(progress) && progress >= 0 && progress <= 100) result.overallProgress = progress;
  if (isRecord(value.error)) {
    result.error = {
      ...(typeof value.error.code === "string" ? { code: value.error.code.slice(0, 128) } : {}),
      ...(typeof value.error.message === "string" ? { message: value.error.message.slice(0, 500) } : {}),
    };
  }
  result.outputArtifacts = projectArtifacts(value.outputArtifacts);
  result.artifactEvidence = projectArtifactEvidence(value.outputArtifacts);
  return result;
}

export async function create_video_job(request: VideoJobRequest, options?: BridgeOptions): Promise<CreateJobResult> {
  const validated = validateVideoJobRequest(request);
  const body = await requestJson("/api/video/jobs", { method: "POST", body: JSON.stringify(validated) }, options, true);
  if (!isRecord(body) || typeof body.jobId !== "string" || typeof body.status !== "string" ||
      typeof body.createdAt !== "string" || typeof body.message !== "string") {
    throw new Error("SwarmX API returned an invalid create-job response");
  }
  return {
    jobId: body.jobId.slice(0, MAX_JOB_ID_LENGTH),
    status: body.status.slice(0, 64),
    createdAt: body.createdAt.slice(0, 64),
    message: body.message.slice(0, 300),
  };
}

export async function get_video_job(jobId: string, options?: BridgeOptions): Promise<BridgeJobSnapshot> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) throw new Error("Invalid video job ID");
  const body = await requestJson(`/api/video/jobs/${encodeURIComponent(jobId)}`, { method: "GET" }, options);
  return projectJob(body);
}

function isTerminalStatus(status: string): boolean {
  return ["completed", "done", "failed", "cancelled"].includes(status);
}

export async function wait_for_video_job(jobId: string, options?: WaitForJobOptions): Promise<BridgeJobSnapshot> {
  const timeoutMs = boundedInteger(options?.timeoutMs, DEFAULT_WAIT_TIMEOUT_MS, 1_000, MAX_WAIT_TIMEOUT_MS, "timeoutMs");
  const pollIntervalMs = boundedInteger(options?.pollIntervalMs, 2_000, MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS, "pollIntervalMs");
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const remainingMs = timeoutMs - (Date.now() - startTime);
    if (remainingMs < MIN_HTTP_TIMEOUT_MS) break;
    const job = await get_video_job(jobId, {
      ...options,
      requestTimeoutMs: Math.max(MIN_HTTP_TIMEOUT_MS, Math.min(options?.requestTimeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS, remainingMs)),
    });
    options?.onProgress?.(job);
    if (isTerminalStatus(job.status)) return job;
    const sleepMs = Math.min(pollIntervalMs, timeoutMs - (Date.now() - startTime));
    if (sleepMs > 0) await new Promise((resolveSleep) => setTimeout(resolveSleep, sleepMs));
  }
  throw new Error(`wait_for_video_job timed out after ${timeoutMs}ms for job ${jobId}`);
}

function isWithinRoot(candidate: string, root: string): boolean {
  const rel = relative(root, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function readManifestFromConfiguredRoot(pathValue: string): Promise<{ data?: Record<string, unknown>; warning?: ArtifactManifestResult["manifestWarning"] }> {
  const env = loadEnv();
  const candidate = resolve(pathValue);
  const roots = [resolve(env.SWARMX_VIDEO_ARTIFACT_DIR), resolve(env.SWARMX_VIDEO_EXPORT_DIR)];
  const root = roots.find((item) => isWithinRoot(candidate, item));
  if (!root) throw new Error("Artifact manifest path is outside configured artifact/export roots");
  try {
    const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
    if (!isWithinRoot(realCandidate, realRoot)) throw new Error("Artifact manifest path escapes configured root after symlink resolution");
    const info = await stat(realCandidate);
    if (!info.isFile()) throw new Error("Artifact manifest is not a regular file");
    if (info.size > MAX_MANIFEST_BYTES) return { warning: "manifest_too_large" };
    const raw = await readFile(realCandidate, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { warning: "manifest_invalid" };
    }
    if (!isRecord(parsed)) return { warning: "manifest_invalid" };
    const safe = sanitizeManifestValue(parsed, 0);
    if (!isRecord(safe)) return { warning: "manifest_invalid" };
    if (Buffer.byteLength(JSON.stringify(safe), "utf8") > 32 * 1024) return { warning: "manifest_too_large" };
    return { data: safe };
  } catch (error) {
    if (error instanceof Error && /outside configured|escapes configured|not a regular file/.test(error.message)) throw error;
    return { warning: "manifest_not_found" };
  }
}

function sanitizeManifestValue(value: unknown, depth: number): unknown {
  if (depth > 5) return undefined;
  if (typeof value === "string") return value.slice(0, 512);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeManifestValue(item, depth + 1)).filter((item) => item !== undefined);
  if (!isRecord(value)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 60)) {
    if (/prompt|scripttext|transcript|rawmedia|base64|token|authorization|privatekey|audio_bytes|image_bytes/i.test(key)) continue;
    const projected = sanitizeManifestValue(item, depth + 1);
    if (projected !== undefined) result[key.slice(0, 128)] = projected;
  }
  return result;
}

export async function get_artifact_manifest(jobId: string, options?: BridgeOptions): Promise<ArtifactManifestResult> {
  const job = await get_video_job(jobId, options);
  const result: ArtifactManifestResult = {
    jobId: job.id,
    status: job.status,
    ...(job.outputArtifacts ? { outputArtifacts: job.outputArtifacts } : {}),
    ...(job.artifactEvidence ? { artifactEvidence: job.artifactEvidence } : {}),
    manifestData: null,
  };
  const pathValue = job.outputArtifacts?.manifestPath;
  if (!pathValue) {
    result.manifestWarning = "manifest_not_found";
    return result;
  }
  const manifest = await readManifestFromConfiguredRoot(pathValue);
  if (manifest.data) result.manifestData = manifest.data;
  if (manifest.warning) result.manifestWarning = manifest.warning;
  return result;
}

export async function cancel_video_job(jobId: string, options?: BridgeOptions): Promise<CancelJobResult> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) throw new Error("Invalid video job ID");
  const body = await requestJson(`/api/video/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" }, options, true);
  if (!isRecord(body) || typeof body.jobId !== "string" || typeof body.cancelled !== "boolean") {
    throw new Error("SwarmX API returned an invalid cancel-job response");
  }
  return {
    jobId: body.jobId.slice(0, MAX_JOB_ID_LENGTH),
    cancelled: body.cancelled,
    ...(typeof body.previousStatus === "string" ? { previousStatus: body.previousStatus.slice(0, 64) } : {}),
  };
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(`
SwarmXQ Bounded Dispatch Bridge (OpenClaw)
Usage:
  pnpm --filter @swarmx/api exec tsx ../../integrations/openclaw/swarmx-bridge.ts <command> [args]

Commands:
  create-job <prompt_or_json>     Submit a validated video job
  get-job <job_id>                Get bounded job status
  wait-job <job_id> [timeoutSec]  Wait up to 900 seconds for terminal status
  get-manifest <job_id>           Get bounded artifact and QC evidence
  cancel-job <job_id>             Cancel a video job
\n`);
    return;
  }
  try {
    switch (command) {
      case "create-job": {
        const input = args[1];
        if (!input) throw new Error("Missing job prompt or JSON definition");
        if (Buffer.byteLength(input, "utf8") > MAX_CLI_INPUT_BYTES) throw new Error("CLI request exceeds the 10 KiB limit");
        let raw: unknown;
        if (input.trim().startsWith("{")) raw = JSON.parse(input) as unknown;
        else raw = { prompt: input, platform: "tiktok", tone: "urgent" };
        const request = validateVideoJobRequest(raw);
        process.stdout.write(JSON.stringify(await create_video_job(request), null, 2) + "\n");
        break;
      }
      case "get-job": {
        const jobId = args[1];
        if (!jobId) throw new Error("Missing job ID");
        process.stdout.write(JSON.stringify(await get_video_job(jobId), null, 2) + "\n");
        break;
      }
      case "wait-job": {
        const jobId = args[1];
        if (!jobId) throw new Error("Missing job ID");
        const timeoutSec = args[2] === undefined ? 300 : Number(args[2]);
        if (!Number.isInteger(timeoutSec) || timeoutSec < 1 || timeoutSec > MAX_WAIT_TIMEOUT_MS / 1000) {
          throw new Error("timeoutSec must be an integer from 1 to 900");
        }
        const job = await wait_for_video_job(jobId, {
          timeoutMs: timeoutSec * 1000,
          onProgress: (item) => {
            const stage = item.currentStage ?? "unknown";
            const progress = item.overallProgress === undefined ? "" : ` (${item.overallProgress}%)`;
            process.stderr.write(`[wait-job] status: ${item.status}, stage: ${stage}${progress}\n`);
          },
        });
        process.stdout.write(JSON.stringify(job, null, 2) + "\n");
        break;
      }
      case "get-manifest": {
        const jobId = args[1];
        if (!jobId) throw new Error("Missing job ID");
        process.stdout.write(JSON.stringify(await get_artifact_manifest(jobId), null, 2) + "\n");
        break;
      }
      case "cancel-job": {
        const jobId = args[1];
        if (!jobId) throw new Error("Missing job ID");
        process.stdout.write(JSON.stringify(await cancel_video_job(jobId), null, 2) + "\n");
        break;
      }
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected bridge failure";
    process.stderr.write(`Error: ${message.slice(0, 500)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("swarmx-bridge.ts")) void runCli();
