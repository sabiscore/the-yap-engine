import type {
  AlignmentContract,
  AlignmentWord,
  BeatPlan,
  BeatPlanEntry,
  VideoQualityGateResult,
} from "@swarmx/types";
import { log } from "../lib/logger.js";

export interface BeatPlannerOptions {
  jobId: string;
  storyboardFrames?: string[] | undefined;
  totalDurationMs: number;
  alignment?: AlignmentContract | undefined;
  scriptText?: string | undefined;
}

export interface BeatPlannerOutput {
  beatPlan: BeatPlan;
  gateResult: VideoQualityGateResult;
}

const DEFAULT_MOTIONS = [
  "kinetic_pop",
  "slow_zoom_in",
  "pan_right_drift",
  "hard_cut_snap",
  "slow_zoom_out",
  "whip_pan_reveal",
  "parallax_float",
];

function extractMotionFromFrame(frameText: string, fallbackIndex: number): string {
  const motionMatch = frameText.match(/motion:\s*([^|\]]+)/i);
  if (motionMatch && motionMatch[1]?.trim()) {
    return motionMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
  }
  return DEFAULT_MOTIONS[fallbackIndex % DEFAULT_MOTIONS.length]!;
}

function extractTextCardFromFrame(frameText: string): string {
  const textMatch = frameText.match(/text:\s*"([^"]+)"/i) ?? frameText.match(/intent:\s*([^|\]]+)/i);
  if (textMatch && textMatch[1]?.trim()) {
    return textMatch[1].trim();
  }
  return frameText.replace(/^\[SCENE\s+\d+\s*\|?\s*[^\]]*\]/i, "").trim().slice(0, 80);
}

function snapToWordBoundary(timeMs: number, words: AlignmentWord[], maxDistanceMs = 400): number {
  if (!words.length) return timeMs;
  let closest = timeMs;
  let minDiff = Infinity;

  for (const w of words) {
    const diffStart = Math.abs(w.startMs - timeMs);
    if (diffStart < minDiff && diffStart <= maxDistanceMs) {
      minDiff = diffStart;
      closest = w.startMs;
    }
    const diffEnd = Math.abs(w.endMs - timeMs);
    if (diffEnd < minDiff && diffEnd <= maxDistanceMs) {
      minDiff = diffEnd;
      closest = w.endMs;
    }
  }

  return closest;
}

