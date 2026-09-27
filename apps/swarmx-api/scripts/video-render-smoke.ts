import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { VideoJobRequest } from "../src/types/video.js";

const tempOutput = await mkdtemp(join(tmpdir(), "swarmx-video-smoke-"));
process.env["SWARMX_VIDEO_EXPORT_DIR"] = tempOutput;
process.env["SWARMX_VIDEO_ALLOW_STUB_RENDER"] = "0";
// This smoke test validates FFmpeg/FFprobe artifact generation independently of
// host TTS installation. Production renders remain fail-closed unless operators
// explicitly configure this fallback.
process.env["SWARMX_VIDEO_ALLOW_SILENT_AUDIO"] = "1";
process.env["SWARMX_VIDEO_FFMPEG_TIMEOUT_MS"] = "120000";

try {
  const { renderWithFfmpeg } = await import("../src/services/ffmpeg-video-renderer.js");
  const assets = await import("../src/services/video-assets.js");

  const request: VideoJobRequest = {
    prompt: "Create a 15-second faceless short titled '3 focus habits'.",
    platform: "generic",
    niche: "tech",
    targetDurationSeconds: 15,
    clientRequestId: `video-smoke-${randomUUID()}`,
  };

  const result = await renderWithFfmpeg({
    jobId: "smoke",
    request,
    scriptText: [
      "Stop scrolling. These three focus habits compound fast.",
      "Protect one distraction-free block.",
      "Write the next action before starting.",
      "Reset your desk before every session.",
    ].join("\n"),
    storyboardFrames: [
      "Bold opening title over calm workspace.",
      "Timer and notebook close-up.",
      "Checklist with one highlighted next action.",
      "Clean desk reset with final call to action.",
    ],
  });

  const metadata = await assets.buildOutputMetadata({
    jobId: "smoke",
    outputFilename: result.outputFilename,
    scriptText: "smoke",
    storyboardFrames: ["smoke"],
    modelsUsed: {},
    request,
  });

  assert.ok(metadata.fileSizeBytes > 0, "smoke video must be non-empty");
  assert.equal(metadata.format, "mp4");
  assert.ok(metadata.durationSeconds > 0, "smoke video must have duration");
  assert.equal(metadata.widthPx, 720);
  assert.equal(metadata.heightPx, 1280);
  assert.ok(result.renderPackage, "smoke render must include a production package");

  for (const requiredPath of [
    result.renderPackage.thumbnailPath,
    result.renderPackage.rightsManifestPath,
    result.renderPackage.qualityReportPath,
    result.renderPackage.platformPackagePath,
    result.renderPackage.voiceLineagePath,
    result.renderPackage.templateLineagePath,
  ]) {
    await access(requiredPath);
  }

  const platformManifest = JSON.parse(await readFile(result.renderPackage.platformPackagePath, "utf8")) as {
    thumbnailPath?: string;
  };
  assert.equal(platformManifest.thumbnailPath, result.renderPackage.thumbnailPath);

  console.log(`video render smoke passed: ${metadata.relativePath} ${metadata.fileSizeBytes} bytes`);
} finally {
  await rm(tempOutput, { recursive: true, force: true });
}
