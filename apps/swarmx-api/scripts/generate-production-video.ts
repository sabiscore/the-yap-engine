import { access, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { VideoJobRequest } from "../src/types/video.js";

const exportDir = resolve(process.cwd(), "exports");
await mkdir(exportDir, { recursive: true });

process.env["SWARMX_VIDEO_EXPORT_DIR"] = exportDir;
process.env["SWARMX_VIDEO_ALLOW_STUB_RENDER"] = "0";
process.env["SWARMX_VIDEO_ALLOW_SILENT_AUDIO"] = "0";
process.env["SWARMX_VIDEO_RESOLUTION"] = "720x1280";
process.env["SWARMX_VIDEO_FFMPEG_TIMEOUT_MS"] = "240000";

console.log("[generate-video] starting video generation...");
console.log(`[generate-video] export directory: ${exportDir}`);

const { renderWithFfmpeg } = await import("../src/services/ffmpeg-video-renderer.js");
const assets = await import("../src/services/video-assets.js");

const jobId = `yap-focus-${Date.now()}`;
const request: VideoJobRequest = {
  prompt: "Create a 15-second high-retention short: 3 Immutable Laws of Deep Focus.",
  platform: "tiktok",
  niche: "tech",
  tone: "urgent",
  voiceProfileId: "kokoro_narrator",
  captionStyle: "bold_center",
  targetDurationSeconds: 19,
  clientRequestId: `req-${randomUUID()}`,
};

const scriptText = `[HOOK] Stop scrolling. These three focus habits compound fast.
[BODY] First: Lock in a ninety minute distraction-free block. Second: Write your exact next action before opening tabs.
[RESOLUTION] Third: Reset your workspace completely before every session.
[CTA] Follow for daily high leverage focus frameworks.`;

const storyboardFrames = [
  "High contrast kinetic hook: Stop scrolling text animation.",
  "Minimalist timer and focused workspace closeup.",
  "Checklist highlighting single high leverage action item.",
  "Desk reset with final decisive call to action.",
];

const startTime = Date.now();
const result = await renderWithFfmpeg({
  jobId,
  request,
  scriptText,
  storyboardFrames,
});
const durationMs = Date.now() - startTime;

const finalPath = join(exportDir, result.outputFilename);
await access(finalPath);

const metadata = await assets.buildOutputMetadata({
  jobId,
  outputFilename: result.outputFilename,
  scriptText,
  storyboardFrames,
  modelsUsed: { render_assembly: "ffmpeg" },
  request,
});

console.log("\n=======================================================");
console.log("       THE YAP ENGINE — VIDEO GENERATION COMPLETE      ");
console.log("=======================================================");
console.log(`Job ID:            ${jobId}`);
console.log(`Output File:       ${finalPath}`);
console.log(`File Size:         ${metadata.fileSizeBytes.toLocaleString()} bytes`);
console.log(`Duration:          ${metadata.durationSeconds}s`);
console.log(`Resolution:        ${metadata.widthPx}x${metadata.heightPx} (9:16 vertical)`);
console.log(`Format:            ${metadata.format}`);
console.log(`Render Time:       ${(durationMs / 1000).toFixed(1)}s`);
console.log(`Thumbnail:         ${result.renderPackage.thumbnailPath}`);
console.log(`Quality Report:    ${result.renderPackage.qualityReportPath}`);
console.log(`Platform Package:  ${result.renderPackage.platformPackagePath}`);
console.log("=======================================================\n");

// Probe with ffprobe
const probeProc = spawnSync(
  "ffprobe",
  [
    "-v", "error",
    "-show_entries", "stream=width,height,codec_name,codec_type",
    "-show_entries", "format=duration,format_name",
    "-of", "json",
    finalPath,
  ],
  { encoding: "utf8" }
);

if (probeProc.status === 0 && probeProc.stdout) {
  const probeData = JSON.parse(probeProc.stdout);
  console.log("ffprobe stream verification:");
  console.log(JSON.stringify(probeData, null, 2));
}

if (result.renderPackage.qualityReportPath) {
  try {
    const qcContent = await readFile(result.renderPackage.qualityReportPath, "utf8");
    console.log("\nQuality Control Report:");
    console.log(qcContent);
  } catch {}
}

if (result.renderPackage.voiceLineagePath) {
  try {
    const lineageContent = await readFile(result.renderPackage.voiceLineagePath, "utf8");
    console.log("\nVoice Lineage:");
    console.log(lineageContent);
  } catch {}
}
