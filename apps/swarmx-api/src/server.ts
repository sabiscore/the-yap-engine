/**
 * SwarmX Fastify API — Production entry point
 *
 * Production hardening changelog:
 *   [API-FIX-01] pino-pretty transport removed from production. pino-pretty is
 *                a dev-only dependency (~4 MB) that requires a native worker_thread
 *                and adds measurable latency per request. In production, Fastify's
 *                default JSON logger is used — log aggregators (Loki, Datadog,
 *                CloudWatch) ingest NDJSON natively. pino-pretty is only activated
 *                when NODE_ENV !== 'production'.
 *   [API-FIX-02] @fastify/helmet registered before all routes to emit security
 *                headers (HSTS, X-Content-Type-Options, X-Frame-Options, CSP, etc.)
 *                on every response. Without this, the API scores F on security header
 *                scanners and is vulnerable to MIME-sniffing and clickjacking.
 *   [API-FIX-03] CORS allowlist is built entirely from environment variables.
 *                Hardcoded 'http://localhost:3000' origins bypassed the intended
 *                production CORS policy — a hardcoded localhost origin allows any
 *                locally-running page to make credentialed cross-origin requests.
 *   [API-ENH-01] startup error now logs the specific bind error before process.exit(1)
 *                so container log tails show the failure reason (port conflict, EACCES)
 *                instead of just an exit code.
 *   [VIDEO-SERVER-01] videoRoutes registered under /api/video.
 *   [APEX17-MOT-01]  ModelOrchestrator.init() called before background pollers.
 *                    Syncs live Ollama /api/ps state so SINGLE-7B LOCK has an
 *                    accurate baseline before any route handler or poller fires.
 *                    Ultra-router pre-warmed at startup for sub-second first-request
 *                    latency. Previously init() ran after all pollers — fixed here.
 *   [APEX17-MOT-02]  ModelOrchestrator.destroy() now called during graceful shutdown
 *                    AFTER server.close() drains all in-flight HTTP requests. This
 *                    ensures no requestModel() call is in flight when the orchestrator
 *                    tears down, preventing orphaned keep_alive:"0s" eviction fetches
 *                    from racing with process exit.
 *                    Previously destroy() was documented in the header but never
 *                    actually called — a bug that left the Ollama singleton in an
 *                    indeterminate state on SIGTERM.
 *   [API-FIX-04]  Shutdown handler calls ModelOrchestrator.getInstance() directly
 *                 rather than capturing the const declared later in the module.
 *                 Both approaches work because shutdown fires after full module
 *                 initialisation, but getInstance() is more explicit and avoids
 *                 relying on closure-over-const temporal ordering.
 */

import { createConnection } from "node:net";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyWebSocket from "@fastify/websocket";

import { ssePlugin } from "./plugins/sse.js";
import { websocketPlugin } from "./plugins/websocket.js";

import { agentsRouter } from "./routes/agents.js";
import { systemRouter } from "./routes/system.js";
import { workflowsRouter } from "./routes/workflows.js";
import { logsRouter } from "./routes/logs.js";
import { configRouter } from "./routes/config.js";
import { composerRouter } from "./routes/composer.js";
import { metricsRouter } from "./routes/metrics.js";
import { registerModelsRoutes } from "./routes/models.js";
import { videoRoutes } from "./routes/video.js";
import { seriesRoutes, campaignRoutes } from "./routes/series.js";
import { creativeFactoryRoutes } from "./routes/creative-factory.js";

