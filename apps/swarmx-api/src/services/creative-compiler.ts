import { createHash } from "node:crypto";
import type {
  AudioTimingSpine,
  BackgroundRecipe,
  CreativeCompilerArtifact,
  SceneSpecV2,
} from "@swarmx/types/video-types";

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[\${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{\${Object.keys(record).sort((a, b) => a.localeCompare(b)).map((key) => JSON.stringify(key) + ":" + stable(record[key])).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export function creativeCacheKey(input: {
  creativeDnaId: string;
  scenes: SceneSpecV2[];
  backgroundRecipes: BackgroundRecipe[];
  audioTiming?: AudioTimingSpine;
  rendererVersion: string;
  assetHashesByScene?: Record<string, string[]>;
}): string {
  return sha256({
    creativeDnaId: input.creativeDnaId,
    scenes: input.scenes,
    backgroundRecipes: input.backgroundRecipes,
    audioTiming: input.audioTiming,
    rendererVersion: input.rendererVersion,
    assetHashesByScene: input.assetHashesByScene ?? {},
  });
}

/**
 * A scene-scoped content address. This is intentionally exported separately
 * from CreativeCompilerArtifact so existing API contracts remain compatible.
 * Callers can use it to skip remote/local rendering for unchanged scenes.
 */
export function sceneCacheKey(input: {
  creativeDnaId: string;
  scene: SceneSpecV2;
  backgroundRecipe?: BackgroundRecipe;
  audioTiming?: AudioTimingSpine;
  rendererVersion: string;
  assetHashes?: string[];
}): string {
  const sceneStartMs = Math.max(0, Math.round(input.scene.startSec * 1000));
  const sceneEndMs = Math.max(sceneStartMs, Math.round(input.scene.endSec * 1000));
  const timing = input.audioTiming
    ? {
        words: input.audioTiming.words.filter((word) => word.endMs >= sceneStartMs && word.startMs <= sceneEndMs),
        sections: input.audioTiming.sections.filter((section) => section.endMs >= sceneStartMs && section.startMs <= sceneEndMs),
        beatsMs: input.audioTiming.beatsMs.filter((ms) => ms >= sceneStartMs && ms <= sceneEndMs),
        onsetsMs: input.audioTiming.onsetsMs.filter((ms) => ms >= sceneStartMs && ms <= sceneEndMs),
        silenceWindowsMs: input.audioTiming.silenceWindowsMs.filter((window) => window.endMs >= sceneStartMs && window.startMs <= sceneEndMs),
        accentPointsMs: input.audioTiming.accentPointsMs.filter((ms) => ms >= sceneStartMs && ms <= sceneEndMs),
      }
    : undefined;

  return sha256({
    creativeDnaId: input.creativeDnaId,
    scene: input.scene,
    backgroundRecipe: input.backgroundRecipe,
    audioTiming: timing,
    rendererVersion: input.rendererVersion,
    assetHashes: [...(input.assetHashes ?? [])].sort(),
  });
}

export function deriveAudioTimingSpine(input: {
  durationMs: number;
  words: AudioTimingSpine["words"];
  sections?: AudioTimingSpine["sections"];
  beatsMs?: number[];
  onsetsMs?: number[];
}): AudioTimingSpine {
  const words = [...input.words].sort((a, b) => a.startMs - b.startMs);
  const silenceWindowsMs: AudioTimingSpine["silenceWindowsMs"] = [];
  for (let i = 1; i < words.length; i += 1) {
    const gap = words[i]!.startMs - words[i - 1]!.endMs;
    if (gap >= 350) silenceWindowsMs.push({ startMs: words[i - 1]!.endMs, endMs: words[i]!.startMs });
  }
  const accentPointsMs = words
    .filter((word) => word.endMs - word.startMs >= 420)
    .map((word) => word.startMs);

  return {
    version: 1,
    durationMs: Math.max(0, input.durationMs),
    words,
    sections: input.sections ?? [],
    beatsMs: [...(input.beatsMs ?? [])].sort((a, b) => a - b),
    onsetsMs: [...(input.onsetsMs ?? [])].sort((a, b) => a - b),
    silenceWindowsMs,
    accentPointsMs,
  };
}

export function affectedSceneIds(scenes: SceneSpecV2[], changed: string[]): string[] {
  const normalized = changed.map((value) => value.toLowerCase());
  if (normalized.some((value) => value === "creative_dna" || value === "audio_timing" || value === "renderer")) {
    return scenes.map((scene) => scene.id);
  }

  const sceneIds = new Set<string>();
  for (const change of normalized) {
    const match = /^scene[:/](.+)$/.exec(change);
    if (match?.[1]) sceneIds.add(match[1]);
  }
  return [...sceneIds].filter((id) => scenes.some((scene) => scene.id === id));
}

export function compileCreativeArtifact(input: {
  id: string;
  creativeDnaId: string;
  scenes: SceneSpecV2[];
  backgroundRecipes: BackgroundRecipe[];
  audioTiming?: AudioTimingSpine;
  changed?: string[];
  rendererVersion?: string;
  assetHashesByScene?: Record<string, string[]>;
}): CreativeCompilerArtifact {
  const scenes = [...input.scenes].sort((a, b) => a.startSec - b.startSec);
  let cursor = 0;

  for (const scene of scenes) {
    if (scene.endSec <= scene.startSec) throw new Error(`Invalid scene interval: \${scene.id}`);
    if (scene.startSec < cursor) throw new Error(`Overlapping scene interval: \${scene.id}`);
    cursor = scene.endSec;
    if (scene.background.complexity < 0 || scene.background.complexity > 1) {
      throw new Error(`Invalid background complexity: \${scene.id}`);
    }
    if (scene.background.motionEnergy < 0 || scene.background.motionEnergy > 1) {
      throw new Error(`Invalid background motion energy: \${scene.id}`);
    }
  }

  const changed = input.changed ?? [];
  const rendererVersion = input.rendererVersion ?? "creative-compiler-v2";

  return {
    schemaVersion: 1,
    id: input.id,
    creativeDnaId: input.creativeDnaId,
    scenes,
    backgroundRecipes: [...input.backgroundRecipes],
    ...(input.audioTiming ? { audioTiming: input.audioTiming } : {}),
    invalidation: {
      changed,
      affectedScenes: affectedSceneIds(scenes, changed),
      reason: changed.length === 0 ? "No upstream changes declared" : "Content-addressed downstream invalidation",
    },
    cacheKey: creativeCacheKey({
      creativeDnaId: input.creativeDnaId,
      scenes,
      backgroundRecipes: input.backgroundRecipes,
      ...(input.audioTiming ? { audioTiming: input.audioTiming } : {}),
      rendererVersion,
      assetHashesByScene: input.assetHashesByScene ?? {},
    }),
    createdAt: new Date().toISOString(),
  };
}
