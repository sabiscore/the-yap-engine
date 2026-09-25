/**
 * apps/swarmx-api/src/services/model-orchestrator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SwarmX Runtime Model Orchestrator — Architecture Review §2 Implementation
 * Version : v2026.6.28-apex17-r8
 * Hardware : HP EliteBook 850 G3 · 16 GB RAM · CPU-only · 4 cores · WSL2 (auto-detected host profile)
 *
 * Responsibilities:
 *   - Track active Ollama models via /api/ps
 *   - Enforce SINGLE-7B LOCK: never allow two 7B models resident simultaneously
 *   - Pre-evict incompatible models before specialist load (evictIncompatible)
 *   - Monitor available RAM from /proc/meminfo (WSL2 procfs)
 *   - Gate expensive model transitions under memory pressure
 *   - Apply adaptive keep-alive per memory pressure level (§2 Policy 2)
 *   - Predictive warmup after router classification only when explicitly enabled
 *   - Serialize high-memory tasks to prevent OOM
 *   - Select composer tier (0–4) based on message and mode (§8)
 *
 * File location : apps/swarmx-api/src/services/model-orchestrator.ts
 *
 * Integration points:
 *   - apps/swarmx-api/src/routes/composer.ts  (before every model call)
 *   - APEX-17 phase transitions in swarm_evolve_run()
 *   - swarm_triad dispatch (via API route)
 *
 * ─── r8 INTEGRATION NOTES (read before modifying) ───────────────────────────
 *
 * [ORCH-r8-01] CANONICAL TAGS ONLY. The uploaded source for this file
 *   (latest-modelfiles/model-orchestrator.ts, v2026.5.20-apex17-r3) keyed its
 *   entire MODEL_REGISTRY by legacy alias tags and hardcoded a legacy literal in the
 *   pressure-eviction branch. That is a direct violation of this
 *   integration's Hard Constraint #1 (no legacy alias tags in production code
 *   paths) and would have required every caller — composer.ts included —
 *   to pass legacy alias strings to requestModel(). MODEL_REGISTRY below is keyed
 *   exclusively by canonical r7 tags and is *derived from* (not duplicated
 *   alongside) @swarmx/types/operator-map's MODEL_OPERATOR_MAP, which is
 *   already the authoritative source for is7B / RAM / context-window data.
 *   Only the keep-alive policy (which operator-map.ts does not carry) is
 *   defined locally, in KEEP_ALIVE_POLICY, sourced from configs/routing.yaml
 *   and models/registry.yaml. Startup and predictive prewarm are off by
 *   default on constrained (8 GB) hosts; startup-enhanced.sh enables both on
 *   16 GB hosts unless free RAM is below the safety threshold. Callers may
 *   still pass a legacy alias tag —
 *   requestModel() and
 *   evictIncompatible() resolve through resolveCanonicalTag() first — but
 *   the registry itself, and everything logged or returned, is canonical.
 *
 * [ORCH-r8-02] NO DUPLICATE TIMEOUT / OVERRIDE LOGIC. The uploaded source
 *   also defined its own TimeoutConfig / getAdaptiveTimeouts() (keyed by ad
 *   hoc fields: intentClassifyMs, routingMs, fastChatMs, ...) and its own
 *   getRamAwareOverrides() (a 0.75/0.5 ctx-cut policy). Both concerns are
 *   already owned, in more granular and circuit-breaker-aware form, by
 *   apps/swarmx-api/src/services/adaptive-timeout-config.ts via its
 *   OperationKey-keyed TIMEOUT_MATRIX and getModelOverrides(). Maintaining
 *   both would mean two independently-tuned answers to "how long should
 *   this call wait" / "how much should ctx shrink" — exactly the duplicate-
 *   logic risk Hard Constraint #4 guards against ("do not bypass
 *   getModelOverrides()'s pressure-aware reduction"). Both functions are
 *   removed here; ctx/predict overrides are obtained by calling
 *   adaptive-timeout-config.ts's getModelOverrides() directly (see
 *   requestModel() below). The shared OperationKey and PressureLevel types
 *   both services now import are defined once, in
 *   packages/swarmx-types/src/operation-types.ts — see that file's header
 *   for why the timeout-domain PressureLevel ("low"|"normal"|"high"|
 *   "critical") is exported as `TimeoutPressureLevel` rather than colliding
 *   with the pre-existing, differently-scoped 3-value `PressureLevel` already
 *   exported by packages/swarmx-types/src/index.ts for the system:governor
 *   SSE event.
 *
 * [ORCH-r8-03] This orchestrator's OWN RAM thresholds (RAM_NORMAL_MB /
 *   RAM_LOW_MB / RAM_CRITICAL_MB below) are intentionally a SEPARATE policy
 *   from adaptive-timeout-config.ts's PRESSURE_THRESHOLDS_MB. They drive a
 *   different decision (when to evict / what keep-alive to grant) than the
 *   timeout matrix's decision (how long to wait / how much to shrink ctx).
 *   RAM_CRITICAL_MB = 800 is protected by this integration's Hard Constraint
 *   #4 and must not be changed.
 *
 * [ORCH-r8-04] evictIncompatible(targetTag) is now a standalone, exported
 *   method (previously this logic was inlined only inside requestModel()).
 *   composer.ts must call it explicitly before every is7B model dispatch,
 *   per Hard Constraint #2 (SINGLE-7B LOCK) — requestModel() also calls it
 *   internally, so callers that go through requestModel() get the same
 *   guarantee without an extra explicit call.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  MODEL_OPERATOR_MAP,
  resolveCanonicalTag,
  type OperatorEntry,
  type OperatorName,
} from "@swarmx/types/operator-map";
import {
  getModelOverrides,
  type ModelCallOverrides,
} from "./adaptive-timeout-config.js";
import { recordEviction } from "./swarm-pressure-monitor.js";
import type { TimeoutPressureLevel } from "@swarmx/types/operation-types";
import { loadEnv } from "../lib/env.js";
import { fetchBackend } from "./backend-fetch-errors.js";

// ─── Memory pressure thresholds (orchestrator's own policy — see ORCH-r8-03) ──

const RAM_NORMAL_MB   = 2500;  // available_mb >= this → normal
const RAM_LOW_MB      = 1500;  // available_mb < this → high pressure
const RAM_CRITICAL_MB = 800;   // available_mb < this → degraded — DO NOT LOWER (Hard Constraint #4)

/** Relay tag. Opt-in warm on constrained hosts; startup-enhanced.sh enables it by default on 16 GB hosts. */
const RELAY_PREWARM_TAG = "route-phi4-lite-q4km-prod"; // Relay
const MODEL_HEADROOM_RESERVE_MB = 800;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelTier =
  | "ultra-router"    // Relay
  | "fast-chat"       // Pilot
  | "phi-worker"      // Architect (phi4) / Lab (phi4)
  | "7b-specialist"   // Forge / Architect (qwen25 | deepseekr1)
  | "7b-reasoner"      // Oracle
  | "7b-critic"        // Auditor
  | "7b-evolve";       // Lab (qwen25 | deepseekr1)