import { startSystemInfoPoller } from "./services/systeminfo.js";
import { startCgroupPoller } from "./services/cgroup.js";
import { startJournaldStream } from "./services/journald.js";
import {
  startV5MetricsPoller,
  broadcastStartupSummary,
} from "./services/v5metrics.js";
import { startPyEventsPoller } from "./services/pyevents.js";
import { startAgentSeedService } from "./services/agentSeed.js";
import { startSwarmMonitor } from "./services/swarm-pressure-monitor.js";
import { startVideoCleanup, stopVideoCleanup } from "./services/video-cleanup.js";
import {
  hydrateSeriesRegistryFromDisk,
  startSeriesCleanup,
  stopSeriesCleanup,
} from "./services/series-registry.js";
import { hydrateVideoQueueFromDisk, setBullMQRuntimeEnabled } from "./services/video-queue.js";
import { hydrateWorkflowRunsFromDisk } from "./services/creative-factory-workflow.js";
import { startVideoWorker, stopVideoWorker } from "./workers/video-worker.js";
import { ModelOrchestrator } from "./services/model-orchestrator.js";
import { fetchBackend } from "./services/backend-fetch-errors.js";
import {
  LOW_RAM_VIDEO_MODEL,
  PILOT_VIDEO_MODEL,
  detectAvailableMemoryMb,
  isLowRamVideoMode,
  shouldAutoEnableLowRamMode,
} from "./services/video-runtime-config.js";
import { loadEnv } from "./lib/env.js";
import { initOtel, shutdownOtel } from "./lib/otel.js";

// Auto-enable LOW_RAM_MODE when physical RAM is below the full-7B threshold.
// MUST run before the first loadEnv() call below: loadEnv() caches its parsed
// result on first call, so mutating process.env afterward has no effect on
// isLowRamVideoMode() (which reads loadEnv().SWARMX_VIDEO_LOW_RAM_MODE from
// the stale cache). shouldAutoEnableLowRamMode() itself only reads the raw
// env value, so calling it pre-cache is safe. Explicit env value always wins.
if (shouldAutoEnableLowRamMode()) {
  process.env["SWARMX_VIDEO_LOW_RAM_MODE"] = "1";
}

// Fail-fast on invalid env before any other module reads process.env.
// Errors are formatted with the invalid key path so operators can fix quickly.
try {
  loadEnv();
} catch (err) {
  process.stderr.write(`[startup] ${(err as Error).message}\n`);
  process.exit(1);
}

const PORT = Number.parseInt(process.env["SWARMX_API_PORT"] ?? "3001", 10);
const HOST = process.env["SWARMX_API_HOST"] ?? "127.0.0.1";
const IS_PRODUCTION = (process.env["NODE_ENV"] ?? "production") === "production";

// ── [API-FIX-03] Build CORS origin list from environment only ───────────────
//
// SWARMX_DASHBOARD_ORIGIN: single trusted origin (e.g. https://swarmx.myapp.com)
// All other origins are rejected with a 403 — no localhost fallback in production.
//
// Dev mode (NODE_ENV !== 'production') additionally allows localhost:3000/3001 so
// `next dev` can reach the API without editing env.local.
function buildAllowedOrigins(): (string | RegExp)[] {
  const origins: (string | RegExp)[] = [];

  const rawDashboardOrigins = process.env["SWARMX_DASHBOARD_ORIGIN"];
  if (rawDashboardOrigins) {
    for (const origin of rawDashboardOrigins.split(",")) {
      const trimmed = origin.trim().replace(/\/$/, "");
      if (trimmed) {
        origins.push(trimmed);
      }
    }
  }

  if (!IS_PRODUCTION) {
    origins.push("http://localhost:3000");
    origins.push("http://127.0.0.1:3000");
    origins.push("http://localhost:3001");
    origins.push("http://127.0.0.1:3001");
  }

  // [API-FIX-04] Local production runs often use next start with NODE_ENV=production.
  // If no explicit origin was configured and API is loopback-only, allow local dashboard origins.
  const isLoopbackHost =
    HOST === "127.0.0.1" ||
    HOST === "0.0.0.0" ||
    HOST === "localhost" ||
    HOST === "::" ||
    HOST === "::1";

  if (origins.length === 0 && isLoopbackHost) {
    origins.push("http://localhost:3000");
    origins.push("http://127.0.0.1:3000");
  }

  return origins;
}

// ── Logger — [API-FIX-01] JSON in production, pretty-print in development ────
const server = Fastify({
  logger: IS_PRODUCTION
    ? {
        level: process.env["LOG_LEVEL"] ?? "info",
      }
    : {
        level: process.env["LOG_LEVEL"] ?? "debug",
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss Z" },
        },
      },
  requestTimeout: 30_000,
  bodyLimit: 1_048_576,
});

