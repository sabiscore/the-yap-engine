/**
 * Voice Prosody Calibration Loader
 *
 * Loads calibration data from docs/voice-prosody-calibration.json.
 * If absent, falls back to standard defaults and flags uncalibrated.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  VoiceProsodyCalibrationEntry,
  VoiceProsodyCalibrationReport,
} from "@swarmx/types/video-types";
import { log } from "../lib/logger.js";

const CALIBRATION_FILE = join(process.cwd(), "docs", "voice-prosody-calibration.json");

let cachedReport: VoiceProsodyCalibrationReport | null = null;

export async function getVoiceProsodyCalibration(): Promise<{
  report: VoiceProsodyCalibrationReport | null;
  calibrated: boolean;
}> {
  if (cachedReport) {
    return { report: cachedReport, calibrated: true };
  }

  try {
    const content = await readFile(CALIBRATION_FILE, "utf8");
    cachedReport = JSON.parse(content) as VoiceProsodyCalibrationReport;
    return { report: cachedReport, calibrated: true };
  } catch (err) {
    log.warn({
      msg: "Voice prosody calibration file not found; falling back to uncalibrated defaults",
      error: err instanceof Error ? err.message : String(err),
    });
    return { report: null, calibrated: false };
  }
}

export async function getVoiceCalibrationEntry(
  voice: string,
  speed = 1.0,
): Promise<{ entry: VoiceProsodyCalibrationEntry; calibrated: boolean }> {
  const { report, calibrated } = await getVoiceProsodyCalibration();
  const speedKey = speed.toFixed(2);

  if (report?.voices[voice]?.[speedKey]) {
    return { entry: report.voices[voice]![speedKey]!, calibrated: true };
  }

  // Fallback defaults
  return {
    entry: {
      voice,
      speed,
      measuredPausesMs: {
        ellipsis: 1000,
        spacedHyphen: 160,
        paragraphBreak: 400,
        comma: 140,
        sentenceStop: 320,
      },
      wordsPerSecond: 2.5 * speed,
      realTimeFactor: 0.3,
      date: new Date().toISOString(),
      kokoroVersion: "82m-fallback",
    },
    calibrated,
  };
}
