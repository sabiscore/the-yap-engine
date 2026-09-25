import { describe, expect, it } from "vitest";
import { backgroundBudget, createBackgroundRecipe, selectBackgroundFamily } from "../src/services/creative-backgrounds.js";
import { compileCreativeArtifact, creativeCacheKey, deriveAudioTimingSpine } from "../src/services/creative-compiler.js";
import type { SceneSpecV2 } from "@swarmx/types/video-types";

const scene = (id: string, startSec: number, endSec: number): SceneSpecV2 => ({
  id,
  purpose: "test",
  startSec,
  endSec,
  narrative: { beat: "HOOK", semanticIntent: "introduce", spokenText: "Hello", emotionalState: "curious" },
  composition: { shotType: "hero", focalPoint: "center", negativeSpace: "right", captionSafeZone: "lower-third" },
  camera: { framing: "medium", movement: "push", depth: 0.3, easing: "ease-out" },
  background: { recipeId: "bg-1", complexity: 0.4, motionEnergy: 0.2, seed: 7 },
  visual: { visualEvent: "REVEAL", transitionIn: "cut", transitionOut: "fade", motif: "light" },
  audio: { beatAnchorsMs: [500], accentPointsMs: [900] },
  caption: { style: "minimal", emphasisWords: ["Hello"] },
});

describe("creative compiler", () => {
  it("derives bounded silence and accent timing", () => {
    const timing = deriveAudioTimingSpine({
      durationMs: 4000,
      words: [
        { word: "hello", startMs: 0, endMs: 250 },
        { word: "world", startMs: 800, endMs: 1400 },
        { word: "again", startMs: 1600, endMs: 2050 },
      ],
    });
    expect(timing.silenceWindowsMs).toEqual([{ startMs: 250, endMs: 800 }]);
    expect(timing.accentPointsMs).toContain(1600);
  });

  it("invalidates only named scenes", () => {
    const scenes = [scene("s1", 0, 2), scene("s2", 2, 4)];
    const artifact = compileCreativeArtifact({
      id: "episode-1",
      creativeDnaId: "dna-1",
      scenes,
      backgroundRecipes: [createBackgroundRecipe({ id: "bg-1", family: "gradient_field" })],
      changed: ["scene:s2"],
    });
    expect(artifact.invalidation.affectedScenes).toEqual(["s2"]);
    expect(artifact.cacheKey).toHaveLength(64);
  });

  it("invalidates all scenes for upstream timing or DNA changes", () => {
    const scenes = [scene("s1", 0, 2), scene("s2", 2, 4)];
    expect(
      compileCreativeArtifact({
        id: "episode-1",
        creativeDnaId: "dna-1",
        scenes,
        backgroundRecipes: [],
        changed: ["audio_timing"],
      }).invalidation.affectedScenes,
    ).toEqual(["s1", "s2"]);
  });

  it("rejects overlapping scenes", () => {
    expect(() => compileCreativeArtifact({
      id: "episode-1",
      creativeDnaId: "dna-1",
      scenes: [scene("s1", 0, 2), scene("s2", 1.5, 3)],
      backgroundRecipes: [],
    })).toThrow(/Overlapping/);
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      creativeDnaId: "dna-1",
      scenes: [scene("s1", 0, 2)],
      backgroundRecipes: [createBackgroundRecipe({ id: "bg-1", family: "gradient_field", seed: 42 })],
      rendererVersion: "v1",
    };
    expect(creativeCacheKey(input)).toBe(creativeCacheKey(input));
  });
});

describe("background system", () => {
  it("reduces complexity under caption and visual competition", () => {
    const sparse = backgroundBudget({ captionDensity: 0.1, subjectSalience: 0.9, visualEventDensity: 0.1 });
    const dense = backgroundBudget({ captionDensity: 0.9, subjectSalience: 0.4, visualEventDensity: 0.9 });
    expect(dense.complexity).toBeLessThan(sparse.complexity);
    expect(dense.motionEnergy).toBeLessThan(sparse.motionEnergy);
  });

  it("falls back to CPU-safe family when resources are constrained", () => {
    expect(selectBackgroundFamily({ visualIntent: "neon energy", resourceClass: "cpu_light" })).toBe("gradient_field");
  });

  it("creates deterministic recipe metadata", () => {
    const a = createBackgroundRecipe({ id: "bg", family: "data_space", seed: 9 });
    const b = createBackgroundRecipe({ id: "bg", family: "data_space", seed: 9 });
    expect(a).toEqual(b);
    expect(a.resourceClass).toBe("gpu_optional");
  });
});