// ── [API-FIX-02] Security headers via @fastify/helmet ────────────────────────
await server.register(fastifyHelmet, {
  contentSecurityPolicy: false,
});

// ── OpenTelemetry — conditional SDK activation ────────────────────────────────
// No-op when OTEL_EXPORTER_OTLP_ENDPOINT is not set (default on this CPU-only host).
// When set, activates BatchSpanProcessor so video.orchestration / video.stage spans
// are exported to the configured OTLP collector.
initOtel(server.log);

// Log Ollama CPU performance profile at boot so operators can diagnose
// throughput regressions without inspecting env files.
{
  const _e = loadEnv();
  server.log.info({
    numParallel: _e.OLLAMA_NUM_PARALLEL,
    flashAttention: _e.OLLAMA_FLASH_ATTENTION,
    kvCacheType: _e.OLLAMA_KV_CACHE_TYPE,
    numThreads: _e.OLLAMA_NUM_THREADS,
    maxLoadedModels: _e.OLLAMA_MAX_LOADED_MODELS,
  }, "ollama: CPU performance profile");

  // Intentional escape hatch: SWARMX_VIDEO_API_TOKEN must never be cached in a logged object.
  if (_e.NODE_ENV === "production" && !(process.env["SWARMX_VIDEO_API_TOKEN"]?.trim())) {
    server.log.warn(
      "SWARMX_VIDEO_API_TOKEN is not set — all video/series write routes are BLOCKED in production. Set the token to enable write access.",
    );
  }
}

// ── [API-FIX-03] CORS — allowlist-only ───────────────────────────────────────
await server.register(fastifyCors, {
  origin: buildAllowedOrigins(),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept", "Authorization", "x-video-api-key"],
});

// ── WebSocket and SSE plugins ────────────────────────────────────────────────
await server.register(fastifyWebSocket);
await server.register(ssePlugin);
await server.register(websocketPlugin);

// ── Route registration ───────────────────────────────────────────────────────
await server.register(agentsRouter,    { prefix: "/api/agents" });
await server.register(systemRouter,    { prefix: "/api/system" });
await server.register(workflowsRouter, { prefix: "/api/workflows" });
await server.register(logsRouter,      { prefix: "/api/logs" });
await server.register(configRouter,    { prefix: "/api/config" });
await server.register(composerRouter,  { prefix: "/api/composer" });
await server.register(metricsRouter,   { prefix: "/api/metrics" });
await server.register(videoRoutes,     { prefix: "/api/video" });
await server.register(seriesRoutes,    { prefix: "/api/video/series" });
await server.register(campaignRoutes,  { prefix: "/api/video/campaign" });
await server.register(creativeFactoryRoutes, { prefix: "/api/video/factory" });
await registerModelsRoutes(server);

const restoredVideoJobs = hydrateVideoQueueFromDisk();
const restoredSeries = hydrateSeriesRegistryFromDisk();
const restoredWorkflowRuns = hydrateWorkflowRunsFromDisk();
server.log.info(
  { restoredVideoJobs, restoredSeries, restoredWorkflowRuns },
  "durable-state: API registries hydrated",
);

// ── Health check ──────────────────────────────────────────────────────────────
// Probed by docker-compose healthcheck and Kubernetes liveness probes.
// Must remain at /health (not /api/health) — see [DC-FIX-02] in docker-compose.yml.
server.get("/health", { logLevel: "silent" }, async () => ({
  status: "ok",
  ts: Date.now(),
  version: process.env["npm_package_version"] ?? "unknown",
}));

