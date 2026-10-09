import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
// Suppress logger output in tests
vi.mock("../src/lib/logger.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { spawnSync } from "node:child_process";
import { masterAudio, measurePostEncodeLoudness, AudioMasteringError } from "../src/services/audio-mastering.js";
import type { AudioMasteringRequest } from "@swarmx/types/video-types";

const LOUDNORM_JSON = JSON.stringify({
  input_i: "-23.50",
  input_tp: "-2.30",
  input_lra: "8.50",
  input_thresh: "-33.20",
  output_i: "-14.00",
  output_tp: "-1.00",
  target_offset: "0.30",
});

function makePass1Ok(): ReturnType<typeof spawnSync> {
  return { status: 0, stderr: `[Parsed_loudnorm_0]\n${LOUDNORM_JSON}`, stdout: "", output: [], pid: 0, signal: null, error: undefined } as ReturnType<typeof spawnSync>;
}

function makePass2Ok(): ReturnType<typeof spawnSync> {
  return { status: 0, stderr: "", stdout: "", output: [], pid: 0, signal: null, error: undefined } as ReturnType<typeof spawnSync>;
}

function makeBase(): AudioMasteringRequest {
  return { inputPath: "/tmp/narration.wav", outputPath: "/tmp/mastered.aac", platform: "youtube" };
}

beforeEach(() => {
  vi.mocked(spawnSync).mockReset();
});

describe("masterAudio", () => {
  it("builds correct pass-1 args for youtube (-14 LUFS)", async () => {
    vi.mocked(spawnSync).mockReturnValueOnce(makePass1Ok()).mockReturnValueOnce(makePass2Ok());
    await masterAudio(makeBase());
    const [, args1] = vi.mocked(spawnSync).mock.calls[0] as [string, string[]];
    expect(args1).toContain("-f");
    expect(args1).toContain("null");
    expect(args1.join(" ")).toContain("loudnorm=I=-14:TP=-1:LRA=11");
    expect(args1.join(" ")).toContain("print_format=json");
  });

  it("builds correct pass-1 args for reels (-16 LUFS)", async () => {
    vi.mocked(spawnSync).mockReturnValueOnce(makePass1Ok()).mockReturnValueOnce(makePass2Ok());
    await masterAudio({ ...makeBase(), platform: "reels" });
    const [, args1] = vi.mocked(spawnSync).mock.calls[0] as [string, string[]];
    expect(args1.join(" ")).toContain("loudnorm=I=-16:TP=-1:LRA=11");
  });

  it("injects measured values into pass-2 filter args", async () => {
    vi.mocked(spawnSync).mockReturnValueOnce(makePass1Ok()).mockReturnValueOnce(makePass2Ok());
    await masterAudio(makeBase());
    const [, args2] = vi.mocked(spawnSync).mock.calls[1] as [string, string[]];
    const filterArg = args2[args2.indexOf("-af") + 1];
    expect(filterArg).toContain("measured_I=-23.50");
    expect(filterArg).toContain("measured_TP=-2.30");
    expect(filterArg).toContain("measured_LRA=8.50");
    expect(filterArg).toContain("measured_thresh=-33.20");
    expect(filterArg).toContain("offset=0.30");
    expect(filterArg).toContain("linear=true");
  });

  it("applies default sampleRate=48000, channels=2, bitrate=192 in pass-2 args", async () => {
    vi.mocked(spawnSync).mockReturnValueOnce(makePass1Ok()).mockReturnValueOnce(makePass2Ok());
    await masterAudio(makeBase());
    const [, args2] = vi.mocked(spawnSync).mock.calls[1] as [string, string[]];
    expect(args2).toContain("48000");
    expect(args2).toContain("2");
    expect(args2).toContain("192k");
  });

  it("throws AUDIO_MASTERING_PASS1_FAILED when pass 1 exits non-zero", async () => {
    const fail = { ...makePass1Ok(), status: 1 };
    vi.mocked(spawnSync).mockReturnValueOnce(fail as ReturnType<typeof spawnSync>);
    await expect(masterAudio(makeBase())).rejects.toSatisfy(
      (e: unknown) => e instanceof AudioMasteringError && (e as AudioMasteringError).code === "AUDIO_MASTERING_PASS1_FAILED",
    );
  });

  it("throws AUDIO_MASTERING_PASS2_FAILED when pass 2 exits non-zero", async () => {
    const fail = { ...makePass2Ok(), status: 1 };
    vi.mocked(spawnSync).mockReturnValueOnce(makePass1Ok()).mockReturnValueOnce(fail as ReturnType<typeof spawnSync>);
    await expect(masterAudio(makeBase())).rejects.toSatisfy(
      (e: unknown) => e instanceof AudioMasteringError && (e as AudioMasteringError).code === "AUDIO_MASTERING_PASS2_FAILED",
    );
  });

  it("includes outputPath in the result", async () => {
    vi.mocked(spawnSync).mockReturnValueOnce(makePass1Ok()).mockReturnValueOnce(makePass2Ok());
    const result = await masterAudio(makeBase());
    expect(result.outputPath).toBe("/tmp/mastered.aac");
    expect(result.platform).toBe("youtube");
  });

  it("parses measured LUFS values from loudnorm JSON and returns them", async () => {
    vi.mocked(spawnSync).mockReturnValueOnce(makePass1Ok()).mockReturnValueOnce(makePass2Ok());
    const result = await masterAudio(makeBase());
    expect(result.measuredInputLUFS).toBeCloseTo(-23.5);
    expect(result.measuredOutputLUFS).toBeCloseTo(-14.0);
    expect(result.measuredTruePeak).toBeCloseTo(-1.0);
  });
});


describe("measurePostEncodeLoudness", () => {
  it("parses the final EBU R128 summary and reports compliant measurements", async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stderr: `[Parsed_ebur128_0 @ 0x1] Summary:

 Integrated loudness:
 I: -14.0 LUFS

 Loudness range:
 LRA: 2.0 LU

 True peak:
 Peak: -1.2 dBFS`,
      stdout: "",
      output: [],
      pid: 1,
      signal: null,
      error: undefined,
    } as ReturnType<typeof spawnSync>);

    await expect(measurePostEncodeLoudness("/tmp/final.mp4")).resolves.toEqual({
      integratedLUFS: -14,
      truePeakDBTP: -1.2,
      loudnessRangeLRA: 2,
      compliant: true,
    });
  });

  it("preserves FFmpeg negative-infinity readings for silent audio as non-compliant", async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stderr: `[Parsed_ebur128_0 @ 0x1] Summary:

 Integrated loudness:
 I: -inf LUFS

 Loudness range:
 LRA: 0.0 LU

 True peak:
 Peak: -inf dBFS`,
      stdout: "",
      output: [],
      pid: 1,
      signal: null,
      error: undefined,
    } as ReturnType<typeof spawnSync>);

    await expect(measurePostEncodeLoudness("/tmp/silent-test.mp4")).resolves.toMatchObject({
      integratedLUFS: Number.NEGATIVE_INFINITY,
      truePeakDBTP: Number.NEGATIVE_INFINITY,
      loudnessRangeLRA: 0,
      compliant: false,
    });
  });

  it("fails closed when the measurement subprocess exits unsuccessfully", async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stderr: "measurement failed",
      stdout: "",
      output: [],
      pid: 1,
      signal: null,
      error: undefined,
    } as ReturnType<typeof spawnSync>);

    await expect(measurePostEncodeLoudness("/tmp/final.mp4")).rejects.toSatisfy(
      (error: unknown) => error instanceof AudioMasteringError && error.code === "AUDIO_MEASURE_FAILED",
    );
  });
});
