/**
 * apps/swarmx-api/src/services/publishers/youtube.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SwarmXQ APEX-19 r1 — YouTube Shorts Publisher Adapter
 *
 * Implements YouTube Data API v3 resumable video upload:
 *  - Handles OAuth bearer token authorization
 *  - Adds #Shorts tag in snippet for short-form feed ingestion
 *  - Exponential backoff on HTTP 429 / 503
 *  - Graceful fallback to studio export when unconfigured
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFile } from "node:fs/promises";
import type { PublishResult, VideoArtifacts } from "@swarmx/types/video-types";
import type { VideoJob } from "../../types/video.js";
import { BaseVideoPublisher } from "./base-publisher.js";
import { GenericVideoPublisher } from "./generic.js";
import { loadEnv, readSecretEnv } from "../../lib/env.js";

const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

export class YouTubeShortsPublisher extends BaseVideoPublisher {
  readonly platform = "shorts" as const;

  protected readonly profile = {
    accountLabel: "YouTube Data API v3",
    deliveryMode: "studio_export" as const,
    requiresApproval: true,
  };

  protected async createResult(
    job: VideoJob,
    artifacts: VideoArtifacts,
    scheduledAt?: string,
  ): Promise<PublishResult> {
    const token = readSecretEnv("SWARMX_YOUTUBE_ACCESS_TOKEN");
    const approved = loadEnv().SWARMX_YOUTUBE_API_APPROVED === "1";

    if (!token || !approved) {
      this.log("warn", "approval_required", {
        message: "YouTube Data API requires OAuth credentials and user approval. See docs/YOUTUBE_SETUP.md",
      });
      const fallback = new GenericVideoPublisher();
      const genericResult = scheduledAt
        ? await fallback.schedule(job, artifacts, scheduledAt)
        : await fallback.publish(job, artifacts);

      return {
        ...genericResult,
        platform: this.platform,
        status: "pending_review",
        ...(scheduledAt ? { scheduledAt } : {}),
        requiresApproval: true,
        approvalState: "pending_review",
        deliveryMode: "studio_export",
        accountLabel: "YouTube Studio",
        failureReason: "YouTube Data API requires OAuth credentials and approval. See docs/YOUTUBE_SETUP.md",
      };
    }

    if (!artifacts.outputPath) {
      return this.buildResult(job, artifacts, "failed", {
        ...(scheduledAt ? { scheduledAt } : {}),
        failureReason: "Missing output artifact for YouTube Shorts upload",
        requiresApproval: true,
        approvalState: "approved",
      });
    }

    const titleWithTag = job.request.prompt
      ? `${job.request.prompt.slice(0, 85)} #Shorts`
      : `Short #${job.id.slice(0, 8)} #Shorts`;

    const description = `${job.request.prompt ?? ""}\n\n#Shorts #Viral #Trending`;

    // Resilient resumable upload with exponential backoff
    const uploadResult = await this.withRetry(async () => {
      // Step 1: Initiate resumable session
      const initResponse = await fetch(`${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify({
          snippet: {
            title: titleWithTag,
            description,
            tags: ["Shorts", "Trending", job.request.niche ?? "entertainment"],
            categoryId: "22", // People & Blogs
          },
          status: {
            privacyStatus: "public",
            selfDeclaredMadeForKids: false,
            ...(scheduledAt ? { publishAt: scheduledAt } : {}),
          },
        }),
      });

      if (!initResponse.ok) {
        throw new Error(`YouTube resumable upload initiation failed: HTTP ${initResponse.status}`);
      }

      const uploadLocation = initResponse.headers.get("Location");
      if (!uploadLocation) {
        throw new Error("YouTube did not return upload Location header");
      }

      // Step 2: Upload file bytes
      const fileBytes = await readFile(artifacts.outputPath as string);
      const putResponse = await fetch(uploadLocation, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(fileBytes.length),
        },
        body: fileBytes,
      });

      if (!putResponse.ok) {
        throw new Error(`YouTube video upload failed: HTTP ${putResponse.status}`);
      }

      const result = (await putResponse.json()) as { id?: string };
      return result;
    });

    const videoId = uploadResult?.id;
    const platformUrl = videoId ? `https://youtube.com/shorts/${videoId}` : undefined;

    return this.buildResult(job, artifacts, "published", {
      ...(scheduledAt ? { scheduledAt } : {}),
      ...(platformUrl ? { platformUrl } : {}),
      requiresApproval: false,
      approvalState: "approved",
    });
  }
}
