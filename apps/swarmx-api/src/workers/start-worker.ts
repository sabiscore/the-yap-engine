/**
 * apps/swarmx-api/src/workers/start-worker.ts
 *
 * Dedicated background worker entrypoint for Render (srv-darpk0fpn0mc73dhcri0 / the-yap-engine).
 * Runs the authoritative BullMQ video worker process with strict APEX-21 invariants.
 */

import { createConnection } from "node:net";
import { connect as createTlsConnection } from "node:tls";
import { loadEnv } from "../lib/env.js";
import { log } from "../lib/logger.js";
import { initOtel, shutdownOtel } from "../lib/otel.js";
import { setBullMQRuntimeEnabled, VIDEO_QUEUE_NAME } from "../services/video-queue.js";
import { startVideoWorker, stopVideoWorker } from "./video-worker.js";
import { assertEightGbSafe, assertLocalPhase } from "../services/hybrid-execution.js";
import { ModelOrchestrator } from "../services/model-orchestrator.js";

// Ensure Phase A-C immutable local execution
assertLocalPhase("A");
assertLocalPhase("B");
assertLocalPhase("C");
assertEightGbSafe();

const env = loadEnv();

log.info(
  {
    provider: env.SWARMX_REDIS_PROVIDER,
    queue: VIDEO_QUEUE_NAME,
    concurrency: 1,
    numParallel: env.OLLAMA_NUM_PARALLEL,
    maxLoadedModels: env.OLLAMA_MAX_LOADED_MODELS,
    phaseAbc: env.SWARMX_PHASE_ABC_EXECUTION,
    phaseD: env.SWARMX_PHASE_D_EXECUTION,
    neonDurableState: Boolean(env.DATABASE_URL),
  },
  "the-yap-engine: background worker starting",
);

// OpenTelemetry initialization
initOtel(log);

// Probe Redis connection before launching worker
const probeUrl = env.REDIS_URL;
let redisReachable = false;

try {
  const parsed = new URL(probeUrl);
  const host = parsed.hostname;
  const port = parseInt(parsed.port || (parsed.protocol === "rediss:" ? "6380" : "6379"), 10);

  redisReachable = await new Promise<boolean>((resolve) => {
    const socket = parsed.protocol === "rediss:"
      ? createTlsConnection({ host, port })
      : createConnection({ host, port });
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 5_000);
    socket.on("connect", () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.on("error", () => { clearTimeout(timer); resolve(false); });
  });
} catch (err) {
  log.error({ err: String(err) }, "video-worker: Redis URL parse error");
}

if (!redisReachable) {
  log.fatal(
    { provider: env.SWARMX_REDIS_PROVIDER },
    "video-worker: failed to connect to Redis — worker cannot accept jobs",
  );
  process.exit(1);
}

// Initialize ModelOrchestrator for single-7B lock enforcement during orchestration
try {
  await ModelOrchestrator.getInstance().init();
  log.info("video-worker: ModelOrchestrator initialized — SINGLE-7B LOCK active");
} catch (err) {
  log.warn({ err }, "video-worker: ModelOrchestrator init warning");
}

setBullMQRuntimeEnabled(true);
startVideoWorker();

log.info(
  {
    provider: env.SWARMX_REDIS_PROVIDER,
    queue: VIDEO_QUEUE_NAME,
    status: "listening",
  },
  "the-yap-engine: background worker ready and listening for jobs",
);

// Graceful shutdown handling
let isShuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.info({ signal }, "video-worker: shutdown signal received — draining queue worker");

  try {
    await stopVideoWorker();
  } catch (err) {
    log.error({ err }, "video-worker: error stopping BullMQ worker");
  }

  try {
    await ModelOrchestrator.getInstance().destroy();
  } catch (err) {
    log.warn({ err }, "video-worker: error destroying ModelOrchestrator");
  }

  try {
    await shutdownOtel();
  } catch (err) {
    log.warn({ err }, "video-worker: error shutting down OpenTelemetry");
  }

  log.info("the-yap-engine: background worker exited cleanly");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason: unknown) => {
  log.fatal({ reason: String(reason) }, "video-worker: unhandledRejection");
  process.exit(1);
});

process.on("uncaughtException", (err: Error) => {
  log.fatal({ err }, "video-worker: uncaughtException");
  process.exit(1);
});
