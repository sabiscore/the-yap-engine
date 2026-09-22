export type RuntimeGuidanceTone = "warning" | "critical";

export interface RuntimeGuidanceModel {
  role?: string;
  tag?: string;
  status?: string;
  error?: string;
}

export interface RuntimeGuidanceInput {
  apiOnline: boolean | null;
  ollamaOnline: boolean | null;
  pressureLevel?: string | undefined;
  availableMb?: number | null | undefined;
  healthStatus?: string | null | undefined;
  modelReadiness?: RuntimeGuidanceModel[] | null | undefined;
  runtimeAvailableMb?: number | null | undefined;
  runtimeBlockers?: string[] | null | undefined;
  runtimeWarnings?: string[] | null | undefined;
  voiceBenchmarkRecommendedProviderId?: string | null | undefined;
  voiceFallbackWarning?: string | null | undefined;
  fullPipelineMinAvailableMb?: number | undefined;
  /** /proc/loadavg 1-minute load average from the API health endpoint. */
  cpuLoad?: number | null | undefined;
  /** Number of logical CPU cores on the host. */
  cpuCoreCount?: number | null | undefined;
}

export interface RuntimeGuidance {
  tone: RuntimeGuidanceTone;
  title: string;
  detail: string;
  recoveryHint: string;
  blocksSubmission: boolean;
}

function formatAvailableMemory(availableMb: number | null | undefined): string {
  if (availableMb == null || !Number.isFinite(availableMb)) {
    return "";
  }

  return ` (${Math.round(availableMb).toLocaleString()} MB free)`;
}

const DEFAULT_FULL_PIPELINE_MIN_AVAILABLE_MB = 6_170;

/** Block new submissions when load1m / coreCount reaches this fraction. */
const CPU_LOAD_CEILING = 0.85;

function formatGbFromMb(valueMb: number): string {
  return `${(valueMb / 1024).toFixed(1)} GB`;
}

function formatModelLabel(model: RuntimeGuidanceModel): string {
  return model.role ?? model.tag ?? "model";
}

function buildModelReadinessDetail(models: RuntimeGuidanceModel[] | null | undefined): string | null {
  if (!models || models.length === 0) {
    return null;
  }

  const missing = models.filter((model) => model.status !== "ready");
  if (missing.length === 0) {
    return null;
  }

  const labels = missing.slice(0, 3).map(formatModelLabel).join(", ");
  const suffix = missing.length > 3 ? ` +${missing.length - 3} more` : "";
  return `${missing.length} required model profile${missing.length === 1 ? " is" : "s are"} not ready (${labels}${suffix}).`;
}

/**
 * Derive one operator-facing explanation for current runtime state.
 *
 * API availability is authoritative: if the dashboard cannot reach the API it
 * cannot safely infer Ollama state. When the API is available, Ollama and RAM
 * state are reported independently so recovery guidance is actionable.
 */