export type OrchestratorMode = "normal" | "low-ram" | "evolver" | "degraded";
export type ComposerTier   = 0 | 1 | 2 | 3 | 4;

export interface ModelProfile {
  tag:                string;       // canonical r7 tag
  operator:           OperatorName; // human-facing identity (Relay, Pilot, Architect, ...)
  tier:               ModelTier;
  estimatedRamMb:     number;
  defaultCtx:         number;
  keepAliveNormal:    string;
  keepAliveLowRam:    string;
  keepAliveEvolver:   string;
  keepAliveDegraded:  string;
  is7B:               boolean;
}

export interface ModelOverrides {
  num_ctx?:     number;
  num_predict?: number;
  temperature?: number;
}

interface OllamaRunningModel {
  name:       string;
  model:      string;
  size:       number;
  digest:     string;
  expires_at: string;
  size_vram:  number;
}

interface OllamaPsResponse {
  models: OllamaRunningModel[];
}

interface OrchestratorState {
  activeModels:      Set<string>;
  active7BModel:     string | null;
  warmQueue:         string[];
  currentMode:       OrchestratorMode;
  lastRamCheckMs:    number;
  availableRamMb:    number;
  inFlightEviction:  Promise<void> | null;
  pendingWarmup:     string | null;
}

// ─── Keep-alive policy (canonical tags only — see ORCH-r8-01) ────────────────
//
// Sourced from:
//   configs/routing.yaml      → Pilot keep_alive: 30 ("30s"); Oracle / Forge keep_alive: 0 ("0s")
//   models/registry.yaml      → Relay is opt-in warm, not always resident
// Every is7B tag not explicitly covered by routing.yaml's triadic_model_config
// (Architect-qwen, Architect-deepseek, Auditor, Lab-qwen, Lab-deepseek) is set
// to "0s" in every non-evolver mode, consistent with SINGLE-7B LOCK discipline
// and registry.yaml's constraints.max_resident_7b_models: 1. Lab is7B models
// get a short "2m" grace period ONLY in evolver mode, because the APEX-17
// cycle calls synth-deepseekr1-exp-q5km-dev twice in a row (Critique → then
// Validate, after the Mutate phase) and reloading it in between would cost a
// full 7B cold start for no benefit.
const KEEP_ALIVE_POLICY: Record<
  string,
  { normal: string; lowRam: string; evolver: string; degraded: string }
