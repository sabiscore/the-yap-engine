import { describe, expect, it } from "vitest";
import { planBeats } from "../src/services/beat-planner.js";
import type { AlignmentContract } from "@swarmx/types";

describe("planBeats (R4 Beat Planner)", () => {
  it("generates default beats when no storyboard frames are provided", () => {
    const result = planBeats({
      jobId: "test-job-1",
      totalDurationMs: 15000,
    });

    expect(result.beatPlan.schemaVersion).toBe("1.0");
    expect(result.beatPlan.jobId).toBe("test-job-1");
    expect(result.beatPlan.beats.length).toBeGreaterThanOrEqual(5);

    // Contiguity check: start of beat i equals end of beat i-1
    for (let i = 1; i < result.beatPlan.beats.length; i++) {
      expect(result.beatPlan.beats[i]!.startMs).toBe(result.beatPlan.beats[i - 1]!.endMs);
    }

    expect(result.beatPlan.beats[0]!.startMs).toBe(0);
    expect(result.beatPlan.beats[result.beatPlan.beats.length - 1]!.endMs).toBe(15000);
    expect(result.gateResult.gate).toBe("G-P");
    expect(result.gateResult.passed).toBe(true);
  });

  it("splits beats longer than 3.0s into micro-beats", () => {
    const result = planBeats({
      jobId: "test-job-2",
      totalDurationMs: 12000,
      storyboardFrames: [
        "- [SCENE 1 | HOOK] Motion: kinetic_zoom | Intent: Attention grab",
        "- [SCENE 2 | BODY] Motion: slow_pan | Intent: Long exposition explanation",
      ],
    });

    // 2 scenes across 12s would normally be 6s each (> 3.0s), so they must be split
    expect(result.beatPlan.beats.length).toBeGreaterThan(2);
    for (const beat of result.beatPlan.beats) {
      const dur = beat.endMs - beat.startMs;
      expect(dur).toBeLessThanOrEqual(3600);
    }
    expect(result.gateResult.passed).toBe(true);
  });

  it("merges beats shorter than 800ms", () => {
    const result = planBeats({
      jobId: "test-job-3",
      totalDurationMs: 4000,
      storyboardFrames: [
        "- [SCENE 1 | HOOK] Motion: snap",
        "- [SCENE 2 | CUT] Motion: pop",
        "- [SCENE 3 | BEAT] Motion: zoom",
        "- [SCENE 4 | BEAT] Motion: whip",
        "- [SCENE 5 | BEAT] Motion: cut",
        "- [SCENE 6 | BEAT] Motion: pan",
        "- [SCENE 7 | CTA] Motion: hold",
      ],
    });

    for (const beat of result.beatPlan.beats) {
      const dur = beat.endMs - beat.startMs;
      expect(dur).toBeGreaterThanOrEqual(700);
    }
    expect(result.beatPlan.beats[0]!.startMs).toBe(0);
    expect(result.beatPlan.beats[result.beatPlan.beats.length - 1]!.endMs).toBe(4000);
  });

  it("snaps beat boundaries to word alignment timestamps", () => {
    const alignment: AlignmentContract = {
      schemaVersion: "1.0",
      jobId: "test-job-4",
      source: "whisper_anchored",
      words: [
        { text: "Stop", startMs: 100, endMs: 450, flags: [] },
        { text: "scrolling", startMs: 500, endMs: 980, flags: [] },
        { text: "now.", startMs: 1020, endMs: 1450, flags: [] },
        { text: "This", startMs: 1800, endMs: 2200, flags: [] },
        { text: "is", startMs: 2250, endMs: 2450, flags: [] },
        { text: "huge.", startMs: 2500, endMs: 3100, flags: [] },
        { text: "Follow", startMs: 3400, endMs: 3800, flags: [] },
        { text: "for", startMs: 3850, endMs: 4050, flags: [] },
        { text: "more.", startMs: 4100, endMs: 4800, flags: [] },
      ],
      stats: { coverage: 1.0, nativeDriftMedianMs: 0 },
    };

    const result = planBeats({
      jobId: "test-job-4",
      totalDurationMs: 5000,
      storyboardFrames: [
        "- [SCENE 1 | HOOK] Motion: zoom",
        "- [SCENE 2 | BODY] Motion: pan",
      ],
      alignment,
    });

    expect(result.beatPlan.beats.length).toBeGreaterThanOrEqual(2);
    // Boundary between beat 1 and beat 2 should snap close to 2200, 2450, or 2500
    const midBoundary = result.beatPlan.beats[0]!.endMs;
    const alignedTimings = [450, 500, 980, 1020, 1450, 1800, 2200, 2250, 2450, 2500, 3100, 3400, 3800];
    const isSnapped = alignedTimings.some((t) => Math.abs(t - midBoundary) <= 50);
    expect(isSnapped).toBe(true);
  });
});
