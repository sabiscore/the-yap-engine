import { describe, expect, it } from "vitest";
import {
  ACTIVE_VIDEO_STATUSES,
  errorCodeHint,
  errorCodeNextAction,
  formatActiveJobPrompt,
  isActiveVideoStatus,
  normalizeVideoJob,
} from "@/lib/video-dashboard";

describe("video dashboard normalization", () => {
  it("preserves certification blockers from completed job output", () => {
    const job = normalizeVideoJob({
      id: "job-1",
      status: "completed",
      request: { prompt: "Make a product video" },
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:01.000Z",
      output: {
        relativePath: "video.mp4",
        absolutePath: "/tmp/video.mp4",
        publicUrl: "/api/video/files/video.mp4",
        fileSizeBytes: 1024,
        durationSeconds: 12,
        widthPx: 720,
        heightPx: 1280,
        fps: 30,
        format: "mp4",
        checksum: "sha256",
        generatedAt: "2026-07-28T00:00:01.000Z",
        modelsUsed: {},
        certificationTier: "TECHNICALLY_VALID",
        certificationBlockers: ["Rights and provenance manifest is missing"],
      },
    });

    expect(job.output?.certificationTier).toBe("TECHNICALLY_VALID");
    expect(job.output?.certificationBlockers).toEqual(["Rights and provenance manifest is missing"]);
  });

  it("preserves extended request fields during normalization", () => {
    const job = normalizeVideoJob({
      id: "job-2",
      status: "queued",
      request: {
        prompt: "Test prompt",
        platform: "tiktok",
        niche: "tech",
        tone: "urgent",
        style: "kinetic_text",
        captionStyle: "bold_center",
        voice: "energetic",
        voiceProfileId: "kokoro_energetic",
        storyMode: "dialogue_storytime",
        audience: "developers",
      },
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:01.000Z",
    });

    expect(job.request.platform).toBe("tiktok");
    expect(job.request.tone).toBe("urgent");
    expect(job.request.voiceProfileId).toBe("kokoro_energetic");
    expect(job.request.storyMode).toBe("dialogue_storytime");
    expect(job.request.audience).toBe("developers");
  });



  it("normalizes legacy template values into the canonical creator taxonomy", () => {
    // Canonical values pass through unchanged
    const job = normalizeVideoJob({
      id: "job-template",
      status: "queued",
      request: {
        prompt: "Make a short about focus",
        templateFamily: "list/countdown" as never,
      },
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:01.000Z",
    });

    expect(job.request.templateFamily).toBe("list/countdown");

    // Legacy alias "listicle-countdown" is normalized to the canonical value
    const jobLegacy = normalizeVideoJob({
      id: "job-template-legacy",
      status: "queued",
      request: {
        prompt: "Make a short about focus",
        templateFamily: "listicle-countdown" as never,
      },
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:01.000Z",
    });

    expect(jobLegacy.request.templateFamily).toBe("list/countdown");
  });

  it("surfaces classified backend hints and does not present UNKNOWN as retryable", () => {
    expect(errorCodeHint("COMFY_UNAVAILABLE")).toContain("ComfyUI is not reachable");
    expect(errorCodeHint("UNKNOWN")).toContain("Retry is disabled");
  });

  it("maps known failure codes to actionable next steps", () => {
    expect(errorCodeNextAction("PRESSURE_CRITICAL")).toContain("Free RAM");
    expect(errorCodeNextAction("FFMPEG_UNAVAILABLE")).toContain("Install ffmpeg");
    expect(errorCodeNextAction("UNKNOWN")).toContain("inspect trace");
  });

  describe("formatActiveJobPrompt", () => {
    it("strips leading 'Create a' so pill does not say 'Making Create a...'", () => {
      const result = formatActiveJobPrompt("Create a 30-second faceless TikTok video about AI");
      expect(result).toBe("a 30-second faceless TikTok video about AI");
      expect(`Making ${result}`).not.toContain("Making Create");
    });

    it("strips leading action verbs like Make, Generate, Build, Produce, Creating", () => {
      expect(formatActiveJobPrompt("Make a product showcase")).toBe("a product showcase");
      expect(formatActiveJobPrompt("Generate an explainer on finance")).toBe("an explainer on finance");
      expect(formatActiveJobPrompt("Build a tutorial video")).toBe("a tutorial video");
      expect(formatActiveJobPrompt("Creating a viral reel")).toBe("a viral reel");
      expect(formatActiveJobPrompt("Create: 10 tips for productivity")).toBe("10 tips for productivity");
    });

    it("strips chained redundant verbs", () => {
      expect(formatActiveJobPrompt("Making Create a 30s video")).toBe("a 30s video");
    });

    it("preserves non-verb prompts without modification", () => {
      expect(formatActiveJobPrompt("3 AI workflow mistakes costing you hours")).toBe("3 AI workflow mistakes costing you hours");
    });

    it("truncates prompt to maxLength when specified", () => {
      const longPrompt = "Create a 30-second video about the history of artificial intelligence from Turing to transformers";
      const result = formatActiveJobPrompt(longPrompt, 20);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result).toBe("a 30-second video ab");
    });

    it("returns 'video' fallback for empty or whitespace prompts", () => {
      expect(formatActiveJobPrompt("")).toBe("video");
      expect(formatActiveJobPrompt("   ")).toBe("video");
    });
  });

  describe("isActiveVideoStatus", () => {
    it("identifies all 9 active video pipeline statuses", () => {
      expect(ACTIVE_VIDEO_STATUSES).toHaveLength(9);
      for (const status of ACTIVE_VIDEO_STATUSES) {
        expect(isActiveVideoStatus(status)).toBe(true);
      }
    });

    it("returns false for non-active statuses and invalid values", () => {
      expect(isActiveVideoStatus("queued")).toBe(false);
      expect(isActiveVideoStatus("done")).toBe(false);
      expect(isActiveVideoStatus("completed")).toBe(false);
      expect(isActiveVideoStatus("failed")).toBe(false);
      expect(isActiveVideoStatus("cancelled")).toBe(false);
      expect(isActiveVideoStatus("")).toBe(false);
      expect(isActiveVideoStatus(null)).toBe(false);
      expect(isActiveVideoStatus(undefined)).toBe(false);
      expect(isActiveVideoStatus(123)).toBe(false);
      expect(isActiveVideoStatus({})).toBe(false);
    });
  });
});
