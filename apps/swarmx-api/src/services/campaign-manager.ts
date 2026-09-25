/**
 * apps/swarmx-api/src/services/campaign-manager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SwarmXQ APEX-19 r1 — Multi-Video Campaign Manager
 *
 * Orchestrates multi-episode narrative campaigns (3-part, 5-part, etc.):
 *  - High-retention hook grammar (target latency <= 200ms)
 *  - Episodic narrative arc (opener -> escalation -> climax / payoff)
 *  - Seamless narrative bridge between episodes
 *  - Automated platform publishing metadata (staggered release offsets)
 *  - Direct integration into SwarmX video queue and memory mutex
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  CampaignPlanJSON,
  CampaignEpisode,
  HookGrammar,
  CampaignScript,
  SeriesBridge,
  CampaignPublishingMetadata,
  VideoTone,
} from "@swarmx/types";
import { log } from "../lib/logger.js";
import { appendStateEvent, readSnapshot, writeSnapshot } from "./local-state-store.js";
import * as queue from "./video-queue.js";
import { runOrchestration, type BroadcastFn } from "./video-orchestrator.js";

export const CreateCampaignSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  topic: z.string().min(1).max(500),
  niche: z.string().min(1).max(100).default("growth"),
  tone: z.enum([
    "educational",
    "urgent",
    "warm",
    "contrarian",
    "cinematic",
    "minimal",
    "faceless_broll",
    "kinetic_text",
  ]).default("contrarian"),
  totalEpisodes: z.number().int().min(2).max(7).default(3),
  platform: z.enum(["tiktok", "youtube_shorts", "instagram_reels"]).default("tiktok"),
  targetAudience: z.string().min(1).max(300).default("Short-form video viewers looking for immediate actionable insights"),
  coreThesis: z.string().min(1).max(500).optional(),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

const campaignRegistry = new Map<string, CampaignPlanJSON>();
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const loaded = readSnapshot<CampaignPlanJSON>("campaigns");
    if (Array.isArray(loaded)) {
      for (const camp of loaded) {
        if (camp?.campaignId) {
          campaignRegistry.set(camp.campaignId, camp);
        }
      }
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "campaign-manager: snapshot hydration failed");
  }
}

function persist(event: string, campaign: CampaignPlanJSON): void {
  appendStateEvent("campaigns", event, { ...campaign, id: campaign.campaignId });
  writeSnapshot("campaigns", [...campaignRegistry.values()]);
}

/**
 * Builds structured narrative beats for an episode in a campaign arc.
 */
function buildEpisodePlan(
  topic: string,
  niche: string,
  tone: VideoTone,
  platform: "tiktok" | "youtube_shorts" | "instagram_reels",
  episodeNumber: number,
  totalEpisodes: number,
  coreThesis: string,
): CampaignEpisode {
  const isFirst = episodeNumber === 1;
  const isLast = episodeNumber === totalEpisodes;
  const arcPosition: CampaignEpisode["narrativeArcPosition"] = isFirst
    ? "hook_opener"
    : isLast
    ? "climax_revelation"
    : "escalation";

  // Hook grammar tailored to position
  const hookStyles: HookGrammar["hookStyle"][] = [
    "contrarian",
    "curiosity_gap",
    "negative_constraint",
    "direct_challenge",
    "visceral_proof",
  ];
  const hookStyle = hookStyles[(episodeNumber - 1) % hookStyles.length]!;

  let hookText = "";
  let visualCue = "";
  if (isFirst) {
    hookText = `Stop scrolling right now. What you have been told about ${topic} is completely backwards.`;
    visualCue = "Rapid red accent pulse with high-contrast text overlay on near-black background";
  } else if (isLast) {
    hookText = `This is Part ${episodeNumber} of ${totalEpisodes}. The final proof that changes everything about ${topic}.`;
    visualCue = "Kinetic zoom into gold-accented typography with high visual tension";
  } else {
    hookText = `Part ${episodeNumber}. If you saw the truth in Part ${episodeNumber - 1}, here is the mistake that costs you everything.`;
    visualCue = "Glitch transition with rapid slide-in caption cards";
  }

  const hookGrammar: HookGrammar = {
    hookText,
    hookStyle,
    visualCue,
    targetLatencyMs: 120, // Strict <= 200ms
  };

  const bodyText = isFirst
    ? `Most people think ${topic} requires months of wasted effort. But elite creators know the exact leverage point that delivers 80% of results in 20% of the time. Here is the framework.`
    : isLast
    ? `Everything we laid out in the previous parts comes down to this single rule: stop guessing and implement the system directly. Once you lock this in, results compound automatically.`
    : `The common wisdom tells you to do more. But when you eliminate the friction and focus exclusively on the core mechanism of ${topic}, everything speeds up by 10x.`;

  const ctaText = isLast
    ? `Save this entire series and rewatch Part 1 to start executing immediately.`
    : `Hit follow right now for Part ${episodeNumber + 1} releasing tomorrow.`;

  const fullScriptText = `[HOOK]\n${hookText}\n\n[BODY]\n${bodyText}\n\n[CTA]\n${ctaText}`;
  const wordCount = fullScriptText.split(/\s+/).filter(Boolean).length;
  const estimatedDurationSeconds = Math.max(15, Math.min(60, Math.round(wordCount / 2.5)));

  const script: CampaignScript = {
    hookText,
    bodyText,
    ctaText,
    fullScriptText,
    estimatedDurationSeconds,
    wordCount,
  };

  const bridge: SeriesBridge = {
    ...(episodeNumber > 1 ? { previousEpisodeCliffhanger: `Recap: In Part ${episodeNumber - 1}, we exposed the fundamental flaw.` } : {}),
    nextEpisodeTease: isLast ? "Loop back to Episode 1 for the setup." : `Part ${episodeNumber + 1} drops the full tactical execution.`,
    callbackAnchor: topic.toLowerCase().replace(/[^a-z0-9]/g, "-"),
  };

  const title = `Part ${episodeNumber}: The ${topic} Blueprint`;
  const publishing: CampaignPublishingMetadata = {
    platform,
    title,
    description: `${title} — ${coreThesis}\n\n#${niche} #${platform} #series #growth`,
    tags: [niche, "series", "viral", platform, "insights"],
    scheduledOffsetHours: (episodeNumber - 1) * 24,
    captionDraft: `${hookText} Part ${episodeNumber}/${totalEpisodes}. Drop your thoughts below. 👇`,
  };

  return {
    episodeNumber,
    title,
    narrativeArcPosition: arcPosition,
    hookGrammar,
    script,
    bridge,
    publishing,
    status: "drafted",
  };
}

