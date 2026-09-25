import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseSsmlProsody,
  normalizeScriptForSpeechWithSsml,
  KokoroVoiceProvider,
} from "../src/services/voice-providers.js";

// Mock child_process so ffprobe and ffmpeg don't execute real commands in tests
vi.mock("node:child_process", () => ({
  execFile: vi.fn((cmd, args, opts, cb) => {
    const callback = typeof opts === "function" ? opts : cb;
    if (cmd === "ffprobe") {
      callback?.(
        null,
        JSON.stringify({
          streams: [{ sample_rate: "24000", channels: 2 }],
          format: { duration: "1.100" },
        }),
        "",
      );
    } else {
      callback?.(null, "", "");
    }
  }),
}));

// Mock audio-mastering so we don't spawn real ffmpeg in unit tests
vi.mock("../src/services/audio-mastering.js", () => ({
  masterAudio: vi.fn().mockResolvedValue({
    outputPath: "/tmp/mastered.wav",
    measuredInputLUFS: -20.0,
    measuredOutputLUFS: -14.0,
    measuredTruePeak: -1.0,
    platform: "tiktok",
    ffmpegExitCode: 0,
  }),
}));

// Mock probeAudio
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(
      JSON.stringify({
        duration_ms: 1200,
        word_boundaries: [
          { word: "Stop", start_ms: 0, end_ms: 300 },
          { word: "scrolling", start_ms: 300, end_ms: 1200 },
        ],
      }),
    ),
    rename: vi.fn().mockResolvedValue(undefined),
  };
});

describe("Kokoro TTS Pipeline - SSML & Prosody Parsing", () => {
  it("should parse text without tags as single speech segment", () => {
    const segments = parseSsmlProsody("Stop scrolling and listen carefully.");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      type: "speech",
      text: "Stop scrolling and listen carefully.",
      speed: 1.0,
    });
  });

  it("should parse [pause:0.5s] and [pause:300ms] into pause segments", () => {
    const segments = parseSsmlProsody("Attention.[pause:0.5s] This changes everything.[pause:300ms] Look closely.");
    expect(segments).toHaveLength(5);
    expect(segments[0]).toEqual({ type: "speech", text: "Attention.", speed: 1.0 });
    expect(segments[1]).toEqual({ type: "pause", durationSeconds: 0.5 });
    expect(segments[2]).toEqual({ type: "speech", text: "This changes everything.", speed: 1.0 });
    expect(segments[3]).toEqual({ type: "pause", durationSeconds: 0.3 });
    expect(segments[4]).toEqual({ type: "speech", text: "Look closely.", speed: 1.0 });
  });

  it("should adjust speed multiplier when [speed:1.1] is present", () => {
    const segments = parseSsmlProsody("[speed:1.2] Quick breakdown right now.");
    expect(segments).toHaveLength(1);
    expect(segments[0]?.type).toBe("speech");
    expect(segments[0]?.speed).toBe(1.2);
  });

  it("should parse [emphasis] blocks and slightly modulate pace", () => {
    const segments = parseSsmlProsody("Do not make this [emphasis] fatal mistake [/emphasis] today.");
    expect(segments).toHaveLength(3);
    expect(segments[0]?.text).toBe("Do not make this");
    expect(segments[0]?.speed).toBe(1.0);
    expect(segments[1]?.text).toBe("fatal mistake");
    expect(segments[1]?.speed).toBeCloseTo(0.88, 2);
    expect(segments[2]?.text).toBe("today.");
    expect(segments[2]?.speed).toBe(1.0);
  });

  it("should preserve SSML tags during speech script normalization", () => {
    const input = "**Stop scrolling.** [pause:0.5s] Here is the #1 truth you need [emphasis] right now [/emphasis]!";
    const normalized = normalizeScriptForSpeechWithSsml(input);
    expect(normalized).toContain("[pause:0.5s]");
    expect(normalized).toContain("[emphasis]");
    expect(normalized).toContain("[/emphasis]");
    expect(normalized).not.toContain("**");
    expect(normalized).not.toContain("#");
  });
});

describe("KokoroVoiceProvider Word Boundaries & Audio Normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse word boundaries from HTTP response and call masterAudio", async () => {
    const provider = new KokoroVoiceProvider();

    // Mock global fetch
    const mockWordBoundaries = [
      { word: "Stop", start_ms: 0, end_ms: 250 },
      { word: "scrolling", start_ms: 250, end_ms: 800 },
      { word: "now", start_ms: 800, end_ms: 1100 },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        wav_b64: Buffer.from("RIFFtestdataWAVEfmt ").toString("base64"),
        duration_ms: 1100,
        engine: "kokoro",
        word_boundaries: mockWordBoundaries,
      }),
    });

    // Mock artifactBase to verify wordBoundaries and masterAudio without depending on physical file read streams
    vi.spyOn(provider as any, "artifactBase").mockImplementation(async (
      req: any,
      outPath: string,
      provVer: any,
      desc: any,
      normText: string,
      latency: number,
      fallback?: string,
      prosody?: any,
      wordBoundaries?: any[],
    ) => ({
      providerId: "kokoro",
      voiceId: desc.voiceId,
      displayName: desc.displayName,
      locale: desc.locale,
      qualityTier: desc.qualityTier,
      license: desc.license,
      consentRequired: false,
      consentState: "not_required",
      textHash: "hash123",
      normalizedText: normText,
      actualSampleRateHz: 24000,
      channels: 2,
      durationSeconds: 1.1,
      outputPath: outPath,
      sha256: "sha256123",
      generationLatencyMs: latency,
      wordBoundaries,
    }));

    const artifact = await provider.synthesize(
      {
        jobId: "job-kokoro-test",
        text: "Stop scrolling now",
        locale: "en-US",
        voiceId: "am_michael",
        requestedSampleRateHz: 24000,
      },
      "/tmp/output_test.wav",
    );

    expect(artifact.wordBoundaries).toBeDefined();
    expect(artifact.wordBoundaries).toHaveLength(3);
    expect(artifact.wordBoundaries![0]).toEqual({ word: "Stop", startMs: 0, endMs: 250 });
    expect(artifact.wordBoundaries![1]).toEqual({ word: "scrolling", startMs: 250, endMs: 800 });
  });
});
