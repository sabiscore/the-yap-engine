import { open, stat } from "node:fs/promises";

const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;
const DEFAULT_POLL_ATTEMPTS = 12;
const DEFAULT_POLL_DELAY_MS = 5_000;
const MIN_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_CHUNK_SIZE = 64 * 1024 * 1024;

interface TikTokApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
}

interface CreatorInfo {
  privacy_level_options?: string[];
  max_video_post_duration_sec?: number;
}

interface PublishInit {
  publish_id?: string;
  upload_url?: string;
}

interface PublishStatusResponse {
  status?: string;
  fail_reason?: string;
  public_url?: string;
}

export type TikTokDirectPostStatus = "published" | "failed" | "pending_review";

export interface TikTokDirectPostOutcome {
  publishId: string;
  status: TikTokDirectPostStatus;
  platformUrl?: string;
  failureReason?: string;
}

export interface TikTokDirectPostInput {
  token: string;
  prompt: string;
  outputPath: string;
  outputPublicUrl?: string;
  durationSeconds?: number;
  privacyLevel?: string;
  requireSelfOnly?: boolean;
  pollAttempts?: number;
  pollDelayMs?: number;
}

async function readJson<T>(response: Response): Promise<TikTokApiEnvelope<T>> {
  return (await response.json().catch(() => ({}))) as TikTokApiEnvelope<T>;
}

export interface TikTokChunkRange {
  start: number;
  end: number;
}

/**
 * TikTok requires total_chunk_count to be floor(video_size / chunk_size).
 * Any trailing bytes are folded into the final chunk (up to TikTok's 128 MB
 * final-chunk allowance). Files below 5 MB are uploaded as one whole chunk.
 */
export function buildTikTokChunkPlan(fileSize: number, preferredChunkSize = DEFAULT_CHUNK_SIZE): {
  chunkSize: number;
  totalChunkCount: number;
  ranges: TikTokChunkRange[];
} {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
    throw new Error("TikTok chunk planning requires a positive safe-integer file size");
  }
  const chunkSize = Math.min(MAX_CHUNK_SIZE, Math.max(MIN_CHUNK_SIZE, preferredChunkSize));
  const totalChunkCount = fileSize < MIN_CHUNK_SIZE ? 1 : Math.max(1, Math.floor(fileSize / chunkSize));
  const ranges: TikTokChunkRange[] = [];
  let start = 0;
  for (let index = 0; index < totalChunkCount; index += 1) {
    const isFinal = index === totalChunkCount - 1;
    const endExclusive = isFinal ? fileSize : Math.min(fileSize, start + chunkSize);
    ranges.push({ start, end: endExclusive - 1 });
    start = endExclusive;
  }
  return { chunkSize: totalChunkCount === 1 ? fileSize : chunkSize, totalChunkCount, ranges };
}

function apiError(prefix: string, response: Response, payload: TikTokApiEnvelope<unknown>): Error {
  const code = payload.error?.code ?? "unknown";
  const message = payload.error?.message ? ` — ${payload.error.message}` : "";
  const error = new Error(`${prefix} (${response.status}): ${code}${message}`);
  if (response.status === 429) error.name = "TikTokRateLimited";
  return error;
}

async function queryCreatorInfo(token: string): Promise<CreatorInfo> {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  const payload = await readJson<CreatorInfo>(response);
  if (!response.ok || payload.error?.code !== "ok") {
    throw apiError("TikTok creator info failed", response, payload);
  }
  return payload.data ?? {};
}

function resolvePrivacyLevel(
  options: string[],
  requested: string | undefined,
  requireSelfOnly: boolean,
): string {
  if (requireSelfOnly) {
    if (!options.includes("SELF_ONLY")) {
      throw new Error("TikTok controlled verification requires SELF_ONLY privacy support");
    }
    return "SELF_ONLY";
  }

  if (requested && options.includes(requested)) return requested;
  if (options.includes("SELF_ONLY")) return "SELF_ONLY";
  return options[0] ?? "SELF_ONLY";
}

