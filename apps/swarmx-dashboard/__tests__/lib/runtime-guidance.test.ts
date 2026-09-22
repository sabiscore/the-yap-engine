import { describe, expect, it } from "vitest";
import { getRuntimeGuidance } from "@/lib/runtime-guidance";

describe("getRuntimeGuidance", () => {
  it("returns no notice for an available, unconstrained runtime", () => {
    expect(
      getRuntimeGuidance({
        apiOnline: true,
        ollamaOnline: true,
        pressureLevel: "normal",
        availableMb: 2_400,
      }),
    ).toBeNull();
  });

  it("prioritizes API recovery over an unknown backend state", () => {
    const guidance = getRuntimeGuidance({
      apiOnline: false,
      ollamaOnline: null,
      pressureLevel: "normal",
      availableMb: 2_400,
    });

    expect(guidance).toMatchObject({
      tone: "critical",
      title: "Yap Engine API unavailable",
      blocksSubmission: true,
    });
    expect(guidance?.recoveryHint).toContain("port 3001");
  });

  it("distinguishes Ollama loss while retaining memory context", () => {
    const guidance = getRuntimeGuidance({
      apiOnline: true,
      ollamaOnline: false,
      pressureLevel: "high",
      availableMb: 879,
    });

    expect(guidance).toMatchObject({
      tone: "warning",
      title: "Ollama backend unavailable",
      blocksSubmission: true,
    });
    expect(guidance?.detail).toContain("Memory pressure is also high (879 MB free)");
    expect(guidance?.recoveryHint).toContain("ollama serve");
  });

  it("reports high and critical memory states with distinct severity", () => {
    expect(
      getRuntimeGuidance({
        apiOnline: true,
        ollamaOnline: true,
        pressureLevel: "high",
        availableMb: 1_150,
      }),
    ).toMatchObject({
      tone: "warning",
      title: "Memory pressure high (1,150 MB free)",
      blocksSubmission: false,
    });

    expect(
      getRuntimeGuidance({
        apiOnline: true,
        ollamaOnline: true,
        pressureLevel: "critical",
        availableMb: 879,
      }),
    ).toMatchObject({
      tone: "critical",
      title: "Memory pressure critical (879 MB free)",
      blocksSubmission: true,
    });
  });

  it("reports full-pipeline blockers from structured API health", () => {
    const guidance = getRuntimeGuidance({
      apiOnline: true,
      ollamaOnline: true,
      pressureLevel: "normal",
      availableMb: 7_200,
      healthStatus: "degraded",
      modelReadiness: [
        { role: "router", tag: "route-phi4-lite-q4km-prod", status: "missing" },
        { role: "reason", tag: "reason-deepseekr1-pro-q5km-prod", status: "missing" },
        { role: "code", tag: "code-qwen25-pro-q5km-prod", status: "missing" },
      ],
      runtimeAvailableMb: 5_695,
      runtimeBlockers: ["available RAM below full-pipeline minimum"],
      runtimeWarnings: [],
      voiceBenchmarkRecommendedProviderId: null,
    });

    expect(guidance).toMatchObject({
      tone: "critical",
      title: "Full video pipeline blocked",
      blocksSubmission: true,
    });
    expect(guidance?.detail).toContain("3 required model profiles are not ready");
    expect(guidance?.detail).toContain("Available RAM is 5.6 GB");
    expect(guidance?.recoveryHint).toContain("canonical model set");
  });

  it("blocks full-pipeline submission when CPU load exceeds the safe ceiling", () => {
    const guidance = getRuntimeGuidance({
      apiOnline: true,
      ollamaOnline: true,
      pressureLevel: "normal",
      availableMb: 8_500,
      healthStatus: "ok",
      cpuLoad: 4,
      cpuCoreCount: 4,
    });

    expect(guidance).toMatchObject({
      tone: "critical",
      title: "Full video pipeline blocked",
      blocksSubmission: true,
    });
    expect(guidance?.detail).toContain("CPU load is 100% across 4 cores");
  });

  it("does not block on normal CPU load or absent CPU telemetry", () => {
    expect(
      getRuntimeGuidance({
        apiOnline: true,
        ollamaOnline: true,
        pressureLevel: "normal",
        availableMb: 8_500,
        healthStatus: "ok",
        cpuLoad: 2,
        cpuCoreCount: 4,
      }),
    ).toBeNull();

    expect(
      getRuntimeGuidance({
        apiOnline: true,
        ollamaOnline: true,
        pressureLevel: "normal",
        availableMb: 8_500,
        healthStatus: "ok",
      }),
    ).toBeNull();
  });

  it("warns but does not block when voice provider fallback is active", () => {
    const guidance = getRuntimeGuidance({
      apiOnline: true,
      ollamaOnline: true,
      pressureLevel: "normal",
      availableMb: 8_500,
      healthStatus: "ok",
      voiceFallbackWarning: "Kokoro is unavailable; voice generation will use espeak-ng.",
    });

    expect(guidance).toMatchObject({
      tone: "warning",
      title: "Voice provider fallback active",
      blocksSubmission: false,
    });
    expect(guidance?.detail).toContain("Kokoro is unavailable");
  });
});
