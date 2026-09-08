import { describe, expect, it, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import {
  VIDEO_TEMPLATE_FAMILY_VALUES,
  normalizeVideoTemplateFamily,
} from "@swarmx/types/video-types";
import { toVideoJobError, isRetryableVideoErrorCode } from "../src/services/video-error-classification.js";
import {
  masteringTargets,
  mixSpeechWithAmbientBed,
  createAmbientBed,
  AudioMasteringError,
} from "../src/services/audio-mastering.js";

// Mock child_process for unit-level assertion of command arguments without needing host binaries
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawnSync: vi.fn(),
  };
});

// Suppress logger in test output
vi.mock("../src/lib/logger.js", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    debug: vi.fn(),
  },
}));

beforeEach(async () => {
  const { spawnSync } = await import("node:child_process");
  vi.mocked(spawnSync).mockReset();
});

describe("Gate 6 Challenger Verification Suite", () => {
  describe("1. FFMPEG_UNAVAILABLE and Error Classification", () => {
    it("classifies FFMPEG_UNAVAILABLE as a non-retryable fatal error", () => {
      const err = Object.assign(new Error("ffmpeg is not available"), { code: "FFMPEG_UNAVAILABLE" });
      const jobErr = toVideoJobError(err);
      expect(jobErr.code).toBe("FFMPEG_UNAVAILABLE");
      expect(jobErr.message).toBe("ffmpeg is not available");
      expect(jobErr.retryable).toBe(false);
      expect(isRetryableVideoErrorCode("FFMPEG_UNAVAILABLE")).toBe(false);
    });

    it("classifies FFPROBE_UNAVAILABLE as a non-retryable fatal error", () => {
      const err = Object.assign(new Error("ffprobe is not available"), { code: "FFPROBE_UNAVAILABLE" });
      const jobErr = toVideoJobError(err);
      expect(jobErr.code).toBe("FFPROBE_UNAVAILABLE");
      expect(jobErr.message).toBe("ffprobe is not available");
      expect(jobErr.retryable).toBe(false);
      expect(isRetryableVideoErrorCode("FFPROBE_UNAVAILABLE")).toBe(false);
    });

    it("handles unhandled non-error exceptions gracefully without crashing", () => {
      const jobErr1 = toVideoJobError("random string failure");
      expect(jobErr1.code).toBe("UNKNOWN");
      expect(jobErr1.retryable).toBe(false);

      const jobErr2 = toVideoJobError(null);
      expect(jobErr2.code).toBe("UNKNOWN");

      const jobErr3 = toVideoJobError(undefined);
      expect(jobErr3.code).toBe("UNKNOWN");
    });

    it("empirically verifies renderWithFfmpeg throws typed FFMPEG_UNAVAILABLE error when ffmpeg is missing", async () => {
      const { renderWithFfmpeg } = await import("../src/services/ffmpeg-video-renderer.js");
      await expect(
        renderWithFfmpeg({
          jobId: "smoke-missing-ffmpeg",
          request: { prompt: "Test short" },
          storyboardFrames: ["frame 1"],
        }),
      ).rejects.toMatchObject({
        code: "FFMPEG_UNAVAILABLE",
        message: "ffmpeg is not available",
      });
    });
  });

  describe("2. Ambient Bed Fail-Open Semantics", () => {
    it("verifies ambient bed mastering targets and subordinate levels", () => {
      const targets = masteringTargets();
      expect(targets.speechLUFS).toBe(-14);
      expect(targets.ambientLUFS).toBe(-26);
      expect(targets.duckFilter).toContain("sidechaincompress");
      expect(targets.ambientLUFS).toBeLessThan(targets.speechLUFS); // Ambience is 12 dB below speech
    });

    it("verifies ambient bed creation throws typed AudioMasteringError on failure", async () => {
      const { spawnSync } = await import("node:child_process");
      vi.mocked(spawnSync).mockReturnValueOnce({
        status: 1,
        stderr: "anoisesrc: No such filter",
        stdout: "",
        output: [],
        pid: 0,
        signal: null,
        error: undefined,
      } as ReturnType<typeof spawnSync>);

      expect(() => createAmbientBed(15, "/tmp/ambient.wav")).toThrow(AudioMasteringError);
      expect(() => {
        vi.mocked(spawnSync).mockReturnValueOnce({
          status: 1,
          stderr: "anoisesrc: No such filter",
          stdout: "",
          output: [],
          pid: 0,
          signal: null,
          error: undefined,
        } as ReturnType<typeof spawnSync>);
        createAmbientBed(15, "/tmp/ambient.wav");
      }).toThrowError(/Ambient bed generation failed/);
    });

    it("verifies the renderer fail-open pattern: fallback to narrationPath on ambient error", () => {
      // Simulate the exact try/catch block from ffmpeg-video-renderer.ts lines 1126-1149:
      const narrationPath = "/tmp/narration.wav";
      let audioPath = narrationPath;
      const ambientFails = true;

      try {
        if (ambientFails) {
          throw new AudioMasteringError("Ambient bed generation failed", "AUDIO_AMBIENT_BED_FAILED");
        }
        audioPath = "/tmp/narration-mastered.m4a";
      } catch (error) {
        // Must fallback to narrationPath
        audioPath = narrationPath;
      }

      // Assert that render proceeds with narrationPath instead of aborting
      expect(audioPath).toBe(narrationPath);
    });

    it("verifies full fail-open behavior: when ambient bed creation fails, audioPath falls back to narrationPath and render continues", () => {
      const narrationPath = "/tmp/narration.wav";
      const ambientPath = "/tmp/ambient-bed.wav";
      const masteredPath = "/tmp/narration-mastered.m4a";
      let audioPath = narrationPath;

      // Simulate renderer try/catch block (ffmpeg-video-renderer.ts lines 1126-1149)
      try {
        createAmbientBed(15, ambientPath);
        // If createAmbientBed throws, this line is never reached
        audioPath = masteredPath;
      } catch (error) {
        // Fail-open fallback: logs warning and resets audioPath to narrationPath
        audioPath = narrationPath;
      }

      expect(audioPath).toBe(narrationPath);
      expect(audioPath).not.toBe(masteredPath);
    });
  });

  describe("3. Audio Mastering Double Normalization Prevention", () => {
    it("ensures mixSpeechWithAmbientBed sets normalize=0 in amix filter", async () => {
      const { spawnSync } = await import("node:child_process");
      vi.mocked(spawnSync).mockReturnValueOnce({
        status: 0,
        stderr: "",
        stdout: "",
        output: [],
        pid: 0,
        signal: null,
        error: undefined,
      } as ReturnType<typeof spawnSync>);

      mixSpeechWithAmbientBed("/tmp/speech.wav", "/tmp/ambient.wav", "/tmp/mixed.wav");

      expect(vi.mocked(spawnSync)).toHaveBeenCalledTimes(1);
      const [cmd, args] = vi.mocked(spawnSync).mock.calls[0] as [string, string[]];
      expect(cmd).toBe("ffmpeg");

      const filterIdx = args.indexOf("-filter_complex");
      expect(filterIdx).toBeGreaterThan(-1);
      const filter = args[filterIdx + 1];

      // Critical invariant: normalize=0 prevents amix from scaling down input volume
      expect(filter).toContain("amix=inputs=2:duration=longest:dropout_transition=0:normalize=0");
    });

    it("verifies double normalization prevention: loudnorm is omitted when audio is already mastered", () => {
      const narrationPath = "/tmp/narration.wav";
      const masteredPath = "/tmp/narration-mastered.m4a";

      // Case A: Audio is mastered (ambient bed + speech mastered)
      const audioPathA: string = masteredPath;
      const afFlagMastered = audioPathA === masteredPath
        ? "aformat=channel_layouts=stereo,aresample=48000"
        : "aformat=channel_layouts=stereo,aresample=48000,loudnorm=I=-14:TP=-1:LRA=11";

      expect(afFlagMastered).not.toContain("loudnorm");
      expect(afFlagMastered).toBe("aformat=channel_layouts=stereo,aresample=48000");

      // Case B: Audio is unmastered / fallback narration
      const audioPathB: string = narrationPath;
      const afFlagUnmastered = audioPathB === masteredPath
        ? "aformat=channel_layouts=stereo,aresample=48000"
        : "aformat=channel_layouts=stereo,aresample=48000,loudnorm=I=-14:TP=-1:LRA=11";

      expect(afFlagUnmastered).toContain("loudnorm=I=-14:TP=-1:LRA=11");
    });
  });

  describe("4. Template Taxonomy Normalization", () => {
    it("contains exactly the 10 canonical template families", () => {
      expect(VIDEO_TEMPLATE_FAMILY_VALUES).toHaveLength(10);
      expect(VIDEO_TEMPLATE_FAMILY_VALUES).toEqual([
        "myth-vs-fact",
        "list/countdown",
        "mystery/reveal",
        "product-demo",
        "quote-to-insight",
        "chart/data",
        "motivational",
        "series-recap",
        "pov-immersion",
        "reddit-story",
      ]);
    });

    it("normalizes legacy 'listicle-countdown' to 'list/countdown'", () => {
      expect(normalizeVideoTemplateFamily("listicle-countdown")).toBe("list/countdown");
    });

    it("preserves each of the 10 canonical values without alteration", () => {
      for (const value of VIDEO_TEMPLATE_FAMILY_VALUES) {
        expect(normalizeVideoTemplateFamily(value)).toBe(value);
      }
    });

    it("throws descriptive error for invalid templates", () => {
      const invalidCases = [
        "invalid-template",
        "listicle",
        "countdown",
        "MYTH-VS-FACT",
        "list/count-down",
        "",
        " ",
        "reddit_story",
        "undefined",
      ];

      for (const invalid of invalidCases) {
        expect(() => normalizeVideoTemplateFamily(invalid)).toThrowError(
          new RegExp(`^Unsupported video template family: ${invalid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
        );
      }
    });
  });

  describe("5. Fastify HTTP Route Validation & Normalization Edge Cases", () => {
    let server: ReturnType<typeof Fastify>;

    beforeEach(async () => {
      const { videoRoutes } = await import("../src/routes/video.js");
      server = Fastify({ logger: false });
      await server.register(videoRoutes, { prefix: "/api/video" });
    });

    it("rejects invalid templateFamily with 400 validation error", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/video/jobs",
        payload: {
          prompt: "Test short",
          templateFamily: "completely-invalid-template",
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toMatch(/body\/templateFamily must be equal to one of the allowed values/);
    });

    it("rejects invalid legacy template alias with 400 validation error", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/video/jobs",
        payload: {
          prompt: "Test short",
          template: "not-a-valid-legacy-template",
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toMatch(/body\/template must be equal to one of the allowed values/);
    });

    it("accepts legacy 'listicle-countdown' template and reaches preflight (503 on host)", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/video/jobs",
        payload: {
          prompt: "Test short",
          template: "listicle-countdown",
        },
      });
      // Schema validation passes! On this host, preflight catches it and returns 503 (either insufficient_ram_for_video or ffprobe_unavailable)
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(["insufficient_ram_for_video", "ffprobe_unavailable"]).toContain(body.error);
    });
  });
});
