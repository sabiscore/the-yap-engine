import { describe, it, expect, vi, beforeEach } from "vitest";
import { KokoroVoiceProvider, normalizeScriptForSpeech } from "../src/services/voice-providers.js";

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

describe("Kokoro TTS Pipeline - punctuation-only prosody", () => {
  it("strips legacy bracket prosody tags instead of preserving them", () => {
    const input = "**Stop scrolling.** [pause:0.5s] Here is the [emphasis]truth[/emphasis]!";
    const normalized = normalizeScriptForSpeech(input);
    expect(normalized).toContain("Stop scrolling.");
    expect(normalized).toContain("Here is the truth!");
    expect(normalized).not.toMatch(/\[(?:pause|speed|emphasis|\/emphasis)/i);
    expect(normalized).not.toContain("**");
  });

  it("preserves punctuation and paragraph structure used by the TTS prosody policy", () => {
    const input = "First sentence...\n\nSecond sentence - with a deliberate pause.";
    const normalized = normalizeScriptForSpeech(input);
    expect(normalized).toContain("...");
    expect(normalized).toContain("\n\n");
    expect(normalized).toContain(" - ");
  });

  it("rejects empty narration after normalization", () => {
    expect(() => normalizeScriptForSpeech("[HOOK] [VISUAL: only markup]")).toThrow("Narration text is empty");
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
      req: unknown,
      outPath: string,
      provVer: unknown,
      desc: { voiceId: string; displayName: string; locale: string; qualityTier: "neural_local"; license: { state: "approved"; sourceName: string; allowedUses: string[]; attribution: string }; consentRequired: boolean },
      normText: string,
      latency: number,
      fallback?: string,
      prosody?: unknown,
      wordBoundaries?: Array<{ word: string; startMs: number; endMs: number }>,
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
