/**
 * System routes — `/api/system`
 * Exposes OS-level metrics, systemd unit listing, and structured health check.
 * [V5.9-ENH-01] Added /health endpoint: Ollama probe + model readiness + config summary.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import si from "systeminformation";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { getAvailableModels, fastHealthProbe } from "../services/ollama.js";
import { getSwarmHealthSummary } from "../services/swarm-pressure-monitor.js";
import { resolveRuntimeProfile } from "../services/runtime-profiles.js";
import type { LoadedVoiceBenchmark } from "../services/voice-benchmark-report.js";
import { readVoiceBenchmarkReport } from "../services/voice-benchmark-report.js";
import { loadEnv } from "../lib/env.js";
import { resolveCanonicalTag } from "@swarmx/types/operator-map";

const execFileAsync = promisify(execFile);

export function getCanonicalModelTriad() {
  const e = loadEnv();
  return [
    {
      role: "router",
      tag: resolveCanonicalTag(e.SWARMX_MODEL_ULTRA_ROUTER),
      gguf: "microsoft_Phi-4-mini-instruct-Q8_0.gguf",
    },
    {
      role: "reason",
      tag: resolveCanonicalTag(e.SWARMX_MODEL_REASON),
      gguf: "DeepSeek-R1-Distill-Qwen-7B-Q5_K_M.gguf",
    },
    {
      role: "code",
      tag: resolveCanonicalTag(e.SWARMX_MODEL_CODE),
      gguf: "Qwen2.5-7B-Instruct-Q5_K_M.gguf",
    },
  ] as const;
}

export function getSystemHealthModelConfig() {
  const e = loadEnv();
  return {
    modelRouter: resolveCanonicalTag(e.SWARMX_MODEL_ULTRA_ROUTER),
    modelFast: resolveCanonicalTag(e.SWARMX_MODEL_FAST),
    modelReason: resolveCanonicalTag(e.SWARMX_MODEL_REASON),
    modelCode: resolveCanonicalTag(e.SWARMX_MODEL_CODE),
  };
}

type ModelStatus = "ready" | "missing" | "error";

export interface ModelReadiness {
  role: string;
  tag: string;
  gguf: string;
  status: ModelStatus;
  error?: string;
}

// Bounds validation (250–10 000 ms) is handled by the Zod schema in env.ts.
export function getSystemHealthLivenessTimeoutMs(): number {
  return loadEnv().SWARMX_SYSTEM_HEALTH_PROBE_TIMEOUT_MS;
}

export function getSystemHealthModelTimeoutMs(): number {
  return loadEnv().SWARMX_SYSTEM_HEALTH_MODEL_PROBE_TIMEOUT_MS;
}

export function buildVoiceFallbackWarning(voiceBenchmark: LoadedVoiceBenchmark | null): string | null {
  if (!voiceBenchmark || voiceBenchmark.stale) {
    return null;
  }

  const kokoro = voiceBenchmark.report.measurements.find((measurement) => measurement.providerId === "kokoro");
  if (!kokoro || kokoro.probeState === "available") {
    return null;
  }

  const recommendedProviderId = voiceBenchmark.report.recommendedProviderId;
  if (!recommendedProviderId || recommendedProviderId === "kokoro") {
    return null;
  }

  const recommended = voiceBenchmark.report.measurements.find((measurement) => measurement.providerId === recommendedProviderId);
  const qualityTier = recommended?.qualityTier ?? "unknown quality";
  return `Kokoro is ${kokoro.probeState}; voice generation will use ${recommendedProviderId} (${qualityTier}) until the Kokoro service recovers.`;
}

// ─── Warmup status (V6.2.26) ─────────────────────────────────────────────────
// startup-enhanced.sh writes a small JSON marker when the Ollama warmup finishes.
// The dashboard uses `coldStartEtaSecs` to render an accurate "Loading Model"
// countdown instead of the previous hardcoded 140 s literal.
const DEFAULT_COLD_START_ETA_SECS = 140;

export interface WarmupStatus {
  done: boolean;
  coldStartEtaSecs: number;       // 0 when done; otherwise remaining seconds
  startedAt?: string;
  completedAt?: string;
  source: "file" | "default";
}

export function readWarmupStatus(nowMs: number = Date.now()): WarmupStatus {
  const filePath = loadEnv().SWARMX_WARMUP_STATUS_FILE;
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as {
      done?: boolean;
      startedAt?: string;
      completedAt?: string;
    };
    if (parsed.done === true) {
      return {
        done: true,
        coldStartEtaSecs: 0,
        ...(parsed.startedAt ? { startedAt: parsed.startedAt } : {}),
        ...(parsed.completedAt ? { completedAt: parsed.completedAt } : {}),
        source: "file",
      };
    }
    let remaining = DEFAULT_COLD_START_ETA_SECS;
    if (parsed.startedAt) {
      const startedMs = Date.parse(parsed.startedAt);
      if (Number.isFinite(startedMs)) {
        remaining = Math.max(
          0,
          DEFAULT_COLD_START_ETA_SECS - Math.floor((nowMs - startedMs) / 1000),
        );
      }
    }
    return {
      done: false,
      coldStartEtaSecs: remaining,
      ...(parsed.startedAt ? { startedAt: parsed.startedAt } : {}),
      source: "file",
    };
  } catch {
    return {
      done: false,
      coldStartEtaSecs: DEFAULT_COLD_START_ETA_SECS,
      source: "default",
    };
  }
}

export function unavailableModelReadiness(): ModelReadiness[] {
  return getCanonicalModelTriad().map((model) => ({
    ...model,
    status: "error" as ModelStatus,
    error: "Ollama unreachable",
  }));
}

async function probeOllamaModels(): Promise<ModelReadiness[]> {
  // [V6.1-FIX-13] Use centralized resilient service
  const results: ModelReadiness[] = [];
  const canonicalModelTriad = getCanonicalModelTriad();
  const listedTags = (await getAvailableModels()).map((t) => t.toLowerCase());
  if (listedTags.length === 0) {
    for (const m of canonicalModelTriad) {
      results.push({ role: m.role, tag: m.tag, gguf: m.gguf, status: "missing", error: "No installed models discovered" });
    }
    return results;
  }
  for (const m of canonicalModelTriad) {
    const found = listedTags.some(
      (t) => t === m.tag.toLowerCase() || t.startsWith(m.tag.toLowerCase() + ":"),
    );
    results.push({ role: m.role, tag: m.tag, gguf: m.gguf, status: found ? "ready" : "missing" });
  }
  return results;
}

async function probeModelsWithin(
  timeoutMs: number,
): Promise<ModelReadiness[]> {
  const timeoutResult = getCanonicalModelTriad().map((model) => ({
    ...model,
    status: "error" as ModelStatus,
    error: "model readiness probe timeout",
  }));

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      probeOllamaModels(),
      new Promise<ModelReadiness[]>((resolve) => {
        timeoutId = setTimeout(() => resolve(timeoutResult), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function systemRouter(server: FastifyInstance): Promise<void> {
  // ── GET /api/system/health ──────────────────────────────────────────────────
  // [V5.9-ENH-01] Structured health check: Ollama liveness, model triad readiness,
  // memory headroom, and runtime config summary.
  // [V6.1-FIX-18] Uses fastHealthProbe() for liveness so /health never blocks on
  // the full multi-endpoint discovery cycle (which can exceed 10 s under pressure).
  server.get("/health", async (_req: FastifyRequest, reply: FastifyReply) => {
    const livenessTimeoutMs = getSystemHealthLivenessTimeoutMs();
    const modelProbeTimeoutMs = getSystemHealthModelTimeoutMs();

    // System health is polled by every active dashboard. First establish whether
    // Ollama is reachable, then only inspect installed models when it is. This
    // keeps a down Ollama daemon from triggering redundant `/api/tags` discovery
    // and preserves a bounded response time during degraded startup.
    const [ollamaHealth, mem, voiceBenchmark] = await Promise.all([
      fastHealthProbe(livenessTimeoutMs),
      si.mem(),
      readVoiceBenchmarkReport(),
    ]);
    const models = ollamaHealth.reachable
      ? await probeModelsWithin(modelProbeTimeoutMs)
      : unavailableModelReadiness();
    const ollamaUrl = ollamaHealth.endpoint;

    const allReady = models.every((m) => m.status === "ready");
    const ollamaReachable = ollamaHealth.reachable;

    const memGb = {
      totalGb: +(mem.total / 1024 ** 3).toFixed(2),
      usedGb: +(mem.used / 1024 ** 3).toFixed(2),
      availableGb: +(mem.available / 1024 ** 3).toFixed(2),
    };

    // Simple VRAM headroom heuristic: warn if available RAM < 6 GB
    const vramWarning = memGb.availableGb < 6
      ? `Low available memory (${memGb.availableGb.toFixed(1)} GB free) — model loading may fail`
      : null;

    const swarm = getSwarmHealthSummary();
    const voiceFallbackWarning = buildVoiceFallbackWarning(voiceBenchmark);
    const runtimeProfile = resolveRuntimeProfile({
      totalRamMb: Math.floor(mem.total / 1024 ** 2),
      availableRamMb: Math.floor(mem.available / 1024 ** 2),
    });
    const status = runtimeProfile.blockers.length > 0 ? "degraded"
      : !ollamaReachable ? "degraded"
      : !allReady           ? "degraded"
      : vramWarning         ? "warning"
      : "ok";

    // [V6.1-FIX-19] Always return HTTP 200 from /api/system/health.
    // HTTP 503 means the API SERVICE is unavailable — but the API is running fine.
    // When only Ollama is down, status="degraded" conveys the detail without
    // causing monitoring tools, uptime checkers, and load balancers to flip the
    // entire service to "down". 503 is reserved for unhandled fatal errors.
    return reply.code(200).send({
      status,
      ts: new Date().toISOString(),
      ollama: {
        url: ollamaUrl,
        reachable: ollamaReachable,
        latencyMs: ollamaHealth.latencyMs,
      },
      models,
      swarm,
      memory: memGb,
      warmup: readWarmupStatus(),
      voice: {
        preferredProvider: loadEnv().SWARMX_TTS_PROVIDER,
        ...(voiceFallbackWarning ? { fallbackWarning: voiceFallbackWarning } : {}),
        benchmark: voiceBenchmark
          ? {
            generatedAt: voiceBenchmark.report.generatedAt,
            ageHours: +voiceBenchmark.ageHours.toFixed(2),
            stale: voiceBenchmark.stale,
            recommendedProviderId: voiceBenchmark.report.recommendedProviderId,
            recommendationReason: voiceBenchmark.report.recommendationReason,
            providers: voiceBenchmark.report.measurements.map((m) => ({
              id: m.providerId,
              qualityTier: m.qualityTier,
              probeState: m.probeState,
              realTimeFactor: m.realTimeFactor,
              warmLatencyMs: m.warmLatencyMs,
              coldLatencyMs: m.coldLatencyMs,
              failures: m.failures,
            })),
          }
          : null,
      },
      runtimeProfile: {
        id: runtimeProfile.profile.id,
        label: runtimeProfile.profile.label,
        source: runtimeProfile.source,
        requested: runtimeProfile.requested,
        totalRamMb: runtimeProfile.totalRamMb,
        availableRamMb: runtimeProfile.availableRamMb,
        blockers: runtimeProfile.blockers,
        warnings: runtimeProfile.warnings,
        capabilities: {
          allowSecondResidentModel: runtimeProfile.profile.allowSecondResidentModel,
          allowAcceleratedAdapters: runtimeProfile.profile.allowAcceleratedAdapters,
          startupHeavyPreload: runtimeProfile.profile.startupHeavyPreload,
        },
      },
      ...(vramWarning || runtimeProfile.warnings.length > 0
        ? { warnings: [...(vramWarning ? [vramWarning] : []), ...runtimeProfile.warnings] }
        : {}),
      config: (({ e }) => ({
        healthProbeTimeoutMs: livenessTimeoutMs,
        healthModelProbeTimeoutMs: modelProbeTimeoutMs,
        ...getSystemHealthModelConfig(),
        apiPort: e.SWARMX_API_PORT,
        ollamaPerf: {
          numParallel: e.OLLAMA_NUM_PARALLEL,
          flashAttention: e.OLLAMA_FLASH_ATTENTION === "1",
          kvCacheType: e.OLLAMA_KV_CACHE_TYPE,
          numThreads: e.OLLAMA_NUM_THREADS,
          maxLoadedModels: e.OLLAMA_MAX_LOADED_MODELS,
        },
      }))({ e: loadEnv() }),
    });
  });

  // ── GET /api/system ─────────────────────────────────────────────────────────
  // Full system snapshot (on-demand)
  server.get("/", async () => {
    const [load, mem, disk, net, cpu] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.disksIO(),
      si.networkStats(),
      si.cpu(),
    ]);
    return {
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        physicalCores: cpu.physicalCores,
        speed: cpu.speed,
        load1m: load.avgLoad ?? 0,
        perCore: (load.cpus ?? []).map((c) => Math.round(c.load)),
      },
      memory: {
        totalGb: mem.total / (1024 ** 3),
        usedGb: mem.used / (1024 ** 3),
        availableGb: mem.available / (1024 ** 3),
        swapTotalGb: mem.swaptotal / (1024 ** 3),
        swapUsedGb: mem.swapused / (1024 ** 3),
      },
      disk: {
        readBytesPerSec: disk?.rIO_sec ?? 0,
        writeBytesPerSec: disk?.wIO_sec ?? 0,
      },
      network: {
        rxBytesPerSec: (net ?? []).reduce((s, n) => s + (n.rx_sec ?? 0), 0),
        txBytesPerSec: (net ?? []).reduce((s, n) => s + (n.tx_sec ?? 0), 0),
      },
    };
  });

  // systemd unit list (Linux-only)
  server.get("/units", async (_req: FastifyRequest, reply: FastifyReply) => {
    if (process.platform !== "linux") {
      return reply.code(503).send({ error: "systemd not available on this platform" });
    }

    try {
      const { stdout } = await execFileAsync("systemctl", [
        "list-units",
        "--no-pager",
        "--output=json",
        "--all",
        ...((f) => f ? ["--unit", f] : [])(loadEnv().SWARMX_SYSTEMD_FILTER),
      ]);

      interface SystemctlUnit {
        unit: string;
        load: string;
        active: string;
        sub: string;
        description: string;
      }

      const units = (JSON.parse(stdout) as SystemctlUnit[]).map((u) => ({
        name: u.unit,
        loadState: u.load,
        activeState: u.active,
        subState: u.sub,
        description: u.description,
      }));

      return units;
    } catch (err) {
      server.log.warn({ err }, "systemctl list-units failed");
      return reply.code(503).send({ error: "Failed to list systemd units" });
    }
  });

  // ── GET /api/system/integrations ───────────────────────────────────────────
  // Cached >= 60s, reporting Neon, Upstash, Vercel, Render, Ollama, Kokoro, FFmpeg, Slack/Discord, TikTok gate, AWS Phase-D
  let cachedIntegrations: { timestamp: number; data: Record<string, unknown> } | null = null;
  const INTEGRATIONS_CACHE_TTL_MS = 60_000;

  server.get("/integrations", async (_req: FastifyRequest, reply: FastifyReply) => {
    const now = Date.now();
    if (cachedIntegrations && now - cachedIntegrations.timestamp < INTEGRATIONS_CACHE_TTL_MS) {
      return reply.code(200).send({
        ...cachedIntegrations.data,
        cached: true,
      });
    }

    const e = loadEnv();

    let ffmpegAvailable = false;
    let ffprobeAvailable = false;
    try {
      await execFileAsync("ffmpeg", ["-version"]);
      ffmpegAvailable = true;
    } catch {}
    try {
      await execFileAsync("ffprobe", ["-version"]);
      ffprobeAvailable = true;
    } catch {}

    const ollamaProbe = await fastHealthProbe(2000).catch(() => ({ reachable: false, latencyMs: null, endpoint: "" }));
    const voiceBenchmark = await readVoiceBenchmarkReport().catch(() => null);

    const data: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      integrations: {
        neon: {
          configured: Boolean(e.DATABASE_URL || e.NEON_DATA_API_URL || e.NEON_AUTH_URL),
          branch: e.NEON_BRANCH,
          status: Boolean(e.DATABASE_URL || e.NEON_DATA_API_URL) ? "connected" : "unconfigured",
        },
        upstash: {
          configured: Boolean(e.REDIS_URL),
          provider: e.SWARMX_REDIS_PROVIDER,
          status: Boolean(e.REDIS_URL) ? "connected" : "unconfigured",
        },
        vercel: {
          environment: e.VERCEL_ENV ?? null,
          isPreview: e.VERCEL_ENV === "preview",
          isProduction: e.VERCEL_ENV === "production",
        },
        render: {
          backend: e.SWARMX_VIDEO_RENDER_BACKEND,
          modalConfigured: Boolean(e.SWARMX_MODAL_RENDER_URL?.trim()),
          awsConfigured: e.SWARMX_AWS_RENDER_ENABLED === "1",
        },
        ollama: {
          reachable: ollamaProbe.reachable,
          latencyMs: ollamaProbe.latencyMs,
          endpoint: ollamaProbe.endpoint,
        },
        kokoro: {
          configured: Boolean(e.SWARMX_TTS_URL?.trim()),
          endpoint: e.SWARMX_TTS_URL,
          provider: e.SWARMX_TTS_PROVIDER,
          probeState: voiceBenchmark?.report.measurements.find((m) => m.providerId === "kokoro")?.probeState ?? "unknown",
        },
        ffmpeg: {
          available: ffmpegAvailable,
          ffprobeAvailable,
        },
        slackDiscord: {
          slackConfigured: Boolean(e.SWARMX_SLACK_WEBHOOK_URL?.trim()),
          discordConfigured: Boolean(e.SWARMX_DISCORD_WEBHOOK_URL?.trim()),
          notificationsEnabled: Boolean(e.SWARMX_SLACK_WEBHOOK_URL || e.SWARMX_DISCORD_WEBHOOK_URL),
        },
        tiktokGate: {
          enabled: Boolean(e.SWARMX_TIKTOK_CLIENT_KEY),
          apiApproved: e.SWARMX_TIKTOK_API_APPROVED === "1",
          publicPostsEnabled: e.SWARMX_TIKTOK_PUBLIC_POSTS_ENABLED === "1",
        },
        awsPhaseD: {
          renderEnabled: e.SWARMX_AWS_RENDER_ENABLED === "1",
          region: e.AWS_REGION,
          bucketConfigured: Boolean(e.SWARMX_AWS_RENDER_BUCKET?.trim()),
        },
      },
    };

    cachedIntegrations = { timestamp: now, data };

    return reply.code(200).send({
      ...data,
      cached: false,
    });
  });
}
