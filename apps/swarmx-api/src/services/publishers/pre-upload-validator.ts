/**
 * apps/swarmx-api/src/services/publishers/pre-upload-validator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SwarmXQ APEX-19 r1 — Pre-Upload Media Validation Engine
 *
 * Verifies video assets before platform dispatch:
 *  - Container format (MP4 / MOV)
 *  - Video codec (H.264 / HEVC)
 *  - Audio codec (AAC / MP3 / PCM) & stereo channels
 *  - Aspect ratio (vertical 9:16)
 *  - Framerate (24 / 30 / 60 fps)
 *  - Duration (5s to 180s short-form boundaries)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { log } from "../../lib/logger.js";

const execFileAsync = promisify(execFile);

export interface PreUploadValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    containerFormat: string;
    videoCodec: string;
    audioCodec?: string;
    width: number;
    height: number;
    aspectRatio: string;
    fps: number;
    durationSeconds: number;
    audioChannels?: number;
    bitrateKbps?: number;
  };
}

export async function validateVideoPreUpload(filePath: string): Promise<PreUploadValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(filePath)) {
    return {
      valid: false,
      errors: [`Video file does not exist at ${filePath}`],
      warnings: [],
    };
  }

  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=format_name,duration,bit_rate:stream=codec_name,codec_type,width,height,r_frame_rate,channels",
      "-of", "json",
      filePath,
    ]);

    const data = JSON.parse(stdout) as {
      format?: { format_name?: string; duration?: string; bit_rate?: string };
      streams?: Array<{
        codec_name?: string;
        codec_type?: string;
        width?: number;
        height?: number;
        r_frame_rate?: string;
        channels?: number;
      }>;
    };

    const formatName = data.format?.format_name ?? "";
    const duration = parseFloat(data.format?.duration ?? "0");
    const bitrate = data.format?.bit_rate ? Math.round(parseInt(data.format.bit_rate, 10) / 1000) : undefined;

    const videoStream = data.streams?.find((s) => s.codec_type === "video");
    const audioStream = data.streams?.find((s) => s.codec_type === "audio");

    if (!videoStream) {
      return {
        valid: false,
        errors: ["File contains no video stream"],
        warnings: [],
      };
    }

    const videoCodec = videoStream.codec_name?.toLowerCase() ?? "";
    const width = Number(videoStream.width ?? 0);
    const height = Number(videoStream.height ?? 0);
    const audioCodec = audioStream?.codec_name?.toLowerCase();
    const audioChannels = audioStream?.channels !== undefined ? Number(audioStream.channels) : undefined;

    // 1. Container verification
    if (!formatName.includes("mp4") && !formatName.includes("mov")) {
      errors.push(`Invalid container format '${formatName}'. Must be MP4 or MOV.`);
    }

    // 2. Video codec verification
    if (videoCodec !== "h264" && videoCodec !== "hevc") {
      errors.push(`Unsupported video codec '${videoCodec}'. Must be H.264 (recommended) or HEVC.`);
    }

    // 3. Audio codec and channels
    if (!audioStream) {
      warnings.push("Video contains no audio stream (silent).");
    } else {
      if (audioCodec !== "aac" && audioCodec !== "mp3" && audioCodec !== "pcm_s16le") {
        errors.push(`Unsupported audio codec '${audioCodec}'. Must be AAC.`);
      }
      if (audioChannels !== undefined && audioChannels !== 2) {
        warnings.push(`Expected stereo audio (2 channels), found ${audioChannels} channels.`);
      }
    }

    // 4. Aspect ratio (vertical 9:16)
    if (width > 0 && height > 0) {
      const ratio = width / height;
      if (ratio > 0.7) {
        errors.push(`Invalid aspect ratio: ${width}x${height} (${ratio.toFixed(2)}). Vertical 9:16 required.`);
      }
    } else {
      errors.push("Invalid video dimensions: width and height must be > 0.");
    }

    // 5. Framerate verification
    let fps = 30;
    if (videoStream.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
      if (den && den > 0) {
        fps = Math.round((num ?? 30) / den);
      }
    }
    if (fps < 23 || fps > 61) {
      warnings.push(`Unusual framerate ${fps} fps. 30 fps or 60 fps recommended.`);
    }

    // 6. Duration verification for short-form
    if (duration < 5) {
      errors.push(`Duration too short: ${duration.toFixed(1)}s (minimum 5s required).`);
    } else if (duration > 180) {
      errors.push(`Duration too long for short-form: ${duration.toFixed(1)}s (maximum 180s for TikTok/Shorts/Reels).`);
    }

    const metadata = {
      containerFormat: formatName,
      videoCodec,
      ...(audioCodec ? { audioCodec } : {}),
      width,
      height,
      aspectRatio: `${width}:${height}`,
      fps,
      durationSeconds: duration,
      ...(audioChannels !== undefined ? { audioChannels } : {}),
      ...(bitrate ? { bitrateKbps: bitrate } : {}),
    };

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error({ filePath, error: errorMsg }, "pre-upload-validator: probe failed");
    return {
      valid: false,
      errors: [`FFprobe execution failed: ${errorMsg}`],
      warnings: [],
    };
  }
}