> = {
  "route-phi4-lite-q4km-prod":         { normal: "30s", lowRam: "0s",  evolver: "2m",  degraded: "0s"  }, // Relay — opt-in warm
  "instruct-phi4-pro-q8-prod":         { normal: "30s", lowRam: "30s", evolver: "30s", degraded: "0s"  }, // Pilot
  "instruct-phi4-lite-q4km-prod":      { normal: "30s", lowRam: "30s", evolver: "30s", degraded: "0s"  }, // Low-RAM Pilot
  "plan-phi4-pro-q8-prod":             { normal: "30s", lowRam: "20s", evolver: "30s", degraded: "0s"  }, // Architect (phi4)
  "code-qwen25-pro-q5km-prod":         { normal: "0s",  lowRam: "0s",  evolver: "0s",  degraded: "0s"  }, // Forge
  "plan-qwen25-pro-q5km-prod":         { normal: "0s",  lowRam: "0s",  evolver: "0s",  degraded: "0s"  }, // Architect (qwen25)
  "plan-deepseekr1-pro-q5km-prod":     { normal: "0s",  lowRam: "0s",  evolver: "0s",  degraded: "0s"  }, // Architect (deepseekr1)
  "reason-deepseekr1-pro-q5km-prod":   { normal: "0s",  lowRam: "0s",  evolver: "0s",  degraded: "0s"  }, // Oracle
  "critique-deepseekr1-pro-q5km-prod": { normal: "0s",  lowRam: "0s",  evolver: "0s",  degraded: "0s"  }, // Auditor
  "synth-phi4-exp-q8-dev":             { normal: "30s", lowRam: "20s", evolver: "30s", degraded: "0s"  }, // Lab (phi4 — observe)
  "synth-qwen25-exp-q5km-dev":         { normal: "0s",  lowRam: "0s",  evolver: "2m",  degraded: "0s"  }, // Lab (qwen25 — mutate)
  "synth-deepseekr1-exp-q5km-dev":     { normal: "0s",  lowRam: "0s",  evolver: "2m",  degraded: "0s"  }, // Lab (deepseekr1 — critique/validate)
};

const TIER_BY_ROLE: Record<OperatorEntry["role"], ModelTier> = {
  route:    "ultra-router",
  instruct: "fast-chat",
  plan:     "phi-worker",      // refined below for 7B plan roles
  code:     "7b-specialist",
  reason:   "7b-reasoner",
  critique: "7b-critic",
  synth:    "7b-evolve",       // refined below for the non-7B Lab-phi4 observe model
};

function tierFor(tag: string, entry: OperatorEntry): ModelTier {
  if (entry.role === "plan" && entry.is7B) return "7b-specialist";
  if (entry.role === "synth" && !entry.is7B) return "phi-worker";
  return TIER_BY_ROLE[entry.role];
}

/**
 * MODEL_REGISTRY — built from @swarmx/types/operator-map's MODEL_OPERATOR_MAP
 * (the single source of truth for is7B / RAM / context-window per
 * models/registry.yaml) plus the local KEEP_ALIVE_POLICY above. There is
 * exactly one place that knows a tag's RAM/ctx/is7B (operator-map.ts) and
 * exactly one place that knows its keep-alive policy (this file).
 */
