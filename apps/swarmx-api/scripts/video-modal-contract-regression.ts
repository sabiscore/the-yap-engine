import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const backendSource = await readFile(new URL("../src/services/modal-video-render-backend.ts", import.meta.url), "utf8");
const contract = JSON.parse(await readFile(new URL("../../../contracts/video-segment-render-task.schema.json", import.meta.url), "utf8")) as {
  required?: string[];
};
const pythonSource = await readFile(new URL("../../../src/swarmx/services/video_segment_contract.py", import.meta.url), "utf8");
const modalSource = await readFile(new URL("../../../src/swarmx/services/modal_video_renderer.py", import.meta.url), "utf8");

assert.ok(backendSource.includes("class ModalVideoRenderBackend") || backendSource.includes("ModalVideoRenderBackend"));
assert.ok(backendSource.includes("SWARMX_MODAL_RENDER_URL"));
assert.ok(backendSource.includes("/v1/render"));
assert.ok(backendSource.includes("maxConcurrentSegments: 4"));
assert.ok(backendSource.includes("minContainers"));

assert.deepEqual(contract.required, [
  "jobId",
  "segmentId",
  "prompt",
  "durationSeconds",
  "fps",
  "width",
  "height",
  "seed",
]);
for (const field of contract.required ?? []) {
  assert.ok(pythonSource.includes(field), `Python contract missing ${field}`);
}

assert.ok(modalSource.includes('gpu="L4"'));
assert.ok(modalSource.includes("min_containers=0"));
assert.ok(modalSource.includes("MAX_CONTAINERS"));
assert.ok(modalSource.includes('os.getenv("SWARMX_MODAL_MAX_CONTAINERS", "4")'));
assert.ok(modalSource.includes("modal.Retries(max_retries=2"));
assert.ok(modalSource.includes("render_one.map(validated)"));
assert.ok(modalSource.includes("Wan2.2-TI2V-5B-Diffusers"));
assert.ok(modalSource.includes("FunctionCall.from_id(call_id)"));

console.log("video-modal-contract-regression: PASS");
