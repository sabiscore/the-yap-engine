import { describe, it, expect, vi, beforeEach } from "vitest";
import { CampaignManager } from "../src/services/campaign-manager.js";

describe("Multi-Video Campaign Manager (APEX-19 r1)", () => {
  let manager: CampaignManager;

  beforeEach(() => {
    manager = CampaignManager.getInstance();
  });

  it("should create a structured 3-part campaign plan with narrative arc and bridges", async () => {
    const campaign = await manager.createCampaign({
      topic: "Zero-Shot Video Automation",
      niche: "ai_tech",
      tone: "contrarian",
      totalEpisodes: 3,
      platform: "tiktok",
      targetAudience: "Indie hackers and tech creators",
    });

    expect(campaign.campaignId).toBeDefined();
    expect(campaign.totalEpisodes).toBe(3);
    expect(campaign.episodes).toHaveLength(3);

    // Episode 1: Opener
    const ep1 = campaign.episodes[0]!;
    expect(ep1.episodeNumber).toBe(1);
    expect(ep1.narrativeArcPosition).toBe("hook_opener");
    expect(ep1.hookGrammar.targetLatencyMs).toBeLessThanOrEqual(200);
    expect(ep1.script.fullScriptText).toContain("[HOOK]");
    expect(ep1.script.fullScriptText).toContain("[BODY]");
    expect(ep1.script.fullScriptText).toContain("[CTA]");
    expect(ep1.bridge.nextEpisodeTease).toBeDefined();
    expect(ep1.publishing.scheduledOffsetHours).toBe(0);

    // Episode 2: Escalation
    const ep2 = campaign.episodes[1]!;
    expect(ep2.episodeNumber).toBe(2);
    expect(ep2.narrativeArcPosition).toBe("escalation");
    expect(ep2.bridge.previousEpisodeCliffhanger).toBeDefined();
    expect(ep2.publishing.scheduledOffsetHours).toBe(24);

    // Episode 3: Climax / Revelation
    const ep3 = campaign.episodes[2]!;
    expect(ep3.episodeNumber).toBe(3);
    expect(ep3.narrativeArcPosition).toBe("climax_revelation");
    expect(ep3.publishing.scheduledOffsetHours).toBe(48);
  });

  it("should retrieve and list created campaigns", async () => {
    const campaign = await manager.createCampaign({
      topic: "Local LLM Mastery",
      totalEpisodes: 2,
    });

    const retrieved = manager.getCampaign(campaign.campaignId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.campaignId).toBe(campaign.campaignId);

    const list = manager.listCampaigns();
    expect(list.some((c) => c.campaignId === campaign.campaignId)).toBe(true);
  });

  it("should render an episode by enqueuing into the video pipeline", async () => {
    const campaign = await manager.createCampaign({
      topic: "FFmpeg Performance Hacks",
      totalEpisodes: 2,
    });

    const result = await manager.renderCampaignEpisode(campaign.campaignId, 1);
    expect(result.jobId).toBeDefined();
    expect(result.episode.status).toBe("rendering");

    const updated = manager.getCampaign(campaign.campaignId);
    expect(updated?.episodes[0]?.status).toBe("rendering");
    expect(updated?.episodes[0]?.jobId).toBe(result.jobId);
  });
});
