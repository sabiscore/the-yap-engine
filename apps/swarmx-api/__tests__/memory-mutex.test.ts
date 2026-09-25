import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMemoryMutex, MemoryMutex, MemoryMutexError } from "../src/services/memory-mutex.js";

// Mock model-orchestrator
vi.mock("../src/services/model-orchestrator.js", () => ({
  getModelOrchestrator: vi.fn(() => ({
    unloadAllModels: vi.fn().mockResolvedValue(["instruct-phi4-pro-q8-prod"]),
    unloadModel: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("MemoryMutex", () => {
  let mutex: MemoryMutex;

  beforeEach(async () => {
    mutex = getMemoryMutex();
    await mutex.forceReset();
  });

  it("should initialize in idle state", () => {
    expect(mutex.getCurrentPhase()).toBe("idle");
    expect(mutex.getActiveOwner()).toBeNull();
  });

  it("should acquire and release a phase", async () => {
    await mutex.acquirePhase("llm", "test-job-1");
    expect(mutex.getCurrentPhase()).toBe("llm");
    expect(mutex.getActiveOwner()).toBe("test-job-1");

    await mutex.releasePhase("llm", "test-job-1");
    expect(mutex.getCurrentPhase()).toBe("idle");
    expect(mutex.getActiveOwner()).toBeNull();
  });

  it("should support re-entrancy for the same phase and owner", async () => {
    await mutex.acquirePhase("llm", "test-job-1");
    await expect(mutex.acquirePhase("llm", "test-job-1")).resolves.toBeUndefined();
    await mutex.releasePhase("llm", "test-job-1");
  });

  it("should queue and sequentially execute conflicting phase requests", async () => {
    const executionOrder: string[] = [];

    await mutex.acquirePhase("llm", "job-1");
    executionOrder.push("job-1-acquired-llm");

    const ttsAcquisition = mutex.withPhase("tts", "job-2", async () => {
      executionOrder.push("job-2-executed-tts");
    });

    expect(mutex.getCurrentPhase()).toBe("llm");
    executionOrder.push("job-1-releasing-llm");
    await mutex.releasePhase("llm", "job-1");

    await ttsAcquisition;
    expect(executionOrder).toEqual([
      "job-1-acquired-llm",
      "job-1-releasing-llm",
      "job-2-executed-tts",
    ]);
    expect(mutex.getCurrentPhase()).toBe("idle");
  });

  it("should timeout when lock cannot be acquired within timeout window", async () => {
    await mutex.acquirePhase("llm", "blocking-job");

    await expect(
      mutex.acquirePhase("tts", "starving-job", 50),
    ).rejects.toThrow(MemoryMutexError);
  });

  it("should force reset in emergency situations", async () => {
    await mutex.acquirePhase("render", "stuck-job");
    expect(mutex.getCurrentPhase()).toBe("render");

    await mutex.forceReset();
    expect(mutex.getCurrentPhase()).toBe("idle");
    expect(mutex.getActiveOwner()).toBeNull();
  });
});