export function planBeats(options: BeatPlannerOptions): BeatPlannerOutput {
  const { jobId, totalDurationMs, alignment } = options;
  const rawFrames = options.storyboardFrames && options.storyboardFrames.length > 0
    ? options.storyboardFrames
    : ["HOOK opener", "CONTEXT foundation", "INSIGHT twist", "PROOF validation", "CTA call to action"];

  const safeDuration = Math.max(3000, totalDurationMs);
  const words = alignment?.words ?? [];

  // 1. Initial scene time allocations
  const sceneCount = rawFrames.length;
  const initialBeats: Array<{ sceneId: string; startMs: number; endMs: number; motion: string; textCard: string }> = [];

  for (let i = 0; i < sceneCount; i++) {
    const sceneId = `scene-${String(i + 1).padStart(2, "0")}`;
    const frame = rawFrames[i]!;
    const rawStart = Math.round((i / sceneCount) * safeDuration);
    const rawEnd = Math.round(((i + 1) / sceneCount) * safeDuration);

    const snappedStart = i === 0 ? 0 : snapToWordBoundary(rawStart, words);
    const snappedEnd = i === sceneCount - 1 ? safeDuration : snapToWordBoundary(rawEnd, words);

    initialBeats.push({
      sceneId,
      startMs: snappedStart,
      endMs: Math.max(snappedStart + 400, snappedEnd),
      motion: extractMotionFromFrame(frame, i),
      textCard: extractTextCardFromFrame(frame),
    });
  }

  // Ensure contiguous times across scenes
  for (let i = 1; i < initialBeats.length; i++) {
    initialBeats[i]!.startMs = initialBeats[i - 1]!.endMs;
  }
  initialBeats[initialBeats.length - 1]!.endMs = safeDuration;

  // 2. Split windows > 3.0s into 2.0–2.5s micro-beats
  const splitBeats: Array<{ sceneId: string; startMs: number; endMs: number; motion: string; textCard: string }> = [];
  for (const beat of initialBeats) {
    const dur = beat.endMs - beat.startMs;
    if (dur > 3000) {
      // Split into 2000-2500ms segments
      const targetSegmentDur = 2200;
      const numSegments = Math.max(2, Math.round(dur / targetSegmentDur));
      const segmentDur = Math.round(dur / numSegments);

      let currentStart = beat.startMs;
      for (let s = 0; s < numSegments; s++) {
        const isLast = s === numSegments - 1;
        const targetEnd = isLast ? beat.endMs : currentStart + segmentDur;
        const subEnd = isLast ? beat.endMs : snapToWordBoundary(targetEnd, words, 350);
        const subMotion = DEFAULT_MOTIONS[(s + splitBeats.length) % DEFAULT_MOTIONS.length]!;

        splitBeats.push({
          sceneId: `${beat.sceneId}-b${s + 1}`,
          startMs: currentStart,
          endMs: Math.max(currentStart + 500, subEnd),
          motion: s === 0 ? beat.motion : subMotion,
          textCard: beat.textCard,
        });
        currentStart = Math.max(currentStart + 500, subEnd);
      }
    } else {
      splitBeats.push(beat);
    }
  }

  // Contiguity fix after splits
  for (let i = 1; i < splitBeats.length; i++) {
    splitBeats[i]!.startMs = splitBeats[i - 1]!.endMs;
  }
  splitBeats[splitBeats.length - 1]!.endMs = safeDuration;

  // 3. Merge windows < 0.8s (800ms) with adjacent beat
  const mergedBeats: typeof splitBeats = [];
  for (let i = 0; i < splitBeats.length; i++) {
    const curr = splitBeats[i]!;
    const dur = curr.endMs - curr.startMs;

    if (dur < 800 && mergedBeats.length > 0) {
      const prev = mergedBeats[mergedBeats.length - 1]!;
      if (prev.endMs - prev.startMs + dur <= 3000 || i === splitBeats.length - 1) {
        prev.endMs = curr.endMs;
      } else if (i < splitBeats.length - 1) {
        // Merge into next beat to avoid exceeding 3600ms ceiling on previous
        const next = splitBeats[i + 1]!;
        next.startMs = curr.startMs;
      } else {
        prev.endMs = curr.endMs;
      }
    } else if (dur < 800 && i < splitBeats.length - 1) {
      // Merge into next beat
      const next = splitBeats[i + 1]!;
      next.startMs = curr.startMs;
    } else {
      mergedBeats.push({ ...curr });
    }
  }

  // Final contiguity and bound check
  if (mergedBeats.length > 0) {
    mergedBeats[0]!.startMs = 0;
    for (let i = 1; i < mergedBeats.length; i++) {
      mergedBeats[i]!.startMs = mergedBeats[i - 1]!.endMs;
    }
    mergedBeats[mergedBeats.length - 1]!.endMs = safeDuration;
  }

  // Format BeatPlanEntry items
  const beats: BeatPlanEntry[] = mergedBeats.map((b, idx) => ({
    id: `beat-${String(idx + 1).padStart(2, "0")}`,
    startMs: b.startMs,
    endMs: b.endMs,
    sceneId: b.sceneId,
    motion: b.motion,
    textCard: b.textCard,
  }));

  const beatPlan: BeatPlan = {
    schemaVersion: "1.0",
    jobId,
    beats,
  };

  // 4. Validate Gate G-P (Pacing Gate)
  const issues: string[] = [];
  let minDur = Infinity;
  let maxDur = 0;
  const durations: number[] = [];

  for (const b of beats) {
    const d = b.endMs - b.startMs;
    durations.push(d);
    if (d < minDur) minDur = d;
    if (d > maxDur) maxDur = d;

    if (d < 700) {
      issues.push(`Beat ${b.id} is too short (${d}ms < 700ms minimum threshold)`);
    }
    if (d > 3600) {
      issues.push(`Beat ${b.id} exceeds maximum visual hold duration (${d}ms > 3600ms)`);
    }
  }

  durations.sort((a, b) => a - b);
  const medianDur = durations.length ? durations[Math.floor(durations.length / 2)]! : 0;

  if (beats.length < 3) {
    issues.push(`Insufficient visual beat count (${beats.length} beats < 3 minimum for 9:16 engagement)`);
  }

  const gateResult: VideoQualityGateResult = {
    gate: "G-P",
    name: "Pacing & Visual Cadence Gate",
    passed: issues.length === 0,
    metrics: {
      beatCount: beats.length,
      minDurationMs: minDur === Infinity ? 0 : minDur,
      maxDurationMs: maxDur,
      medianDurationMs: medianDur,
      coverageMs: safeDuration,
    },
    issues,
  };

  log.info({
    jobId,
    service: "beat-planner",
    beatCount: beats.length,
    minDur,
    maxDur,
    medianDur,
    gatePassed: gateResult.passed,
  }, "Beat plan created");

  return { beatPlan, gateResult };
}