// ── [APEX17-MOT-01] ModelOrchestrator — initialize BEFORE background pollers ─
//
// Initialises the RAM-aware orchestrator singleton. Pre-warms the ultra-router
// so first-request latency is sub-second. All video-orchestrator and composer
// calls route through this singleton for concurrent 7B model safety.
//
// ORDERING FIX: init() must run before startSwarmMonitor and other pollers.
// Previously it ran after all pollers — if any poller triggered model-related
// logic before init() completed, the SINGLE-7B LOCK state was a stale empty set.
try {
  await ModelOrchestrator.getInstance().init();
  server.log.info(
    { ultraRouter: process.env["SWARM_MODEL_ULTRA_ROUTER"] ?? "route-phi4-lite-q4km-prod" },
    "ModelOrchestrator initialized — SINGLE-7B LOCK active",
  );

  // Video runtime mode summary — one line, actionable on cold-start audits.
  server.log.info(
    {
      lowRamMode: isLowRamVideoMode(),
      availableMb: detectAvailableMemoryMb(),
      videoModel: isLowRamVideoMode() ? LOW_RAM_VIDEO_MODEL : "default (7B planning path)",
    },
    "Video pipeline runtime mode resolved",
  );

  // Fire-and-forget prewarm of the Pilot text model at startup. Cold model
  // load on CPU takes 100–140 s; warming during boot moves that latency off
  // the user path. On 16 GB, prewarms the full Pilot; on 8 GB (low-RAM mode),
  // prewarms the lite Pilot. Both paths write the warmup status marker so the
  // dashboard shows a dynamic cold-start ETA via /api/system/health → warmup.
  if (loadEnv().SWARMX_MODEL_STARTUP_PREWARM === "1") {
    const prewarmTag = isLowRamVideoMode() ? LOW_RAM_VIDEO_MODEL : PILOT_VIDEO_MODEL;
    const keepAliveSecs = loadEnv().OLLAMA_KEEP_ALIVE_PILOT_S;
    const ollamaUrl = loadEnv().OLLAMA_HOST ?? loadEnv().SWARMX_OLLAMA_URL ?? "http://127.0.0.1:11434";
    void fetchBackend(`${ollamaUrl}/api/generate`, {
      backend: "ollama",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: prewarmTag,
        prompt: "warm",
        stream: false,
        keep_alive: `${keepAliveSecs}s`,
        options: { num_predict: 8, num_ctx: 2048 },
      }),
    })
      .then(async () => {
        server.log.info({ model: prewarmTag, keepAliveSecs }, "video model prewarm complete");
        const warmupFile = loadEnv().SWARMX_WARMUP_STATUS_FILE;
        const { writeFile } = await import("node:fs/promises");
        await writeFile(
          warmupFile,
          JSON.stringify({ done: true, completedAt: new Date().toISOString() }),
          "utf8",
        ).catch(() => {});
      })
      .catch((err: unknown) => server.log.warn({ err, model: prewarmTag }, "video model prewarm skipped"));
  }
} catch (err) {
  server.log.warn({ err }, "ModelOrchestrator init failed — video pipeline may degrade");
}

// ── Background pollers ────────────────────────────────────────────────────────
// Start AFTER ModelOrchestrator.init() so pollers see a warmed state.
startSystemInfoPoller(server);

let stopSwarmMonitor: () => void = () => {};
stopSwarmMonitor = startSwarmMonitor(
  (event, data) => server.log.debug({ event, data }, "swarm event"),
  10_000, // poll every 10s
);

startCgroupPoller(server);
startV5MetricsPoller(server);
startPyEventsPoller(server);       // [V5.9-FIX-05] bridge Python journal events to SSE
startAgentSeedService(server);     // [V6.1-FIX-15] Seed idle agents from catalog on API boot.
broadcastStartupSummary(server);   // [V6.1-ENH-01] Broadcast the Python startup summary to SSE clients after boot
startVideoCleanup();               // Best-effort periodic removal of exports/artifacts older than TTL
startSeriesCleanup();              // Best-effort periodic eviction of series plans older than TTL
await startJournaldStream(server);

