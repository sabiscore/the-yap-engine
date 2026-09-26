import { open, stat } from "node:fs/promises";
import type { PublishResult, VideoArtifacts } from "@swarmx/types/video-types";
import type { VideoJob } from "../../types/video.js";
import { BaseVideoPublisher } from "./base-publisher.js";
import { GenericVideoPublisher } from "./generic.js";
import { loadEnv, readRawEnv, readSecretEnv } from "../../lib/env.js";

const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const POLL_ATTEMPTS = 12;
const POLL_DELAY_MS = 5_000;
const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;

interface TikTokApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string };
}
interface CreatorInfo { privacy_level_options?: string[]; max_video_post_duration_sec?: number; }
interface PublishInit { publish_id?: string; upload_url?: string; }
interface PublishStatus { status?: string; fail_reason?: string; public_url?: string; }

export class TikTokVideoPublisher extends BaseVideoPublisher {
  readonly platform = "tiktok" as const;
  protected readonly profile = {
    accountLabel: "TikTok Content API",
    deliveryMode: "studio_export" as const,
    requiresApproval: true,
  };

  protected async createResult(job: VideoJob, artifacts: VideoArtifacts, scheduledAt?: string): Promise<PublishResult> {
    const token = readSecretEnv("SWARMX_TIKTOK_ACCESS_TOKEN");
    const approved = loadEnv().SWARMX_TIKTOK_API_APPROVED === "1";

    if (!token || !approved) {
      return this.fallbackToStudio(job, artifacts, scheduledAt, "TikTok Direct Post is not enabled");
    }

    // Keep scheduling human-reviewed unless a documented TikTok scheduling capability is added.
    if (scheduledAt) {
      return this.fallbackToStudio(job, artifacts, scheduledAt, "TikTok scheduling requires a supported platform capability; exported for review");
    }

    if (!artifacts.outputPath) {
      return this.buildResult(job, artifacts, "failed", {
        failureReason: "Missing output artifact for TikTok upload",
        requiresApproval: true,
        approvalState: "approved",
      });
    }

    const creator = await this.withRetry(() => this.queryCreatorInfo(token));
    const privacyLevel = this.resolvePrivacyLevel(creator.privacy_level_options ?? []);
    const publish = await this.withRetry(() => this.initializeDirectPost(token, job, artifacts, creator.max_video_post_duration_sec, privacyLevel));

    if (!publish.publish_id) {
      return this.buildResult(job, artifacts, "failed", {
        failureReason: "TikTok Direct Post response missing publish_id",
        requiresApproval: true,
        approvalState: "approved",
      });
    }

    if (publish.upload_url) {
      await this.withRetry(() => this.uploadFileInChunks(publish.upload_url!, artifacts.outputPath!));
    }

    const publishStatus = await this.withRetry(() => this.pollPublishStatus(token, publish.publish_id!));
    const resolvedPlatformUrl = publishStatus.platformUrl ?? this.defaultPlatformUrl(artifacts, publish.publish_id, job.id);

    return {
      ...this.buildResult(job, artifacts, publishStatus.status, {
        ...(publishStatus.failureReason ? { failureReason: publishStatus.failureReason } : {}),
        ...(resolvedPlatformUrl ? { platformUrl: resolvedPlatformUrl } : {}),
        requiresApproval: true,
        approvalState: "approved",
      }),
      publishId: publish.publish_id,
    };
  }