export const MODEL_REGISTRY: Record<string, ModelProfile> = Object.fromEntries(
  Object.entries(MODEL_OPERATOR_MAP).map(([tag, entry]) => {
    const keepAlive = KEEP_ALIVE_POLICY[tag] ?? { normal: "2m", lowRam: "20s", evolver: "2m", degraded: "0s" };
    const profile: ModelProfile = {
      tag,
      operator:          entry.operator,
      tier:              tierFor(tag, entry),
      estimatedRamMb:    entry.estimatedRamMb,
      defaultCtx:        entry.defaultCtx,
      keepAliveNormal:   keepAlive.normal,
      keepAliveLowRam:   keepAlive.lowRam,
      keepAliveEvolver:  keepAlive.evolver,
      keepAliveDegraded: keepAlive.degraded,
      is7B:              entry.is7B,
    };
    return [tag, profile];
  }),
);

// ─── ModelOrchestrator (singleton) ───────────────────────────────────────────

export class ModelOrchestrator {
  private static _instance: ModelOrchestrator | null = null;

  private readonly ollamaBase: string;
  private readonly state: OrchestratorState;
  private readonly RAM_POLL_MS = 8_000;

  private constructor(ollamaBase: string) {
    this.ollamaBase = ollamaBase.replace(/\/+$/, "");
    this.state = {
      activeModels:     new Set(),
      active7BModel:    null,
      warmQueue:        [],
      currentMode:      "normal",
      lastRamCheckMs:   0,
      availableRamMb:   4096, // conservative default until first poll
      inFlightEviction: null,
      pendingWarmup:    null,
    };
  }

  static getInstance(ollamaBase?: string): ModelOrchestrator {
    if (!ModelOrchestrator._instance) {
      const _oe = loadEnv();
      const base =
        ollamaBase ??
        _oe.OLLAMA_HOST?.trim() ??
        _oe.SWARMX_OLLAMA_URL?.trim() ??
        "http://127.0.0.1:11434";
      ModelOrchestrator._instance = new ModelOrchestrator(base);
    }
    return ModelOrchestrator._instance;
  }

  /**
   * Initialize orchestrator state from live Ollama residency. Relay prewarm is
   * opt-in via SWARMX_MODEL_STARTUP_PREWARM=1; defaulted on by startup-enhanced.sh on 16 GB hosts.
   * Safe to call multiple times.
   */
  async init(): Promise<void> {
    await this._refreshRam();
    await this.syncFromOllama();
    if (loadEnv().SWARMX_MODEL_STARTUP_PREWARM === "1") {
      this._preloadFireAndForget(RELAY_PREWARM_TAG);
    }
  }