// ── BullMQ Worker ─────────────────────────────────────────────────────────────
// Probe Redis via TCP before starting the Worker. On failure: warn + fall back
// to in-memory queue; never crash startup. The env default is "1" (enabled).
{
  const { SWARMX_VIDEO_USE_BULLMQ, REDIS_URL: probeUrl } = loadEnv();
  if (SWARMX_VIDEO_USE_BULLMQ === "1") {
    const redisReachable = await new Promise<boolean>((resolve) => {
      const parsed = new URL(probeUrl);
      const host = parsed.hostname;
      const port = parseInt(parsed.port || "6379", 10);
      const socket = createConnection({ host, port });
      const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 3_000);
      socket.on("connect", () => { clearTimeout(timer); socket.destroy(); resolve(true); });
      socket.on("error", () => { clearTimeout(timer); resolve(false); });
    });

    if (redisReachable) {
      setBullMQRuntimeEnabled(true);
      startVideoWorker();
      server.log.info({ redis: probeUrl }, "bullmq: Redis reachable — Worker started");
    } else {
      setBullMQRuntimeEnabled(false);
      server.log.warn(
        { redis: probeUrl },
        "bullmq: Redis unreachable — falling back to in-memory queue",
      );
    }
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// tini (PID 1 in the container) forwards SIGTERM here. Fastify.close() drains
// all in-flight requests before the process exits.
//
// Shutdown sequence (order is load-bearing):
//   1. stopSwarmMonitor() — stop background pressure polling
//   2. server.close()     — drain all in-flight HTTP requests (model calls complete)
//   3. destroy()          — tear down ModelOrchestrator after requests settle
//   4. process.exit(0)
//
// [APEX17-MOT-02] destroy() MUST run after server.close() so no requestModel()
// call is in flight when the orchestrator cancels pending warmup and awaits any
// in-flight eviction promise.
let isShuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  server.log.info({ signal }, "Shutdown signal received — draining requests…");

  // Step 1 — stop background poller (non-critical; swallow errors)
  try {
    stopSwarmMonitor();
  } catch (err) {
    server.log.warn({ err }, "Failed to stop swarm monitor during shutdown");
  }

  // Step 2 — drain in-flight HTTP requests
  try {
    await server.close();
    server.log.info("Server closed — all requests drained");
  } catch (err) {
    server.log.error({ err }, "Error while closing server");
  }

  // Step 3 — stop cleanup timers (unref'd; won't block exit, but stop cleanly)
  stopVideoCleanup();
  stopSeriesCleanup();

  // Step 3.5 — drain BullMQ Worker (waits for in-flight job to finish)
  try {
    await stopVideoWorker();
  } catch (err) {
    server.log.warn({ err }, "BullMQ Worker stop failed — continuing shutdown");
  }

  // Step 3.7 — flush and shut down OTel SDK (exports any buffered spans before exit)
  try {
    await shutdownOtel();
  } catch (err) {
    server.log.warn({ err }, "OTel shutdown failed — continuing");
  }

  // Step 4 — [APEX17-MOT-02] destroy orchestrator AFTER requests are drained
  // Uses getInstance() directly: the singleton already exists from init() above.
  // This avoids relying on closure-over-const temporal ordering (see [API-FIX-04]).
  try {
    await ModelOrchestrator.getInstance().destroy();
    server.log.info("ModelOrchestrator destroyed — eviction state settled");
  } catch (err) {
    server.log.warn({ err }, "ModelOrchestrator destroy failed — continuing shutdown");
  }

  // Step 5 — exit cleanly
  process.exit(0);
};

process.on("unhandledRejection", (reason: unknown) => {
  server.log.fatal({ reason: String(reason) }, "unhandledRejection — exiting");
  process.exit(1);
});
process.on("uncaughtException", (err: Error) => {
  server.log.fatal({ err }, "uncaughtException — exiting");
  process.exit(1);
});

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT",  () => void shutdown("SIGINT"));

// ── Listen ────────────────────────────────────────────────────────────────────
try {
  await server.listen({ port: PORT, host: HOST });
  server.log.info(
    { host: HOST, port: PORT, pid: process.pid, env: process.env["NODE_ENV"] },
    "SwarmX API ready",
  );
} catch (err) {
  server.log.error({ err }, "Failed to bind server — check port conflict or permissions");
  process.exit(1);
}
