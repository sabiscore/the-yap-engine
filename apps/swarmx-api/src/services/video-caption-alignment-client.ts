import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadEnv } from "../lib/env.js";

export interface CaptionAlignmentArtifacts {
  assPath: string;
  srtPath: string;
  vttPath: string;
  wordTimingPath: string;
}

function run(command: string, args: string[], timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stderr }));
        return;
      }
      resolve();
    });
    const onAbort = () => {
      child.kill("SIGTERM");
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.once("close", () => signal?.removeEventListener("abort", onAbort));
    child.once("error", (error) => signal?.removeEventListener("abort", onAbort));
  });
}

export interface CaptionAlignmentStyleOptions {
  /** 6-digit hex accent color, no `#`/`0x` prefix — pass the renderer's
   * resolved tone/niche accent so the ASS karaoke highlight and the
   * drawtext cards path stay visually consistent. */
  accentHex?: string;
  /** Caption pill-box opacity, 0-1, matched to the renderer's
   * CaptionStyleConfig.boxOpacity for the request's caption style. */
  boxOpacity?: number;
}

export async function alignNarrationAudio(
  jobId: string,
  audioPath: string,
  language = "en",
  signal?: AbortSignal,
  styleOptions: CaptionAlignmentStyleOptions = {},
): Promise<CaptionAlignmentArtifacts> {
  const env = loadEnv();
  const packageDir = join(env.SWARMX_VIDEO_ARTIFACT_DIR, jobId, "alignment");
  await mkdir(packageDir, { recursive: true });

  const artifacts = {
    assPath: join(packageDir, "captions.ass"),
    srtPath: join(packageDir, "captions.aligned.srt"),
    vttPath: join(packageDir, "captions.aligned.vtt"),
    wordTimingPath: join(packageDir, "word-timings.json"),
  };

  await run(
    env.SWARMX_PYTHON,
    [
      "-m",
      "swarmx.services.video_caption_aligner",
      audioPath,
      artifacts.assPath,
      artifacts.srtPath,
      artifacts.vttPath,
      artifacts.wordTimingPath,
      "--language",
      language,
      ...(styleOptions.accentHex ? ["--accent-hex", styleOptions.accentHex] : []),
      ...(styleOptions.boxOpacity !== undefined ? ["--box-opacity", String(styleOptions.boxOpacity)] : []),
    ],
    Math.max(60_000, env.SWARMX_VIDEO_FFMPEG_TIMEOUT_MS),
    signal,
  );

  return artifacts;
}
