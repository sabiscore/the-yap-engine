import { z } from "zod";
import path from "node:path";

const port = z.coerce.number().int().min(1).max(65535);
const positiveInt = z.coerce.number().int().min(1);
const nonNegativeInt = z.coerce.number().int().min(0);
const boolFlag = z.enum(["0", "1"]).default("0");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  SWARMX_API_PORT: port.default(3001),
  SWARMX_API_HOST: z.string().min(1).default("127.0.0.1"),
  SWARMX_API_INTERNAL: z.string().url().default("http://localhost:7380"),
  SWARMX_DASHBOARD_ORIGIN: z.string().optional(),

  OLLAMA_HOST: z.string().url().optional(),
  SWARMX_OLLAMA_URL: z.string().url().optional(),
  SWARMX_OLLAMA_BASE_URL: z.string().url().optional(),
  SWARMX_OLLAMA_PROBE_TIMEOUT_MS: positiveInt.default(5000),
  SWARMX_OLLAMA_CACHE_TTL_MS: nonNegativeInt.default(15_000),
  OLLAMA_MAX_LOADED_MODELS: z.coerce.number().int().min(1).default(1),
  OLLAMA_NUM_PARALLEL: z.coerce.number().int().min(1).default(1),
  OLLAMA_FLASH_ATTENTION: z.enum(["0", "1"]).default("0"),
  OLLAMA_KV_CACHE_TYPE: z.string().default("f16"),
  OLLAMA_NUM_THREADS: z.coerce.number().int().min(1).default(4),
  OLLAMA_KEEP_ALIVE: z.string().default("0"),
  OLLAMA_KEEP_ALIVE_PILOT_S: z.coerce.number().int().min(0).default(300),
  SWARMX_HOST_PROFILE: z.enum(["auto", "constrained_cpu_8gb", "standard_cpu_16gb", "accelerated_optional", "constrained_cpu", "standard_cpu", "8gb", "16gb"]).default("auto"),

  REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),

  SWARMX_MODEL_FAST: z.preprocess((val) => val ?? process.env["SWARM_MODEL_FAST"], z.string().default("instruct-phi4-pro-q8-prod")),
  SWARMX_MODEL_REASON: z.preprocess((val) => val ?? process.env["SWARM_MODEL_REASONER"] ?? process.env["SWARM_MODEL_REASON"], z.string().default("reason-deepseekr1-pro-q5km-prod")),
  SWARMX_MODEL_CODE: z.preprocess((val) => val ?? process.env["SWARM_MODEL_CODE"], z.string().default("code-qwen25-pro-q5km-prod")),
  SWARMX_MODEL_ULTRA_ROUTER: z.preprocess((val) => val ?? process.env["SWARM_MODEL_ULTRA_ROUTER"], z.string().default("route-phi4-lite-q4km-prod")),
  SWARMX_COMPOSER_FAST_MODEL: z.string().optional(),
  SWARMX_COMPOSER_MODEL: z.string().optional(),
  SWARMX_DEFAULT_MODEL: z.string().default("gpt-4o-mini"),
  SWARMX_MODEL_STARTUP_PREWARM: boolFlag,
  SWARMX_MODEL_PREDICTIVE_PREWARM: boolFlag,

  SWARMX_TELEMETRY_INTERVAL_MS: positiveInt.default(2000),
  SWARMX_MAX_AGENTS: positiveInt.default(10),
  SWARMX_AGENT_TIMEOUT_MS: positiveInt.default(300_000),
  SWARMX_MAX_PTY_SESSIONS: positiveInt.default(8),

  SWARMX_COMPOSER_TIMEOUT_HISTO_LOG_EVERY: positiveInt.default(3),
  SWARMX_COMPOSER_RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(2),
  SWARMX_COMPOSER_RETRY_BASE_DELAY_MS: positiveInt.default(250),
  SWARMX_COMPOSER_RETRY_MAX_DELAY_MS: positiveInt.default(2500),
  SWARMX_COMPOSER_CB_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(4),
  SWARMX_COMPOSER_CB_OPEN_MS: positiveInt.default(20_000),
  SWARMX_COMPOSER_DEEP_TIMEOUT_MS: positiveInt.default(90_000),
  SWARMX_COMPOSER_DEEP_TIMEOUT_MIN_MS: z.preprocess((val) => val ?? process.env["SWARMX_COMPOSER_DEEP_TIMEOUT_MS"] ?? "90000", positiveInt),
  SWARMX_COMPOSER_TIMEOUT_MS: positiveInt.default(60_000),
  SWARMX_COMPOSER_NUM_PREDICT: positiveInt.default(256),
  SWARMX_COMPOSER_KEEP_ALIVE: z.string().optional(),
  SWARMX_COMPOSER_SHORT_PROMPT_TIMEOUT_MS: positiveInt.default(45_000),

  SWARMX_CB_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(3),
  SWARMX_CB_WINDOW_MS: positiveInt.default(90_000),
  SWARMX_CB_OPEN_DURATION_MS: positiveInt.default(30_000),

  SWARMX_VIDEO_USE_BULLMQ: z.enum(["0", "1"]).default("1"),
  SWARMX_VIDEO_LOW_RAM_MODE: z.enum(["0", "1"]).default("0"),
  SWARMX_VIDEO_JOB_LIMIT_PER_HOUR: positiveInt.default(10),
  SWARMX_VIDEO_CAPTION_SCORE_LIMIT_PER_MIN: positiveInt.default(10),
  SWARMX_VIDEO_QUEUE_MAX_SIZE: positiveInt.default(20),
  SWARMX_VIDEO_QUEUE_NAME: z.string().min(1).default("swarmx-video"),
  SWARMX_VIDEO_MAX_RETRIES: z.preprocess((val) => val ?? process.env["VIDEO_MAX_RETRIES"], nonNegativeInt.default(3)),
  SWARMX_VIDEO_RETRY_BASE_DELAY_MS: positiveInt.default(5_000),
  SWARMX_VIDEO_RETRY_MAX_DELAY_MS: positiveInt.default(30_000),
  SWARMX_VIDEO_RETRY_JITTER_MS: nonNegativeInt.default(1_000),
  SWARMX_VIDEO_JOB_TTL_MS: z.preprocess((val) => val ?? process.env["VIDEO_JOB_TTL_MS"], positiveInt.default(4 * 60 * 60 * 1000)),
  SWARMX_VIDEO_MAX_CONCURRENT_JOBS: z.preprocess((val) => val ?? process.env["VIDEO_MAX_CONCURRENT_JOBS"], positiveInt.default(1)),
  SWARMX_VIDEO_EXPORT_TTL_DAYS: positiveInt.default(7),
  SWARMX_VIDEO_CLEANUP_INTERVAL_MS: positiveInt.default(6 * 60 * 60 * 1000),
  SWARMX_VIDEO_FFPROBE_TIMEOUT_MS: positiveInt.default(15_000),
  SWARMX_VIDEO_FFMPEG_TIMEOUT_MS: positiveInt.default(240_000),
  SWARMX_VIDEO_ALLOW_STUB_RENDER: boolFlag,
  SWARMX_VIDEO_ALLOW_SILENT_AUDIO: boolFlag,
  SWARMX_VIDEO_ALLOW_UNSTRUCTURED_INTENT: boolFlag,
  SWARMX_VIDEO_RENDER_BACKEND: z.string().default("auto"),
  SWARMX_MODAL_RENDER_URL: z.string().url().optional(),
  SWARMX_MODAL_SECRET_NAME: z.string().min(1).default("swarmxq-video-renderer"),
  SWARMX_MODAL_MAX_CONTAINERS: positiveInt.default(4),
  SWARMX_MODAL_FUNCTION_TIMEOUT_S: positiveInt.default(600),
  SWARMX_MODAL_STARTUP_TIMEOUT_S: positiveInt.default(180),
  SWARMX_VIDEO_REQUIRE_WORD_ALIGNMENT: boolFlag,
  SWARMX_WHISPER_DEVICE: z.enum(["cpu", "cuda"]).default("cpu"),
  SWARMX_WHISPER_COMPUTE_TYPE: z.string().default("int8"),
  SWARMX_WHISPER_MODEL_SIZE: z.string().min(1).default("small"),
  SWARMX_VIDEO_MAX_BATCH_SIZE: positiveInt.default(8),
  SWARMX_VIDEO_EXPORT_DIR: z.preprocess((val) => val ?? process.env["VIDEO_OUTPUT_DIR"] ?? ".swarmx/video/exports", z.string().min(1)),
  SWARMX_VIDEO_ARTIFACT_DIR: z.string().min(1).default(".swarmx/video/artifacts"),
  SWARMX_VIDEO_PUBLIC_URL_BASE: z.preprocess((val) => val ?? process.env["VIDEO_PUBLIC_URL_BASE"] ?? "/api/video/files", z.string().min(1)),
  SWARMX_VIDEO_TEMP_DIR: z.preprocess((val) => val ?? path.join(process.cwd(), ".swarmx", "video", "tmp"), z.string()),
  SWARMX_VIDEO_HIGH_PRESSURE_DELAY_MS: z.preprocess((val) => val ?? process.env["HIGH_PRESSURE_DELAY_MS"] ?? "3000", z.coerce.number().int().transform((n) => Math.min(30_000, Math.max(1_000, n)))),
  SWARMX_VIDEO_MAX_FRAME_BUDGET_MB: positiveInt.default(7600),
  SWARMX_VIDEO_COMFY_POLL_INTERVAL_MS: positiveInt.default(2000),
  SWARMX_VIDEO_COMFY_POLL_MAX_ATTEMPTS: positiveInt.default(180),

  SWARMX_TTS_PROVIDER: z.enum(["auto", "kokoro", "piper", "espeak", "silent_fixture"]).default("auto"),
  SWARMX_TTS_URL: z.string().url().default("http://127.0.0.1:8888"),
  SWARMX_TTS_PIPER_MODEL_PATH: z.string().optional(),
  SWARMX_TTS_LOCALE: z.string().min(2).default("en-US"),
  SWARMX_TTS_PRONUNCIATION_DICTIONARY_VERSION: z.string().default("builtin-v1"),
  SWARMX_AUDIO_MASTER_SAMPLE_RATE_HZ: positiveInt.default(48_000),
  SWARMX_AUDIO_MASTER_CHANNELS: z.coerce.number().int().min(1).max(2).default(2),
  SWARMX_AUDIO_TARGET_LUFS: z.coerce.number().default(-16),
  SWARMX_AUDIO_TRUE_PEAK_MAX_DBFS: z.coerce.number().default(-1.5),
  SWARMX_AUDIO_AMBIENT_BED_ENABLED: boolFlag.default("0"),
  SWARMX_VOICE_BENCHMARK_FILE: z.preprocess((val) => val ?? "/tmp/swarmxq-voice-benchmark.json", z.string()),
  SWARMX_VOICE_BENCHMARK_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(720).default(168),

  // v5 finalization directive — ADR-8 (free operator notifications). Both
  // optional and independent: set either, both, or neither. Neither set
  // means the notifier is a silent no-op (checked once per call, not
  // required at boot). Discord: Server Settings -> Integrations -> Webhooks
  // -> New Webhook -> Copy URL (free, no signup beyond a Discord account).
  // Slack: api.slack.com/apps -> your app -> Incoming Webhooks -> Add New
  // Webhook to Workspace (free tier covers this).
  SWARMX_DISCORD_WEBHOOK_URL: z.string().url().optional(),
  SWARMX_SLACK_WEBHOOK_URL: z.string().url().optional(),

  // V5 optional integrations. Every feature is fail-open and disabled by
  // default unless explicitly enabled and its provider credentials exist.
  SWARMX_AUDIO_FREESOUND_BED_ENABLED: boolFlag,
  SWARMX_FREESOUND_API_KEY: z.string().min(1).optional(),
  SWARMX_FREESOUND_CACHE_DIR: z.string().min(1).default(".swarmx/video/freesound-cache"),
  SWARMX_VIDEO_STOCK_BROLL_ENABLED: boolFlag,
  SWARMX_PEXELS_API_KEY: z.string().min(1).optional(),
  SWARMX_PIXABAY_API_KEY: z.string().min(1).optional(),
  SWARMX_EXPORT_VMAF_MIN: z.coerce.number().min(0).max(100).default(85),
  SWARMX_TREND_RADAR_ENABLED: boolFlag,
  SWARMX_TREND_RADAR_CACHE_TTL_MS: positiveInt.default(6 * 60 * 60 * 1000),
  SWARMX_HOOK_MEMORY_ENABLED: boolFlag,
  SWARMX_HOOK_MEMORY_DB_PATH: z.string().min(1).default(".swarmx/video/hook-memory.sqlite"),
  SWARMX_LIBRETRANSLATE_URL: z.string().url().optional(),
  SWARMX_VIDEO_TRANSLATION_LANGUAGES: z.string().default(""),
  SWARMX_VIDEO_ALT_TEXT_ENABLED: boolFlag.default("1"),

  SWARMX_COMFYUI_URL: z.preprocess((val) => val ?? process.env["COMFY_HOST"], z.string().url().default("http://127.0.0.1:8188")),
  SWARMX_COMFYUI_OUTPUT_DIR: z.string().optional(),
  SWARMX_COMFYUI_TEACACHE: boolFlag,

  SWARMX_HOME: z.preprocess((val) => val ?? `${process.env["HOME"] ?? process.env["USERPROFILE"] ?? ""}/.swarmx`, z.string()),
  SWARMX_REPO_ROOT: z.preprocess((val) => val ?? process.cwd(), z.string()),
  SWARMX_WORKFLOWS_DIR: z.preprocess((val) => val ?? path.join(process.env["SWARMX_HOME"] ?? `${process.env["HOME"] ?? process.env["USERPROFILE"] ?? ""}/.swarmx`, "workflows"), z.string()),
  SWARMX_LOG_DIR: z.string().default("/var/log/swarmx"),
  SWARMX_EVENTS_LIMIT: nonNegativeInt.default(200),

  SWARMX_PYTHON: z.string().default("python3"),
  SWARMX_PYTHON_API_URL: z.string().optional(),
  SWARMX_V5_POLL_INTERVAL_MS: positiveInt.default(15_000),
  SWARMX_V5_POLL_TIMEOUT_MS: positiveInt.default(25_000),
  SWARMX_PYEVENTS_POLL_MS: positiveInt.default(2500),

  SWARMX_JOURNAL_UNITS: z.string().optional(),
  SWARMX_SYSTEMD_FILTER: z.string().optional(),
  SWARMX_CGROUP_ROOT: z.string().default("/sys/fs/cgroup/swarmx.slice"),
  SWARMX_CGROUP_INTERVAL_MS: positiveInt.default(2000),
  SWARMX_SYSTEM_HEALTH_PROBE_TIMEOUT_MS: z.coerce.number().int().transform((n) => Math.min(10_000, Math.max(250, n))).default(1500),
  SWARMX_SYSTEM_HEALTH_MODEL_PROBE_TIMEOUT_MS: z.coerce.number().int().transform((n) => Math.min(10_000, Math.max(250, n))).default(2500),
  SWARMX_WARMUP_STATUS_FILE: z.string().default("/tmp/swarmxq-warmup.json"),

  SWARMX_INSTAGRAM_USER_ID: z.string().optional(),
  SWARMX_TIKTOK_API_APPROVED: boolFlag,
});

type Env = z.infer<typeof schema>;

export type SecretEnvKey =
  | "SWARMX_VIDEO_API_TOKEN"
  | "SWARMX_TIKTOK_ACCESS_TOKEN"
  | "SWARMX_INSTAGRAM_ACCESS_TOKEN"
  | "SWARMX_MODAL_RENDER_TOKEN";

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = result.data;
  return cached;
}

export function resetEnvForTesting(): void { cached = null; }

export function readSecretEnv(key: SecretEnvKey): string {
  return process.env[key]?.trim() ?? "";
}

export function readRawEnv(key: string): string | undefined {
  return process.env[key];
}
