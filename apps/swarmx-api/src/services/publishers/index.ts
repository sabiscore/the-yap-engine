import type { VideoExportPlatform } from "@swarmx/types/video-types";
import type { PlatformPublisher } from "./base-publisher.js";
import { GenericVideoPublisher } from "./generic.js";
import { InstagramVideoPublisher } from "./instagram.js";
import { TikTokVideoPublisher } from "./tiktok.js";
import { YouTubeShortsPublisher } from "./youtube.js";

const publisherRegistry: Record<VideoExportPlatform, PlatformPublisher> = {
  tiktok: new TikTokVideoPublisher(),
  reels: new InstagramVideoPublisher(),
  shorts: new YouTubeShortsPublisher(),
  generic: new GenericVideoPublisher(),
};

const requiresApprovalMap: Record<VideoExportPlatform, boolean> = {
  tiktok: true,
  reels: true,
  shorts: false,
  generic: false,
};

export function listSupportedPublishPlatforms(): VideoExportPlatform[] {
  return Object.keys(publisherRegistry) as VideoExportPlatform[];
}

export function getVideoPublisher(platform: VideoExportPlatform): PlatformPublisher {
  return publisherRegistry[platform];
}

export function publisherRequiresApproval(platform: VideoExportPlatform): boolean {
  return requiresApprovalMap[platform];
}