  /**
   * Best-effort shutdown hook: wait for in-flight eviction and clear warmup marker.
   */
  async destroy(): Promise<void> {
    if (this.state.inFlightEviction) {
      await this.state.inFlightEviction.catch(() => {});
    }
    this.state.pendingWarmup = null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Evict whatever is currently the resident 7B model if it is not
   * `targetTag` itself, plus (in low-ram mode) any non-7B model other than
   * the requested target. Resolves legacy aliases through resolveCanonicalTag()
   * first. Safe to call even if targetTag is not 7B —
   * it is then a no-op beyond the low-ram sweep.
   *
   * composer.ts MUST call this (directly, or via requestModel() which calls
   * it internally) before every dispatch to an is7B model — Hard Constraint
   * #2 (SINGLE-7B LOCK).
   */
  async evictIncompatible(targetTag: string): Promise<string[]> {
    await this._refreshRam();
    await this.syncFromOllama();
    const canonicalTarget = resolveCanonicalTag(targetTag);
    const profile = MODEL_REGISTRY[canonicalTarget];
    const evicted: string[] = [];

    // POLICY 1 — SINGLE-7B LOCK: never allow two is7B models resident at once.
    if (profile?.is7B && this.state.active7BModel && this.state.active7BModel !== canonicalTarget) {
      const victim = this.state.active7BModel;
      await this._evictModel(victim);
      recordEviction();
      evicted.push(victim);
    }

    if (profile?.is7B) {
      let projectedAvailableMb = this.state.availableRamMb;
      for (const active of Array.from(this.state.activeModels)) {
        if (active === canonicalTarget) continue;
        const activeProfile = MODEL_REGISTRY[resolveCanonicalTag(active)];
        if (!activeProfile) continue;

        const needsHeadroom =
          projectedAvailableMb < profile.estimatedRamMb + MODEL_HEADROOM_RESERVE_MB;
        const lowRamNon7B = this.state.currentMode === "low-ram" && !activeProfile.is7B;

        if (needsHeadroom || lowRamNon7B) {
          await this._evictModel(activeProfile.tag);
          recordEviction();
          evicted.push(activeProfile.tag);
          projectedAvailableMb += activeProfile.estimatedRamMb;
        }
      }
    }

    return evicted;
  }

  /**
   * Request a model be ready for inference.
   * Enforces SINGLE-7B LOCK via evictIncompatible(), returns keep-alive and
   * RAM-aware ctx/predict overrides (delegated to adaptive-timeout-config.ts's
   * getModelOverrides() — see ORCH-r8-02 above) for the caller to include in
   * the Ollama request.
   */
  async requestModel(modelTag: string): Promise<{
    modelTag:       string;
    keepAlive:      string;
    evictedModels:  string[];
    overrides:      ModelCallOverrides;
    ramAvailableMb: number;
    mode:           OrchestratorMode;
  }> {
    await this._refreshRam();
    const canonicalTag = resolveCanonicalTag(modelTag);
    const profile = MODEL_REGISTRY[canonicalTag];

    if (!profile) {
      return {
        modelTag:       canonicalTag,
        keepAlive:      "2m",
        evictedModels:  [],
        overrides:      {},
        ramAvailableMb: this.state.availableRamMb,
        mode:           this.state.currentMode,
      };
    }

    const evictedModels = await this.evictIncompatible(canonicalTag);

    // Update tracking
    this.state.activeModels.add(canonicalTag);
    if (profile.is7B) this.state.active7BModel = canonicalTag;

    return {
      modelTag:       canonicalTag,
      keepAlive:      this._keepAliveFor(canonicalTag),
      evictedModels,
      overrides:      getModelOverrides(canonicalTag),
      ramAvailableMb: this.state.availableRamMb,
      mode:           this.state.currentMode,
    };
  }

  /**
   * POLICY 3 — Predictive warmup.
   * After router classification, fire-and-forget preload of the next specialist
   * before the user confirms action. Skips if RAM is too constrained.
   */
  preloadNextSpecialist(predictedModelTag: string): void {
    if (loadEnv().SWARMX_MODEL_PREDICTIVE_PREWARM !== "1") return;
    const canonicalTag = resolveCanonicalTag(predictedModelTag);
    if (this.state.pendingWarmup === canonicalTag) return;
    const profile = MODEL_REGISTRY[canonicalTag];
    if (!profile) return;
    if (profile.is7B && this.state.availableRamMb < RAM_LOW_MB + 1000) return;
    this.state.pendingWarmup = canonicalTag;
    this._preloadFireAndForget(canonicalTag);
  }

  /** Called after a model call completes. Updates warm queue. */
  onModelCallComplete(modelTag: string): void {
    const canonicalTag = resolveCanonicalTag(modelTag);
    this.state.warmQueue = [
      canonicalTag,
      ...this.state.warmQueue.filter((m) => m !== canonicalTag),
    ].slice(0, 4);
    if (this.state.pendingWarmup === canonicalTag) this.state.pendingWarmup = null;
  }

  async unloadModel(modelTag: string): Promise<void> {
    await this._evictModel(resolveCanonicalTag(modelTag));
  }

  /**
   * Explicitly unload all active Ollama models.
   * Required before entering Kokoro TTS or heavy FFmpeg render phases on 8 GB RAM profiles
   * to guarantee zero-overlap memory lifecycle.
   */
  async unloadAllModels(): Promise<string[]> {
    await this.syncFromOllama();
    const active = Array.from(this.state.activeModels);
    const unloaded: string[] = [];
    for (const tag of active) {
      await this._evictModel(tag);
      unloaded.push(tag);
    }
    await this.syncFromOllama();
    return unloaded;
  }

  /** Called when Ollama reports a model was unloaded. */
  onModelEvicted(modelTag: string): void {
    const canonicalTag = resolveCanonicalTag(modelTag);
    this.state.activeModels.delete(canonicalTag);
    if (this.state.active7BModel === canonicalTag) this.state.active7BModel = null;
    this.state.warmQueue = this.state.warmQueue.filter((m) => m !== canonicalTag);
  }

  /** Explicitly set mode (e.g. setMode("evolver") before APEX-17 pipeline). */
  setMode(mode: OrchestratorMode): void {
    this.state.currentMode = mode;
  }

  getMode(): OrchestratorMode { return this.state.currentMode; }

  getRamSnapshot(): { availableMb: number; mode: OrchestratorMode; active7B: string | null } {
    return {
      availableMb: this.state.availableRamMb,
      mode:        this.state.currentMode,
      active7B:    this.state.active7BModel,
    };
  }

  /**
   * Map this orchestrator's own RAM/mode reading onto the shared
   * timeout-domain PressureLevel, for callers that want to pass an explicit
   * pressure into adaptive-timeout-config.ts's getTimeout() /
   * getAdaptiveCallConfig() instead of letting those functions re-read
   * /proc/meminfo themselves. Purely a convenience bridge — see ORCH-r8-03;
   * this orchestrator's own thresholds remain the authority for eviction and
   * keep-alive decisions.
   */
  toTimeoutPressureLevel(): TimeoutPressureLevel {
    const ram = this.state.availableRamMb;
    if (this.state.currentMode === "degraded" || ram < RAM_CRITICAL_MB) return "critical";
    if (this.state.currentMode === "low-ram"  || ram < RAM_LOW_MB)      return "high";
    if (ram < RAM_NORMAL_MB) return "normal";
    return "low";
  }

  /**
   * Resident model snapshot for the dashboard's Model Topology section
   * (apps/swarmx-dashboard/src/app/(dashboard)/settings/page.tsx) and the
   * GET /api/models/status route. Always reconciles against Ollama's own
   * /api/ps truth first.
   */
  async getResidentModels(): Promise<{
    tag: string;
    operator: OperatorName;
    is7B: boolean;
    estimatedRamMb: number;
  }[]> {
    const names = await this.syncFromOllama();
    return names
      .map((n) => resolveCanonicalTag(n))
      .map((tag) => MODEL_REGISTRY[tag])
      .filter((p): p is ModelProfile => Boolean(p))
      .map((p) => ({
        tag: p.tag,
        operator: p.operator,
        is7B: p.is7B,
        estimatedRamMb: p.estimatedRamMb,
      }));
  }

  /** Sync active model list with Ollama /api/ps reality. */
  async syncFromOllama(): Promise<string[]> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      try {
        const res = await fetchBackend(`${this.ollamaBase}/api/ps`, {
          backend: "ollama",
          signal: ctrl.signal,
        });
        if (!res.ok) return [];
        const data = (await res.json()) as OllamaPsResponse;
        const names = (data.models ?? []).map((m) => resolveCanonicalTag(m.name));
        this.state.activeModels = new Set(names);
        this.state.active7BModel = names.find((n) => MODEL_REGISTRY[n]?.is7B) ?? null;
        return names;
      } finally {
        clearTimeout(t);
      }
    } catch {
      return [];
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private _keepAliveFor(tag: string): string {
    const p = MODEL_REGISTRY[tag];
    if (!p) return "2m";
    // Pilot models honor OLLAMA_KEEP_ALIVE_PILOT_S — keeps them resident between the
    // intent_classification stage and the post-pipeline virality call on 16 GB hosts.
    if (
      (tag === "instruct-phi4-pro-q8-prod" || tag === "instruct-phi4-lite-q4km-prod") &&
      this.state.currentMode !== "degraded"
    ) {
      return `${loadEnv().OLLAMA_KEEP_ALIVE_PILOT_S}s`;
    }
    switch (this.state.currentMode) {
      case "normal":   return p.keepAliveNormal;
      case "low-ram":  return p.keepAliveLowRam;
      case "evolver":  return p.keepAliveEvolver;
      case "degraded": return p.keepAliveDegraded;
    }
  }

  private async _evictModel(tag: string): Promise<void> {
    if (this.state.inFlightEviction) await this.state.inFlightEviction;
    const eviction = (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        try {
          await fetchBackend(`${this.ollamaBase}/api/generate`, {
            backend: "ollama",
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            signal:  ctrl.signal,
            body:    JSON.stringify({ model: tag, prompt: "", keep_alive: "0s", stream: false }),
          });
        } finally {
          clearTimeout(t);
        }
      } catch { /* eviction failure is non-critical */ } finally {
        this.onModelEvicted(tag);
        this.state.inFlightEviction = null;
      }
    })();
    this.state.inFlightEviction = eviction;
    await eviction;
  }

  private async _refreshRam(): Promise<void> {
    const now = Date.now();
    if (now - this.state.lastRamCheckMs < this.RAM_POLL_MS) return;
    this.state.lastRamCheckMs = now;
    try {
      const { readFile } = await import("node:fs/promises");
      const meminfo = await readFile("/proc/meminfo", "utf8");
      const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
      if (match?.[1]) {
        this.state.availableRamMb = Math.floor(parseInt(match[1], 10) / 1024);
      }
    } catch { /* non-WSL2 or permission — use last known value */ }

    // POLICY 2 — Adaptive mode based on RAM
    const ram = this.state.availableRamMb;
    if      (ram < RAM_CRITICAL_MB) this.state.currentMode = "degraded";
    else if (loadEnv().SWARMX_VIDEO_LOW_RAM_MODE === "1") this.state.currentMode = "low-ram";
    else if (ram < RAM_LOW_MB)      this.state.currentMode = "low-ram";
    else if (this.state.currentMode === "degraded" || this.state.currentMode === "low-ram") {
      this.state.currentMode = "normal"; // recover (evolver is set explicitly, not recovered)
    }
  }

  private _preloadFireAndForget(tag: string): void {
    const canonicalTag = resolveCanonicalTag(tag);
    if (!this._canPreload(canonicalTag)) return;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10_000);

    fetchBackend(`${this.ollamaBase}/api/generate`, {
      backend: "ollama",
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      signal:  ctrl.signal,
      body:    JSON.stringify({
        model:      canonicalTag,
        prompt:     "x",
        stream:     false,
        keep_alive: this._keepAliveFor(canonicalTag),
        options:    { num_predict: 1 },
      }),
    })
      .then((r) => {
        if (r.ok) {
          this.state.activeModels.add(canonicalTag);
          if (MODEL_REGISTRY[canonicalTag]?.is7B) this.state.active7BModel = canonicalTag;
        }
      })
      .catch(() => { /* preload failure is non-critical */ })
      .finally(() => clearTimeout(timeout));
  }

  private _canPreload(tag: string): boolean {
    if (this.state.activeModels.has(tag)) return false;
    const profile = MODEL_REGISTRY[tag];
    if (!profile) return false;

    // Speculative warm-up must not consume the reserve needed for foreground
    // requests and health probes on constrained CPU-only hosts.
    return this.state.availableRamMb >= profile.estimatedRamMb + RAM_CRITICAL_MB;
  }
}

/** Singleton accessor — import and call this, do not call `new ModelOrchestrator()`. */
export function getModelOrchestrator(ollamaBase?: string): ModelOrchestrator {
  return ModelOrchestrator.getInstance(ollamaBase);
}

// ─── Standalone helpers (importable without class instantiation) ──────────────

/**
 * Composer tier selection — arch review §8.
 * Returns 0 (local rules) through 4 (deep swarm) to guide model dispatch.
 */
export function selectComposerTier(
  message: string,
  mode: OrchestratorMode,
  localIntentDetected: boolean,
): ComposerTier {
  if (localIntentDetected) return 0;
  if (mode === "degraded")  return 1;

  const q = message.toLowerCase();
  const deepSignals = [
    "architecture", "refactor", "design", "evolution", "multi-agent",
    "synthesize", "postmortem", "root cause", "incident", "orchestration",
  ];
  const hits = deepSignals.filter((s) => q.includes(s)).length;

  if (hits >= 2 || message.length > 1200) return 4;
  if (hits >= 1 || message.length > 400)  return 3;
  if (message.length > 120)               return 2;
  return 1;
}
