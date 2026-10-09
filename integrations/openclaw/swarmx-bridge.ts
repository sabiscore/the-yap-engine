/**
 * integrations/openclaw/swarmx-bridge.ts
 * Bounded OpenClaw Dispatch Bridge for SwarmXQ / The Yap Engine.
 *
 * Implements the bounded dispatch contract:
 *  - create_video_job
 *  - get_video_job
 *  - wait_for_video_job
 *  - get_artifact_manifest
 *  - cancel_video_job
 *
 * OpenClaw acts as an outer human-facing control plane and bounded worker.
 * SwarmXQ remains authoritative for model lifecycle, execution gating,
 * SINGLE-7B lock, and video orchestration.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { VideoJob, VideoJobRequest, VideoArtifacts } from "@swarmx/types/video-types";

export interface BridgeOptions {
  apiUrl?: string;
  apiToken?: string;
  fetchFn?: typeof fetch;
}

export interface WaitForJobOptions extends BridgeOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  onProgress?: (job: VideoJob) => void;
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
  manifestData?: Record<string, unknown> | null;
}

function resolveApiUrl(options?: BridgeOptions): string {
  const url = options?.apiUrl ?? process.env["SWARMX_API_URL"] ?? "http://127.0.0.1:3001";
  return url.replace(/\/+$/, "");
}

function resolveHeaders(options?: BridgeOptions): Record<string, string> {
  const token = options?.apiToken ?? process.env["SWARMX_VIDEO_API_TOKEN"];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["x-video-api-key"] = token;
  }
  return headers;
}

/**
 * Submit a video job to the SwarmXQ API.
 */
export async function create_video_job(
  request: VideoJobRequest,
  options?: BridgeOptions,
): Promise<CreateJobResult> {
  const baseUrl = resolveApiUrl(options);
  const _fetch = options?.fetchFn ?? fetch;
  const res = await _fetch(`${baseUrl}/api/video/jobs`, {
    method: "POST",
    headers: resolveHeaders(options),
    body: JSON.stringify(request),
  });

  const body = (await res.json()) as any;
  if (!res.ok) {
    const errorMsg = body?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(`create_video_job failed (${res.status}): ${errorMsg}`);
  }

  return body as CreateJobResult;
}

/**
 * Retrieve status and metadata for a specific video job.
 */
export async function get_video_job(
  jobId: string,
  options?: BridgeOptions,
): Promise<VideoJob> {
  const baseUrl = resolveApiUrl(options);
  const _fetch = options?.fetchFn ?? fetch;
  const res = await _fetch(`${baseUrl}/api/video/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: resolveHeaders(options),
  });

  const body = (await res.json()) as any;
  if (!res.ok) {
    const errorMsg = body?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(`get_video_job failed (${res.status}): ${errorMsg}`);
  }

  return body as VideoJob;
}

/**
 * Poll a video job until it reaches a terminal status or times out.
 */
export async function wait_for_video_job(
  jobId: string,
  options?: WaitForJobOptions,
): Promise<VideoJob> {
  const timeoutMs = options?.timeoutMs ?? 300_000; // 5 minutes default
  const pollIntervalMs = options?.pollIntervalMs ?? 2_000; // 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const job = await get_video_job(jobId, options);
    options?.onProgress?.(job);

    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`wait_for_video_job timed out after ${timeoutMs}ms for job ${jobId}`);
}

/**
 * Retrieve the artifact manifest and output paths for a video job.
 */
export async function get_artifact_manifest(
  jobId: string,
  options?: BridgeOptions,
): Promise<ArtifactManifestResult> {
  const job = await get_video_job(jobId, options);
  let manifestData: Record<string, unknown> | null = null;

  if (job.outputArtifacts?.manifestPath && existsSync(job.outputArtifacts.manifestPath)) {
    try {
      const raw = await readFile(job.outputArtifacts.manifestPath, "utf-8");
      manifestData = JSON.parse(raw);
    } catch {
      // Manifest unreadable or invalid JSON; retain null
    }
  }

  return {
    jobId: job.id,
    status: job.status,
    outputArtifacts: job.outputArtifacts,
    manifestData,
  };
}

/**
 * Cancel an active or queued video job.
 */
export async function cancel_video_job(
  jobId: string,
  options?: BridgeOptions,
): Promise<CancelJobResult> {
  const baseUrl = resolveApiUrl(options);
  const _fetch = options?.fetchFn ?? fetch;
  const res = await _fetch(`${baseUrl}/api/video/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    headers: resolveHeaders(options),
  });

  const body = (await res.json()) as any;
  if (!res.ok) {
    const errorMsg = body?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(`cancel_video_job failed (${res.status}): ${errorMsg}`);
  }

  return body as CancelJobResult;
}

// ── CLI Runner ───────────────────────────────────────────────────────────────

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(`
SwarmXQ Bounded Dispatch Bridge (OpenClaw)
Usage:
  npx tsx integrations/openclaw/swarmx-bridge.ts <command> [args]

Commands:
  create-job <prompt_or_json>     Submit a video job
  get-job <job_id>                Get job details
  wait-job <job_id> [timeoutSec]  Wait for job completion
  get-manifest <job_id>           Get job artifacts and manifest
  cancel-job <job_id>             Cancel a video job
\n`);
    return;
  }

  try {
    switch (command) {
      case "create-job": {
        const input = args[1];
        if (!input) throw new Error("Missing job prompt or JSON definition");
        let req: VideoJobRequest;
        if (input.trim().startsWith("{")) {
          req = JSON.parse(input);
        } else {
          req = {
            prompt: input,
            platform: "tiktok",
            tone: "urgent",
          };
        }
        const result = await create_video_job(req);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        break;
      }
      case "get-job": {
        const jobId = args[1];
        if (!jobId) throw new Error("Missing job ID");
        const job = await get_video_job(jobId);
        process.stdout.write(JSON.stringify(job, null, 2) + "\n");
        break;
      }
      case "wait-job": {
        const jobId = args[1];
        if (!jobId) throw new Error("Missing job ID");
        const timeoutSec = args[2] ? parseInt(args[2], 10) : 300;
        const job = await wait_for_video_job(jobId, {
          timeoutMs: timeoutSec * 1000,
          onProgress: (j) => {
            process.stderr.write(`[wait-job] status: ${j.status}, stage: ${j.currentStage || "none"} (${j.overallProgress || 0}%)\n`);
          },
        });
        process.stdout.write(JSON.stringify(job, null, 2) + "\n");
        break;
      }
      case "get-manifest": {
        const jobId = args[1];
        if (!jobId) throw new Error("Missing job ID");
        const manifest = await get_artifact_manifest(jobId);
        process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
        break;
      }
      case "cancel-job": {
        const jobId = args[1];
        if (!jobId) throw new Error("Missing job ID");
        const res = await cancel_video_job(jobId);
        process.stdout.write(JSON.stringify(res, null, 2) + "\n");
        break;
      }
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (err: any) {
    process.stderr.write(`Error: ${err?.message || String(err)}\n`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("swarmx-bridge.ts")) {
  void runCli();
}
