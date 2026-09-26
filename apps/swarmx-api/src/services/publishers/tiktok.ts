import type { PublishResult, VideoArtifacts } from "@swarmx/types/video-types";
import type { VideoJob } from "../../types/video.js";
import { BaseVideoPublisher } from "./base-publisher.js";
import { GenericVideoPublisher } from "./generic.js";
import { loadEnv, readRawEnv, readSecretEnv } from "../../lib/env.js";
import { getTikTokAccount } from "../tiktok-accounts.js";
import { enqueueTikTokDirectPost } from "../tiktok-direct-post-queue.js";
import { executeTikTokDirectPostWithAccessToken } from "../tiktok-protocol.js";

export class TikTokVideoPublisher extends BaseVideoPublisher {
  readonly platform = "tiktok" as const;

  protected readonly profile = {
    accountLabel: "TikTok Content API",
    deliveryMode: "studio_export" as const,
    requiresApproval: true,
  };

  protected async createResult(
    job: VideoJob,
    artifacts: VideoArtifacts,
    scheduledAt?: string,
  ): Promise<PublishResult> {
    const env = loadEnv();

    if (env.SWARMX_TIKTOK_API_APPROVED !== "1") {
      return this.fallbackToStudio(job, artifacts, scheduledAt, "TikTok Direct Post is not enabled");
    }

    if (scheduledAt) {
      return this.fallbackToStudio(
        job,
        artifacts,
        scheduledAt,
        "TikTok scheduling requires a supported platform capability; exported for review",
      );
    }

    if (!artifacts.outputPath) {
      return this.buildResult(job, artifacts, "failed", {
        failureReason: "Missing output artifact for TikTok upload",
        requiresApproval: true,
        approvalState: "pending_review",
      });
    }

    const requestedPrivacy = readRawEnv("SWARMX_TIKTOK_PRIVACY_LEVEL")?.trim() || "SELF_ONLY";
    const accountId = job.request.tiktokAccountId;

    if (env.NODE_ENV === "production") {
      if (!accountId) {
        return this.fallbackToStudio(
          job,
          artifacts,
          scheduledAt,
          "Production TikTok publishing requires a durable tiktokAccountId",
        );
      }

      const account = await getTikTokAccount(accountId);
      if (!account) {
        return this.fallbackToStudio(job, artifacts, scheduledAt, "TikTok account not found");
      }

      if (account.status !== "controlled_verified") {
        return this.fallbackToStudio(
          job,
          artifacts,
          scheduledAt,
          "Controlled-account verification must succeed before automated Direct Post",
        );
      }

      const outcome = await enqueueTikTokDirectPost({
        accountId,
        prompt: job.request.prompt,
        outputPath: artifacts.outputPath,
        ...(artifacts.outputPublicUrl ? { outputPublicUrl: artifacts.outputPublicUrl } : {}),
        ...(artifacts.durationSeconds !== undefined ? { durationSeconds: artifacts.durationSeconds } : {}),
        privacyLevel: requestedPrivacy,
      });

      return {
        ...this.buildResult(job, artifacts, outcome.status, {
          ...(outcome.failureReason ? { failureReason: outcome.failureReason } : {}),
          ...(outcome.platformUrl ? { platformUrl: outcome.platformUrl } : {}),
          requiresApproval: true,
          approvalState: outcome.status === "failed" ? "pending_review" : "approved",
        }),
        publishId: outcome.publishId,
      };
    }

    // Non-production compatibility path: useful for protocol tests and local
    // developer probes. It is deliberately unavailable as a production route.
    const token = readSecretEnv("SWARMX_TIKTOK_ACCESS_TOKEN");
    if (!token) {
      return this.fallbackToStudio(
        job,
        artifacts,
        scheduledAt,
        "TikTok account credentials are not configured",
      );
    }

    const outcome = await executeTikTokDirectPostWithAccessToken({
      token,
      prompt: job.request.prompt,
      outputPath: artifacts.outputPath,
      ...(artifacts.outputPublicUrl ? { outputPublicUrl: artifacts.outputPublicUrl } : {}),
      ...(artifacts.durationSeconds !== undefined ? { durationSeconds: artifacts.durationSeconds } : {}),
      privacyLevel: requestedPrivacy,
    });

    return {
      ...this.buildResult(job, artifacts, outcome.status, {
        ...(outcome.failureReason ? { failureReason: outcome.failureReason } : {}),
        ...(outcome.platformUrl ? { platformUrl: outcome.platformUrl } : {}),
        requiresApproval: true,
        approvalState: outcome.status === "failed" ? "pending_review" : "approved",
      }),
      publishId: outcome.publishId,
    };
  }

  private async fallbackToStudio(
    job: VideoJob,
    artifacts: VideoArtifacts,
    scheduledAt: string | undefined,
    reason: string,
  ): Promise<PublishResult> {
    this.log("warn", "studio_export_required", { reason });
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
      accountLabel: "TikTok Studio",
      failureReason: reason,
    };
  }
}
