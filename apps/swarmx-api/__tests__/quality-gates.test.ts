import { describe, expect, it } from "vitest";
import { evaluateQualityGates } from "../src/services/quality-gates.js";
import type { AlignmentContract, BeatPlan, VoiceArtifact } from "@swarmx/types";
import type { PostEncodeLoudness } from "../src/services/audio-mastering.js";

describe("evaluateQualityGates (R8 Quality Verifier)", () => {
  const validVoice: VoiceArtifact = {
    providerId: "kokoro",
    qualityTier: "neural_local",
    outputPath: "/tmp/voice.wav",
    durationSeconds: 30,
    audioSha256: "abc",
    sampleRateHz: 24000,
    channels: 1,
    bitrateKbps: 192,
  };

  const validAlignment: AlignmentContract = {
    schemaVersion: "1.0",
    jobId: "test-qc-1",
    source: "whisper_anchored",
    words: [
      { text: "Hello", startMs: 0, endMs: 500, flags: [] },
      { text: "world.", startMs: 500, endMs: 1000, flags: [] },
    ],
    stats: { coverage: 0.95, nativeDriftMedianMs: 50, maxDriftMs: 120 },
  };

  const validBeatPlan: BeatPlan = {
    schemaVersion: "1.0",
    jobId: "test-qc-1",
    beats: [
      { id: "b1", startMs: 0, endMs: 2200, sceneId: "s1", motion: "zoom", textCard: "hook" },
      { id: "b2", startMs: 2200, endMs: 4500, sceneId: "s2", motion: "pan", textCard: "context" },
      { id: "b3", startMs: 4500, endMs: 7000, sceneId: "s3", motion: "pop", textCard: "cta" },
    ],
  };

  const validLoudness: PostEncodeLoudness = {
    integratedLUFS: -14.2,
    truePeakDBTP: -1.2,
    loudnessRangeLRA: 3.5,
    compliant: true,
  };

  it("passes all 8 gates when all criteria are met", () => {
    // 30s target words: 30 * 2.6 = 78 words. 8 * 9 = 72 words (between 51 and 105).
    const validScript = "This is a valid sentence for the short form video script. ".repeat(7).trim() + " Follow for more!";
    const report = evaluateQualityGates({
      jobId: "test-qc-1",
      script: validScript,
      targetDurationSeconds: 30,
      voiceArtifact: validVoice,
      alignment: validAlignment,
      beatPlan: validBeatPlan,
      loudness: validLoudness,
      resolution: { width: 1080, height: 1920 },
    });

    expect(report.schemaVersion).toBe("1.0");
    expect(report.jobId).toBe("test-qc-1");
    expect(report.passed).toBe(true);

    expect(report.gates["G-S"]!.passed).toBe(true);
    expect(report.gates["G-V"]!.passed).toBe(true);
    expect(report.gates["G-A"]!.passed).toBe(true);
    expect(report.gates["G-P"]!.passed).toBe(true);
    expect(report.gates["G-T"]!.passed).toBe(true);
    expect(report.gates["G-M"]!.passed).toBe(true);
    expect(report.gates["G-C"]!.passed).toBe(true);
    expect(report.gates["G-R"]!.passed).toBe(true);
  });

  it("fails G-S if script is missing terminal punctuation or has excessive ALL-CAPS", () => {
    const report = evaluateQualityGates({
      jobId: "test-qc-2",
      script: "This is a script with UNACCEPTABLE SCREAMING WORDS ALL OVER THE PLACE without ending punctuation",
      targetDurationSeconds: 30,
      voiceArtifact: validVoice,
      alignment: validAlignment,
      beatPlan: validBeatPlan,
      loudness: validLoudness,
    });

    expect(report.passed).toBe(false);
    expect(report.gates["G-S"]!.passed).toBe(false);
    expect(report.gates["G-S"]!.issues.length).toBeGreaterThan(0);
  });

  it("fails G-V if voice is a silent fixture or deviates excessively in duration", () => {
    const validScript = "This is a valid sentence for the short form video script. ".repeat(7).trim() + " Follow for more!";
    const report = evaluateQualityGates({
      jobId: "test-qc-3",
      script: validScript,
      targetDurationSeconds: 30,
      voiceArtifact: {
        ...validVoice,
        qualityTier: "silent_fixture",
        durationSeconds: 5,
      },
      alignment: validAlignment,
      beatPlan: validBeatPlan,
      loudness: validLoudness,
    });

    expect(report.passed).toBe(false);
    expect(report.gates["G-V"]!.passed).toBe(false);
  });

  it("fails G-A if alignment coverage is below threshold", () => {
    const validScript = "This is a valid sentence for the short form video script. ".repeat(7).trim() + " Follow for more!";
    const report = evaluateQualityGates({
      jobId: "test-qc-4",
      script: validScript,
      targetDurationSeconds: 30,
      voiceArtifact: validVoice,
      alignment: {
        ...validAlignment,
        stats: { coverage: 0.55, nativeDriftMedianMs: 800 },
      },
      beatPlan: validBeatPlan,
      loudness: validLoudness,
    });

    expect(report.passed).toBe(false);
    expect(report.gates["G-A"]!.passed).toBe(false);
  });

  it("fails G-A when maximum drift evidence is missing", () => {
    const validScript = "This is a valid sentence for the short form video script. ".repeat(7).trim() + " Follow for more!";
    const report = evaluateQualityGates({
      jobId: "test-qc-6",
      script: validScript,
      targetDurationSeconds: 30,
      voiceArtifact: validVoice,
      alignment: {
        ...validAlignment,
        stats: { coverage: 0.95, nativeDriftMedianMs: 50 },
      },
      beatPlan: validBeatPlan,
      loudness: validLoudness,
    });

    expect(report.passed).toBe(false);
    expect(report.gates["G-A"]!.passed).toBe(false);
    expect(report.gates["G-A"]!.issues).toContain("Alignment maximum drift metric is missing");
  });

  it("fails G-M if loudness or true peak is out of specification", () => {
    const validScript = "This is a valid sentence for the short form video script. ".repeat(7).trim() + " Follow for more!";
    const report = evaluateQualityGates({
      jobId: "test-qc-5",
      script: validScript,
      targetDurationSeconds: 30,
      voiceArtifact: validVoice,
      alignment: validAlignment,
      beatPlan: validBeatPlan,
      loudness: {
        integratedLUFS: -8.5, // Too loud
        truePeakDBTP: 0.5,    // Clipped
        loudnessRangeLRA: 1.0,
        compliant: false,
      },
    });

    expect(report.passed).toBe(false);
    expect(report.gates["G-M"]!.passed).toBe(false);
  });
});