async function initializeDirectPost(
  token: string,
  input: TikTokDirectPostInput,
  creator: CreatorInfo,
  privacyLevel: string,
): Promise<PublishInit> {
  const fileStat = await stat(input.outputPath);
  if (!fileStat.isFile() || fileStat.size <= 0) {
    throw new Error("TikTok Direct Post requires a non-empty media file");
  }

  if (
    creator.max_video_post_duration_sec !== undefined &&
    input.durationSeconds !== undefined &&
    input.durationSeconds > creator.max_video_post_duration_sec
  ) {
    throw new Error(
      `TikTok creator account accepts at most ${creator.max_video_post_duration_sec}s; artifact is ${input.durationSeconds}s`,
    );
  }

  const chunkPlan = buildTikTokChunkPlan(fileStat.size);
  const { chunkSize, totalChunkCount } = chunkPlan;
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: input.prompt.slice(0, 2200),
        privacy_level: privacyLevel,
        is_aigc: true,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: fileStat.size,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    }),
  });

  const payload = await readJson<PublishInit>(response);
  if (!response.ok || payload.error?.code !== "ok") {
    throw apiError("TikTok publish init failed", response, payload);
  }
  return payload.data ?? {};
}

async function uploadFileInChunks(uploadUrl: string, outputPath: string): Promise<void> {
  const file = await open(outputPath, "r");
  try {
    const fileStat = await file.stat();
    const chunkPlan = buildTikTokChunkPlan(fileStat.size);

    for (const range of chunkPlan.ranges) {
      const offset = range.start;
      const length = range.end - range.start + 1;
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await file.read(buffer, 0, length, offset);
      if (bytesRead !== length) {
        throw new Error(`TikTok upload read mismatch at byte ${offset}`);
      }

      const end = offset + bytesRead - 1;
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(bytesRead),
          "Content-Range": `bytes ${offset}-${end}/${fileStat.size}`,
        },
        body: buffer,
      });

      if (!response.ok) {
        const payload = await readJson<unknown>(response);
        throw apiError("TikTok media upload failed", response, payload);
      }

    }
  } finally {
    await file.close();
  }
}

async function fetchPublishStatus(token: string, publishId: string): Promise<{
  status: TikTokDirectPostStatus | "processing";
  platformUrl?: string;
  failureReason?: string;
}> {
  const response = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });

  const payload = await readJson<PublishStatusResponse>(response);
  if (!response.ok || payload.error?.code !== "ok") {
    throw apiError("TikTok publish status failed", response, payload);
  }

  const status = (payload.data?.status ?? "").toUpperCase();
  if (["PUBLISH_COMPLETE", "PUBLISHED", "SUCCESS"].includes(status)) {
    return payload.data?.public_url
      ? { status: "published", platformUrl: payload.data.public_url }
      : { status: "published" };
  }
  if (["FAILED", "PUBLISH_FAILED", "ERROR"].includes(status)) {
    return {
      status: "failed",
      failureReason: payload.data?.fail_reason ?? "TikTok publish failed",
    };
  }
  return { status: "processing" };
}

/**
 * Exact Direct Post sequence:
 * creator_info/query -> video/init -> PUT upload_url -> status/fetch POST.
 * No retry of /video/init on 429: BullMQ account lanes enforce the documented
 * six-init-requests/minute quota, and the publisher must never brute-force it.
 */
export async function executeTikTokDirectPostWithAccessToken(
  input: TikTokDirectPostInput,
): Promise<TikTokDirectPostOutcome> {
  if (!input.token) throw new Error("TikTok access token is required");
  if (!input.outputPath) throw new Error("TikTok outputPath is required");

  const creator = await queryCreatorInfo(input.token);
  const privacyLevel = resolvePrivacyLevel(
    creator.privacy_level_options ?? [],
    input.privacyLevel,
    input.requireSelfOnly ?? false,
  );

  const publish = await initializeDirectPost(input.token, input, creator, privacyLevel);
  if (!publish.publish_id) {
    throw new Error("TikTok Direct Post response missing publish_id");
  }

  if (!publish.upload_url) {
    throw new Error("TikTok FILE_UPLOAD response missing upload_url");
  }
  await uploadFileInChunks(publish.upload_url, input.outputPath);

  const attempts = input.pollAttempts ?? DEFAULT_POLL_ATTEMPTS;
  const delayMs = input.pollDelayMs ?? DEFAULT_POLL_DELAY_MS;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await fetchPublishStatus(input.token, publish.publish_id);
    if (status.status === "published" || status.status === "failed") {
      return {
        publishId: publish.publish_id,
        status: status.status,
        ...(status.platformUrl ?? input.outputPublicUrl
          ? { platformUrl: status.platformUrl ?? input.outputPublicUrl }
          : {}),
        ...(status.failureReason ? { failureReason: status.failureReason } : {}),
      };
    }

    if (attempt < attempts - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    publishId: publish.publish_id,
    status: "pending_review",
  };
}