  private async queryCreatorInfo(token: string): Promise<CreatorInfo> {
    const response = await fetch(TIKTOK_API_BASE + "/v2/post/publish/creator_info/query/", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json; charset=UTF-8" },
    });
    const payload = (await response.json().catch(() => ({}))) as TikTokApiEnvelope<CreatorInfo>;
    if (!response.ok || payload.error?.code !== "ok") {
      throw new Error("TikTok creator info failed (" + response.status + "): " + (payload.error?.code ?? "unknown"));
    }
    return payload.data ?? {};
  }

  private async initializeDirectPost(token: string, job: VideoJob, artifacts: VideoArtifacts, maxDurationSeconds: number | undefined, privacyLevel: string): Promise<PublishInit> {
    const fileStat = await stat(artifacts.outputPath!);
    const duration = artifacts.durationSeconds;
    if (maxDurationSeconds !== undefined && duration !== undefined && duration > maxDurationSeconds) {
      throw new Error("TikTok creator account accepts at most " + maxDurationSeconds + "s; artifact is " + duration + "s");
    }

    const chunkSize = Math.min(DEFAULT_CHUNK_SIZE, Math.max(1, fileStat.size));
    const totalChunkCount = Math.ceil(fileStat.size / chunkSize);
    const response = await fetch(TIKTOK_API_BASE + "/v2/post/publish/video/init/", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        post_info: { title: job.request.prompt.slice(0, 2200), privacy_level: privacyLevel, is_aigc: true },
        source_info: { source: "FILE_UPLOAD", video_size: fileStat.size, chunk_size: chunkSize, total_chunk_count: totalChunkCount },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as TikTokApiEnvelope<PublishInit>;
    if (!response.ok || payload.error?.code !== "ok") {
      throw new Error("TikTok publish init failed (" + response.status + "): " + (payload.error?.code ?? "unknown"));
    }
    return payload.data ?? {};
  }

  private async uploadFileInChunks(uploadUrl: string, outputPath: string): Promise<void> {
    const file = await open(outputPath, "r");
    try {
      const fileStat = await file.stat();
      const chunkSize = Math.min(DEFAULT_CHUNK_SIZE, Math.max(1, fileStat.size));
      let offset = 0;
      while (offset < fileStat.size) {
        const length = Math.min(chunkSize, fileStat.size - offset);
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await file.read(buffer, 0, length, offset);
        if (bytesRead !== length) throw new Error("TikTok upload read mismatch at byte " + offset);
        const end = offset + bytesRead - 1;
        const response = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "video/mp4", "Content-Length": String(bytesRead), "Content-Range": "bytes " + offset + "-" + end + "/" + fileStat.size },
          body: buffer,
        });
        if (!response.ok) throw new Error("TikTok media upload failed with status " + response.status);
        offset += bytesRead;
      }
    } finally {
      await file.close();
    }
  }

  private async pollPublishStatus(token: string, publishId: string): Promise<{ status: "published" | "failed" | "pending_review"; platformUrl?: string; failureReason?: string }> {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      const response = await fetch(TIKTOK_API_BASE + "/v2/post/publish/status/fetch/", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ publish_id: publishId }),
      });
      const payload = (await response.json().catch(() => ({}))) as TikTokApiEnvelope<PublishStatus>;
      if (!response.ok || payload.error?.code !== "ok") {
        throw new Error("TikTok publish status failed (" + response.status + "): " + (payload.error?.code ?? "unknown"));
      }
      const status = (payload.data?.status ?? "").toLowerCase();
      if (["publish_complete", "published", "success"].includes(status)) return { status: "published", platformUrl: payload.data?.public_url };
      if (["failed", "publish_failed", "error"].includes(status)) return { status: "failed", failureReason: payload.data?.fail_reason ?? "TikTok publish failed" };
      await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
    }
    return { status: "pending_review" };
  }

  private resolvePrivacyLevel(options: string[]): string {
    const requested = readRawEnv("SWARMX_TIKTOK_PRIVACY_LEVEL")?.trim();
    if (requested && options.includes(requested)) return requested;
    if (options.includes("SELF_ONLY")) return "SELF_ONLY";
    return options[0] ?? "SELF_ONLY";
  }

  private async fallbackToStudio(job: VideoJob, artifacts: VideoArtifacts, scheduledAt: string | undefined, reason: string): Promise<PublishResult> {
    this.log("warn", "studio_export_required", { reason });
    const fallback = new GenericVideoPublisher();
    const genericResult = scheduledAt ? await fallback.schedule(job, artifacts, scheduledAt) : await fallback.publish(job, artifacts);
    return {
      ...genericResult,
      platform: this.platform,
      status: "pending_review",
      ...(scheduledAt ? { scheduledAt } : {}),
      requiresApproval: true,
      approvalState: "pending_review",
      deliveryMode: "studio_export",
      accountLabel: "TikTok Studio",
      failureReason: reason,
    };
  }
}