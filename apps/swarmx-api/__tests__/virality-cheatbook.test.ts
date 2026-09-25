import { describe, it, expect, beforeEach } from "vitest";
import { recordViralityCheatbookEntry, readViralityCheatbook } from "../src/services/virality-cheatbook-tracker.js";

describe("Virality Cheatbook Telemetry Logger", () => {
  it("should record and retrieve creative video DNA entries", async () => {
    const testEntry = {
      jobId: "job-cheatbook-test-01",
      topic: "Zero-Shot Video Generation",
      niche: "tech",
      tone: "contrarian",
      hookStyle: "contrarian",
      hookText: "Stop scrolling right now. You are doing video creation wrong.",
      hookLatencyMs: 110,
      retentionInterruptCadenceSeconds: 2.8,
      prosodyTagsUsed: ["pause", "emphasis"],
      wordBoundaryCount: 14,
      platform: "tiktok",
      viralityScore: 84,
      recommendations: ["Increase initial visual contrast", "Trim dead air before hook"],
      captionDraft: "The real secret to high-retention video. #tech #viral",
      timestamp: new Date().toISOString(),
    };

    await recordViralityCheatbookEntry(testEntry);

    const entries = await readViralityCheatbook();
    expect(entries.length).toBeGreaterThan(0);
    const found = entries.find((e) => e.jobId === "job-cheatbook-test-01");
    expect(found).toBeDefined();
    expect(found?.hookStyle).toBe("contrarian");
    expect(found?.hookLatencyMs).toBeLessThanOrEqual(200);
    expect(found?.retentionInterruptCadenceSeconds).toBe(2.8);
    expect(found?.prosodyTagsUsed).toEqual(["pause", "emphasis"]);
  });
});