export class CampaignManager {
  private static _instance: CampaignManager | null = null;

  private constructor() {
    hydrate();
  }

  static getInstance(): CampaignManager {
    if (!CampaignManager._instance) {
      CampaignManager._instance = new CampaignManager();
    }
    return CampaignManager._instance;
  }

  async createCampaign(input: CreateCampaignInput): Promise<CampaignPlanJSON> {
    const validated = CreateCampaignSchema.parse(input);
    const campaignId = randomUUID();
    const now = new Date().toISOString();
    const coreThesis = validated.coreThesis || `The authoritative framework for mastering ${validated.topic}`;
    const title = validated.title || `${validated.topic} Master Series (${validated.totalEpisodes} Parts)`;

    const episodes: CampaignEpisode[] = [];
    for (let i = 1; i <= validated.totalEpisodes; i += 1) {
      episodes.push(
        buildEpisodePlan(
          validated.topic,
          validated.niche,
          validated.tone,
          validated.platform,
          i,
          validated.totalEpisodes,
          coreThesis,
        ),
      );
    }

    const campaign: CampaignPlanJSON = {
      campaignId,
      title,
      topic: validated.topic,
      niche: validated.niche,
      tone: validated.tone,
      totalEpisodes: validated.totalEpisodes,
      targetAudience: validated.targetAudience,
      coreThesis,
      episodes,
      createdAt: now,
      updatedAt: now,
    };

    campaignRegistry.set(campaignId, campaign);
    persist("create", campaign);

    log.info(
      { campaignId, title, episodesCount: episodes.length, platform: validated.platform },
      "campaign-manager: campaign plan created",
    );

    return campaign;
  }

  getCampaign(campaignId: string): CampaignPlanJSON | null {
    hydrate();
    return campaignRegistry.get(campaignId) ?? null;
  }

  listCampaigns(): CampaignPlanJSON[] {
    hydrate();
    return [...campaignRegistry.values()];
  }

  deleteCampaign(campaignId: string): boolean {
    hydrate();
    const existing = campaignRegistry.get(campaignId);
    if (!existing) return false;
    campaignRegistry.delete(campaignId);
    persist("delete", existing);
    log.info({ campaignId }, "campaign-manager: campaign deleted");
    return true;
  }

  async renderCampaignEpisode(
    campaignId: string,
    episodeNumber: number,
    broadcast?: BroadcastFn,
  ): Promise<{ jobId: string; episode: CampaignEpisode }> {
    hydrate();
    const campaign = campaignRegistry.get(campaignId);
    if (!campaign) {
      throw Object.assign(new Error(`Campaign ${campaignId} not found`), { code: "CAMPAIGN_NOT_FOUND" });
    }

    const episode = campaign.episodes.find((e) => e.episodeNumber === episodeNumber);
    if (!episode) {
      throw Object.assign(new Error(`Episode ${episodeNumber} not found in campaign ${campaignId}`), {
        code: "EPISODE_NOT_FOUND",
      });
    }

    const job = queue.enqueue({
      prompt: episode.script.fullScriptText || `${episode.title}: ${episode.script.bodyText}`,
      platform: episode.publishing.platform === "youtube_shorts" ? "youtube_shorts"
        : episode.publishing.platform === "instagram_reels" ? "reels"
        : "tiktok",
      tone: campaign.tone,
      targetDurationSeconds: episode.script.estimatedDurationSeconds,
      clientRequestId: `camp-${campaignId}-ep${episodeNumber}`,
      niche: campaign.niche as any,
    });

    episode.status = "rendering";
    episode.jobId = job.id;
    campaign.updatedAt = new Date().toISOString();
    persist("update", campaign);

    const broadcastFn = broadcast ?? (() => {});
    void runOrchestration(job.id, broadcastFn).catch((err) => {
      log.error(
        { campaignId, episodeNumber, jobId: job.id, err: err instanceof Error ? err.message : String(err) },
        "campaign-manager: episode rendering failed",
      );
      episode.status = "failed";
      persist("update", campaign);
    });

    log.info({ campaignId, episodeNumber, jobId: job.id }, "campaign-manager: episode render enqueued");

    return { jobId: job.id, episode };
  }
}
