/**
 * Audio mastering pipeline — EBU R128 two-pass loudness normalization.
 *
 * Runs two FFmpeg passes via spawnSync with args as arrays (never string interpolation).
 * Pass 1 measures input loudness; pass 2 applies linear loudness normalization to target LUFS.
 *
 * Phase 2 elevation also exposes a deterministic ambient-bed mixer. The existing
 * `masterAudio()` contract remains unchanged; callers can opt into `masterAudioWithBed()`
 * when they have a speech stem that must be ducked under an ambient bed.
 */
import { spawnSync } from "node:child_process";
import { log } from "../lib/logger.js";
import type { AudioMasteringRequest, AudioMasteringResult } from "@swarmx/types/video-types";

const AUDIO_PLATFORM_PROFILES = {
  youtube:   { targetLUFS: -14, truePeakCeiling: -1.0 },
  tiktok:    { targetLUFS: -14, truePeakCeiling: -1.0 },
  reels:     { targetLUFS: -16, truePeakCeiling: -1.0 },
  shorts:    { targetLUFS: -14, truePeakCeiling: -1.0 },
  broadcast: { targetLUFS: -23, truePeakCeiling: -1.0 },
} as const;

const SPEECH_TARGET_LUFS = -14;
const AMBIENT_TARGET_LUFS = -26;
const DUCK_FILTER = "sidechaincompress=threshold=0.08:ratio=5:attack=10:release=250";

export class AudioMasteringError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "AudioMasteringError";
    this.code = code;
  }
}

interface LoudnormMeasurement {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  output_i: string;
  output_tp: string;
  target_offset: string;
}

function parseLoudnormJson(stderr: string): LoudnormMeasurement {
  const match = /\{[\s\S]*?"input_i"[\s\S]*?\}/.exec(stderr);
  if (!match) {
    throw new AudioMasteringError(
      "FFmpeg pass 1 did not emit loudnorm JSON in stderr",
      "AUDIO_MASTERING_PASS1_NO_JSON",
    );
  }
  return JSON.parse(match[0]) as LoudnormMeasurement;
}

export async function masterAudio(req: AudioMasteringRequest): Promise<AudioMasteringResult> {
  const profile = AUDIO_PLATFORM_PROFILES[req.platform];
  const sampleRate = req.sampleRate ?? 48000;
  const channels = req.channels ?? 2;
  const bitrate = req.bitrate ?? 192;
  const loudnormBase = `loudnorm=I=${profile.targetLUFS}:TP=${profile.truePeakCeiling}:LRA=11`;

  const pass1Args = ["-i", req.inputPath, "-af", `${loudnormBase}:print_format=json`, "-f", "null", "/dev/null"];
  const pass1 = spawnSync("ffmpeg", pass1Args, { encoding: "utf8" });
  if (pass1.error) throw new AudioMasteringError(`FFmpeg pass 1 failed to start: ${pass1.error.message}`, "AUDIO_MASTERING_PASS1_FAILED");
  if (pass1.status !== 0) throw new AudioMasteringError(`FFmpeg pass 1 exited with code ${pass1.status ?? "null"}`, "AUDIO_MASTERING_PASS1_FAILED");

  const measured = parseLoudnormJson(pass1.stderr);
  const normalizedFilter = [
    loudnormBase,
    "linear=true",
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
  ].join(":");

  const pass2Args = [
    "-i", req.inputPath,
    "-af", normalizedFilter,
    "-ar", String(sampleRate),
    "-ac", String(channels),
    "-c:a", "aac",
    "-b:a", `${bitrate}k`,
    "-y", req.outputPath,
  ];
  const pass2 = spawnSync("ffmpeg", pass2Args, { encoding: "utf8" });
  if (pass2.error) throw new AudioMasteringError(`FFmpeg pass 2 failed to start: ${pass2.error.message}`, "AUDIO_MASTERING_PASS2_FAILED");
  if (pass2.status !== 0) throw new AudioMasteringError(`FFmpeg pass 2 exited with code ${pass2.status ?? "null"}`, "AUDIO_MASTERING_PASS2_FAILED");

  const measuredInputLUFS = parseFloat(measured.input_i);
  const measuredOutputLUFS = parseFloat(measured.output_i);
  const measuredTruePeak = parseFloat(measured.output_tp);
  log.info({ msg: "audio-mastering complete", platform: req.platform, targetLUFS: profile.targetLUFS, measuredInputLUFS, measuredOutputLUFS, measuredTruePeak, sampleRate, channels, bitrate });
  return { outputPath: req.outputPath, measuredInputLUFS, measuredOutputLUFS, measuredTruePeak, platform: req.platform, ffmpegExitCode: pass2.status ?? 0 };
}

export function createAmbientBed(inputDurationSeconds: number, outputPath: string): void {
  const duration = Math.max(1, Math.min(180, Math.ceil(inputDurationSeconds)));
  const args = [
    "-f", "lavfi",
    "-i", `anoisesrc=color=pink:amplitude=0.012:d=${duration}`,
    "-af", "highpass=f=90,lowpass=f=7000,volume=0.24,loudnorm=I=-26:TP=-2:LRA=7",
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", "-y", outputPath,
  ];
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new AudioMasteringError(`Ambient bed generation failed: ${result.error?.message ?? `exit ${result.status ?? "null"}`}`, "AUDIO_AMBIENT_BED_FAILED");
}

export function mixSpeechWithAmbientBed(speechPath: string, ambientPath: string, outputPath: string): void {
  // Input 0 is speech (sidechain source); input 1 is ambience (compressed target).
  const filter = `[1:a][0:a]${DUCK_FILTER}[ducked];[0:a][ducked]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0`;
  const args = [
    "-i", speechPath, "-i", ambientPath,
    "-filter_complex", filter,
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", "-y", outputPath,
  ];
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new AudioMasteringError(`Speech/ambient mix failed: ${result.error?.message ?? `exit ${result.status ?? "null"}`}`, "AUDIO_MIX_FAILED");
}

export function masteringTargets(): { speechLUFS: number; ambientLUFS: number; duckFilter: string } {
  return { speechLUFS: SPEECH_TARGET_LUFS, ambientLUFS: AMBIENT_TARGET_LUFS, duckFilter: DUCK_FILTER };
}

export async function masterAudioWithBed(req: AudioMasteringRequest, speechPath: string, ambientPath: string, mixedPath: string): Promise<AudioMasteringResult> {
  mixSpeechWithAmbientBed(speechPath, ambientPath, mixedPath);
  return masterAudio({ ...req, inputPath: mixedPath });
}
