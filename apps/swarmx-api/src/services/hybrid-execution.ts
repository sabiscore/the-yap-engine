import { loadEnv } from "../lib/env.js";

export type HybridPhase = "A" | "B" | "C" | "D" | "E";
export type ExecutionPlane = "local" | "cloud";

const LOCAL_PHASES = new Set<HybridPhase>(["A", "B", "C"]);
const CLOUD_PHASES = new Set<HybridPhase>(["D"]);

export function executionPlaneFor(phase: HybridPhase): ExecutionPlane {
  if (LOCAL_PHASES.has(phase)) return "local";
  if (CLOUD_PHASES.has(phase)) return "cloud";
  return "local";
}

export function assertLocalPhase(phase: Extract<HybridPhase, "A" | "B" | "C">): void {
  const env = loadEnv();
  if (env.SWARMX_PHASE_ABC_EXECUTION !== "local") {
    throw Object.assign(
      new Error(`Hybrid execution policy violation: Phase ${phase} must execute locally`),
      { code: "PHASE_LOCAL_ONLY" },
    );
  }
}

export function assertEightGbSafe(): void {
  const env = loadEnv();
  if (
    env.OLLAMA_NUM_PARALLEL !== 1 ||
    env.OLLAMA_MAX_LOADED_MODELS !== 1 ||
    env.SWARMX_VIDEO_MAX_CONCURRENT_JOBS !== 1
  ) {
    throw Object.assign(
      new Error("8GB local profile requires serialized Ollama/model/job execution"),
      { code: "LOCAL_RESOURCE_POLICY_VIOLATION" },
    );
  }
}

export function hybridExecutionPolicy() {
  const env = loadEnv();
  return {
    phaseA: { plane: "local" as const, immutable: true },
    phaseB: { plane: "local" as const, immutable: true },
    phaseC: { plane: "local" as const, immutable: true },
    phaseD: {
      plane: "cloud" as const,
      backend: env.SWARMX_AWS_RENDER_ENABLED === "1" ? "aws_fargate" : "local_ffmpeg",
      asynchronous: true,
    },
    phaseE: { plane: "managed_state" as const, neon: Boolean(env.DATABASE_URL), redis: env.SWARMX_REDIS_PROVIDER },
    resourceProfile: env.SWARMX_HOST_PROFILE,
    maxConcurrentJobs: env.SWARMX_VIDEO_MAX_CONCURRENT_JOBS,
    ollamaParallel: env.OLLAMA_NUM_PARALLEL,
    maxLoadedModels: env.OLLAMA_MAX_LOADED_MODELS,
  };
}
