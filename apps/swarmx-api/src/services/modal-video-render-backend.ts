import type { VideoJobRequest } from "../types/video.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnv, readSecretEnv } from "../lib/env.js";
import type {
  RenderBackend,
  RenderBackendCapabilities,
  RenderSegmentArtifact,
  RenderSegmentTask,
} from "./video-render-backend.js";

interface ModalSubmitResponse {
  call_id: string;
}

interface ModalResultResponse {
  status: "pending" | "completed" | "failed";
  artifacts?: RenderSegmentArtifact[];
  error?: string;
}

function modalUrl(): string {
  const value = loadEnv().SWARMX_MODAL_RENDER_URL?.trim();
  if (!value) throw Object.assign(new Error("SWARMX_MODAL_RENDER_URL is not configured"), { code: "MODAL_RENDER_UNAVAILABLE" });
  return value.replace(/\/+$/, "");
}

function modalToken(): string | undefined {
  const token = readSecretEnv("SWARMX_MODAL_RENDER_TOKEN");
  return token || undefined;
}

async function requestBytes(url: string, init: RequestInit, signal?: AbortSignal): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const headers = new Headers(init.headers);
    const token = modalToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    if (!response.ok) {
      throw Object.assign(new Error(`Modal file fetch failed: ${response.status}`), { code: "MODAL_RENDER_REQUEST_FAILED" });
    }
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function requestJson<T>(url: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    const token = modalToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    const text = await response.text();
    let payload: unknown = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: text.slice(0, 500) };
    }
    if (!response.ok) {
      const reason = typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error?: unknown }).error ?? response.status)
        : String(response.status);
      throw Object.assign(new Error(`Modal renderer request failed: ${reason}`), {
        code: "MODAL_RENDER_REQUEST_FAILED",
        status: response.status,
      });
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

function buildTasks(request: VideoJobRequest, tasks: RenderSegmentTask[]): RenderSegmentTask[] {
  void request;
  return tasks.map((task) => ({
    ...task,
    durationSeconds: Math.max(1, Math.min(12, task.durationSeconds)),
    fps: Math.max(8, Math.min(30, task.fps)),
    width: Math.max(256, Math.min(1920, task.width)),
    height: Math.max(256, Math.min(1920, task.height)),
  }));
}

function validateArtifacts(tasks: RenderSegmentTask[], artifacts: RenderSegmentArtifact[]): RenderSegmentArtifact[] {
  if (artifacts.length !== tasks.length) {
    throw Object.assign(new Error(`Modal returned ${artifacts.length} artifacts for ${tasks.length} tasks`), { code: "RENDER_FAILED" });
  }
  const expected = new Set(tasks.map((task) => task.segmentId));
  const seen = new Set<string>();
  for (const artifact of artifacts) {
    if (!expected.has(artifact.segmentId) || seen.has(artifact.segmentId)) {
      throw Object.assign(new Error(`Modal returned an invalid or duplicate segment: ${artifact.segmentId}`), { code: "RENDER_FAILED" });
    }
    seen.add(artifact.segmentId);
  }
  return tasks.map((task) => artifacts.find((artifact) => artifact.segmentId === task.segmentId)!);
}

export class ModalVideoRenderBackend implements RenderBackend {
  readonly capabilities: RenderBackendCapabilities = {
    tier: "modal_wan22_l4",
    remote: true,
    supportsSegmentFanout: true,
    maxConcurrentSegments: 4,
    supportedAspectRatios: ["9:16", "1:1", "16:9"],
  };

  async isAvailable(signal?: AbortSignal): Promise<boolean> {
    try {
      const response = await requestJson<{ ok?: boolean }>(`${modalUrl()}/health`, { method: "GET" }, signal);
      return response.ok !== false;
    } catch {
      return false;
    }
  }

  async renderSegments(request: VideoJobRequest, tasks: RenderSegmentTask[], signal?: AbortSignal): Promise<RenderSegmentArtifact[]> {
    if (tasks.length === 0) return [];
    if (tasks.length > this.capabilities.maxConcurrentSegments * 2) {
      throw Object.assign(new Error(`Modal segment batch exceeds the per-job safety ceiling (${this.capabilities.maxConcurrentSegments * 2})`), { code: "RENDER_BACKEND_INVALID" });
    }

    const normalizedTasks = buildTasks(request, tasks);
    const payload = await requestJson<ModalSubmitResponse>(
      `${modalUrl()}/v1/render`,
      {
        method: "POST",
        body: JSON.stringify({
          request,
          tasks: normalizedTasks,
          dispatch: {
            mode: "function.map",
            maxConcurrent: this.capabilities.maxConcurrentSegments,
            minContainers: 0,
          },
        }),
      },
      signal,
    );
    if (!payload.call_id) throw Object.assign(new Error("Modal renderer returned no call_id"), { code: "MODAL_RENDER_REQUEST_FAILED" });

    const deadline = Date.now() + 15 * 60_000;
    let delayMs = 1_000;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const result = await requestJson<ModalResultResponse>(
        `${modalUrl()}/v1/render/${encodeURIComponent(payload.call_id)}`,
        { method: "GET" },
        signal,
      );
      if (result.status === "completed") {
        const artifacts = validateArtifacts(normalizedTasks, result.artifacts ?? []);
        const jobId = normalizedTasks[0]!.jobId;
        const tempRoot = join(loadEnv().SWARMX_VIDEO_TEMP_DIR, "modal", jobId);
        await mkdir(tempRoot, { recursive: true });
        const localArtifacts: RenderSegmentArtifact[] = [];
        for (const artifact of artifacts) {
          const bytes = await requestBytes(
            `${modalUrl()}/v1/render/file/${encodeURIComponent(jobId)}/${encodeURIComponent(artifact.segmentId)}`,
            { method: "GET" }, signal,
          );
          const localPath = join(tempRoot, `${artifact.segmentId}.mp4`);
          await writeFile(localPath, bytes);
          localArtifacts.push({ ...artifact, path: localPath });
        }
        return localArtifacts;
      }
      if (result.status === "failed") {
        throw Object.assign(new Error(result.error ?? "Modal render failed"), { code: "RENDER_FAILED" });
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(5_000, Math.round(delayMs * 1.5));
    }
    throw Object.assign(new Error("Modal render polling timed out"), { code: "TIMEOUT" });
  }

  async cancel(_jobId: string): Promise<void> {
    // Modal FunctionCall cancellation is provider-specific; the API job remains authoritative.
  }
}
