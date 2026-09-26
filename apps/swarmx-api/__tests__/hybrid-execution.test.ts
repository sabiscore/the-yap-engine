import { afterEach, describe, expect, it } from "vitest";
import { resetEnvForTesting } from "../src/lib/env.js";
import { assertEightGbSafe, assertLocalPhase, executionPlaneFor, hybridExecutionPolicy } from "../src/services/hybrid-execution.js";

afterEach(() => {
  delete process.env.SWARMX_PHASE_ABC_EXECUTION;
  delete process.env.OLLAMA_NUM_PARALLEL;
  delete process.env.OLLAMA_MAX_LOADED_MODELS;
  delete process.env.SWARMX_VIDEO_MAX_CONCURRENT_JOBS;
  resetEnvForTesting();
});

describe("hybrid execution policy", () => {
  it("keeps phases A-C local and phase D cloud-capable", () => {
    expect(executionPlaneFor("A")).toBe("local");
    expect(executionPlaneFor("B")).toBe("local");
    expect(executionPlaneFor("C")).toBe("local");
    expect(executionPlaneFor("D")).toBe("cloud");
  });

  it("enforces serialized 8GB-safe execution", () => {
    expect(() => assertEightGbSafe()).not.toThrow();
    process.env.OLLAMA_NUM_PARALLEL = "2";
    resetEnvForTesting();
    expect(() => assertEightGbSafe()).toThrow(/serialized/);
  });

  it("fails closed if the local-only phase policy is changed", () => {
    process.env.SWARMX_PHASE_ABC_EXECUTION = "cloud";
    resetEnvForTesting();
    expect(() => assertLocalPhase("A")).toThrow(/must execute locally/);
  });

  it("exposes a truthful operator policy", () => {
    const policy = hybridExecutionPolicy();
    expect(policy.phaseA.immutable).toBe(true);
    expect(policy.phaseB.plane).toBe("local");
    expect(policy.phaseC.plane).toBe("local");
    expect(policy.maxConcurrentJobs).toBe(1);
    expect(policy.ollamaParallel).toBe(1);
    expect(policy.maxLoadedModels).toBe(1);
  });
});
