import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const renderer = await readFile(new URL("src/services/ffmpeg-video-renderer.ts", root), "utf8");
const aligner = await readFile(new URL("../../src/swarmx/services/video_caption_aligner.py", root), "utf8");
const modal = await readFile(new URL("../../src/swarmx/services/modal_video_renderer.py", root), "utf8");
const studio = await readFile(new URL("../../apps/swarmx-dashboard/src/app/(dashboard)/video/studio/page.tsx", root), "utf8");

assert.match(renderer, /alignNarrationAudio/);
assert.match(renderer, /SWARMX_VIDEO_REQUIRE_WORD_ALIGNMENT/);
assert.match(renderer, /subtitles=/);
assert.match(renderer, /alignment/);

assert.match(aligner, /word_timestamps=True/);
assert.match(aligner, /SWARMX_WHISPER_DEVICE/);
assert.match(aligner, /word_timestamps=True/);
assert.match(aligner, /\\k/);
assert.match(aligner, /\\c/);
assert.match(aligner, /\\\\t\(0,120/);
assert.match(aligner, /_ass_color/);
assert.match(aligner, /accent_hex/);
assert.match(aligner, /SWARMX_WHISPER_COMPUTE_TYPE/);

assert.match(modal, /gpu="L4"/);
assert.match(modal, /min_containers=0/);
assert.match(modal, /MAX_CONTAINERS/);
assert.match(modal, /Retries\(max_retries=2/);
assert.match(modal, /render_one\.map\(validated\)/);
assert.match(modal, /Wan2\.2-TI2V-5B/);
assert.match(modal, /secrets=\[modal_secret\]/);

assert.match(studio, /useVideoStore/);
assert.match(studio, /submitJob\(request\)/);
assert.match(studio, /Make a Yap/);

console.log("video-quality-path-regression: PASS");