export function getRuntimeGuidance({
  apiOnline,
  ollamaOnline,
  pressureLevel,
  availableMb,
  healthStatus,
  modelReadiness,
  runtimeAvailableMb,
  runtimeBlockers,
  runtimeWarnings,
  voiceBenchmarkRecommendedProviderId,
  voiceFallbackWarning,
  fullPipelineMinAvailableMb = DEFAULT_FULL_PIPELINE_MIN_AVAILABLE_MB,
  cpuLoad,
  cpuCoreCount,
}: RuntimeGuidanceInput): RuntimeGuidance | null {
  const memorySuffix = formatAvailableMemory(availableMb);
  const memoryConstrained = pressureLevel === "high" || pressureLevel === "critical";
  const modelReadinessDetail = buildModelReadinessDetail(modelReadiness);
  const runtimeBelowFullPipeline =
    runtimeAvailableMb != null &&
    Number.isFinite(runtimeAvailableMb) &&
    runtimeAvailableMb < fullPipelineMinAvailableMb;
  const runtimeBlockerCount = runtimeBlockers?.length ?? 0;
  const cpuOverloaded =
    cpuLoad != null &&
    cpuCoreCount != null &&
    cpuCoreCount > 0 &&
    cpuLoad / cpuCoreCount >= CPU_LOAD_CEILING;
  const pipelineHealthBlocked =
    apiOnline === true &&
    ollamaOnline !== false &&
    (modelReadinessDetail !== null || runtimeBelowFullPipeline || runtimeBlockerCount > 0 || cpuOverloaded);

  if (apiOnline === false) {
    return {
      tone: "critical",
      title: "Yap Engine API unavailable",
      detail: "The dashboard cannot reach the local API, so live job and runtime state may be stale.",
      recoveryHint: "Confirm the API is running on port 3001, then refresh this dashboard.",
      blocksSubmission: true,
    };
  }

  if (pipelineHealthBlocked) {
    const details: string[] = [];
    if (modelReadinessDetail) {
      details.push(modelReadinessDetail);
    }
    if (runtimeBelowFullPipeline && runtimeAvailableMb != null) {
      details.push(
        `Available RAM is ${formatGbFromMb(runtimeAvailableMb)}; M13 full-pipeline minimum is ${formatGbFromMb(fullPipelineMinAvailableMb)}.`,
      );
    }
    if (runtimeBlockerCount > 0) {
      details.push(`${runtimeBlockerCount} runtime profile blocker${runtimeBlockerCount === 1 ? " is" : "s are"} active.`);
    }
    if (cpuOverloaded && cpuLoad != null && cpuCoreCount != null) {
      const pct = Math.round((cpuLoad / cpuCoreCount) * 100);
      details.push(`CPU load is ${pct}% across ${cpuCoreCount} core${cpuCoreCount === 1 ? "" : "s"}; pipeline stages will time out. Free CPU before submitting.`);
    }
    if (voiceBenchmarkRecommendedProviderId == null && healthStatus === "degraded") {
      details.push("Voice benchmark recommendation is missing.");
    }

    return {
      tone: "critical",
      title: "Full video pipeline blocked",
      detail: details.join(" "),
      recoveryHint:
        modelReadinessDetail !== null
          ? "Install or retag the canonical model set, then free memory before submitting production video jobs."
          : "Free memory or select a lighter runtime profile before submitting production video jobs.",
      blocksSubmission: true,
    };
  }

  if (ollamaOnline === false) {
    return {
      tone: "warning",
      title: "Ollama backend unavailable",
      detail:
        "The API is online, but model-backed work cannot advance until Ollama responds." +
        (memoryConstrained
          ? ` Memory pressure is also ${pressureLevel}${memorySuffix}.`
          : ""),
      recoveryHint: "Start or restore Ollama with `ollama serve`, then wait for the health indicator to recover.",
      blocksSubmission: true,
    };
  }

  if (apiOnline === true && healthStatus === "warning" && runtimeWarnings && runtimeWarnings.length > 0) {
    return {
      tone: "warning",
      title: "Runtime warnings active",
      detail: runtimeWarnings.slice(0, 2).join(" "),
      recoveryHint: "Review the System page before starting a long production render.",
      blocksSubmission: false,
    };
  }

  if (apiOnline === true && voiceFallbackWarning) {
    return {
      tone: "warning",
      title: "Voice provider fallback active",
      detail: voiceFallbackWarning,
      recoveryHint: "Start or restore Kokoro before production runs that require the pinned Kokoro voice profile.",
      blocksSubmission: false,
    };
  }

  if (memoryConstrained) {
    const isCritical = pressureLevel === "critical";
    return {
      tone: isCritical ? "critical" : "warning",
      title: `Memory pressure ${pressureLevel}${memorySuffix}`,
      detail: isCritical
        ? "Model calls are restricted to protect the host from an out-of-memory failure."
        : "Model work is serialized and may take longer while the host preserves headroom.",
      recoveryHint: "Finish or unload memory-heavy processes before starting another model-backed job.",
      blocksSubmission: isCritical,
    };
  }

  return null;
}
