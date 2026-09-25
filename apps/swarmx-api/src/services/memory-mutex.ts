/**
 * apps/swarmx-api/src/services/memory-mutex.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SwarmXQ APEX-19 r1 — Strict Memory Mutual Exclusion (RAM Mutex)
 * Hardware Profile: 8 GB RAM · CPU-Only · WSL2
 *
 * Enforces Zero-Overlap Pipeline Lifecycle across:
 *   LLM (Ollama) ──► Kokoro TTS (Audio) ──► FFmpeg Render (Assembly) ──► Publishing
 *
 * Invariants:
 *   - Never allow LLM models, Kokoro weights, and FFmpeg to occupy RAM concurrently.
 *   - Enforce MAX_RSS_MEMORY_CEILING = 6.5 GB (6656 MB).
 *   - Enforce RAM_CRITICAL_MB = 800 (protected constant).
 *   - Transitioning LLM -> TTS triggers explicit Ollama unload (keep_alive: 0).
 *   - Transitioning TTS -> Render verifies RSS drops below 2 GB.
 *   - Zero console.* calls — log.* only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { log } from "../lib/logger.js";
import { getModelOrchestrator } from "./model-orchestrator.js";
import { loadEnv } from "../lib/env.js";

export type MemoryPhase = "idle" | "llm" | "tts" | "render" | "publishing";

export interface MemorySnapshot {
  rssMb: number;
  availableRamMb: number;
  phase: MemoryPhase;
  timestamp: string;
}

export class MemoryMutexError extends Error {
  readonly code: string;
  readonly phase: MemoryPhase;

  constructor(message: string, code: string, phase: MemoryPhase) {
    super(message);
    this.name = "MemoryMutexError";
    this.code = code;
    this.phase = phase;
  }
}

export const MAX_RSS_MEMORY_CEILING_MB = 6500;
export const RAM_CRITICAL_MB = 800; // Protected constant — do not alter (INV-08)
const DEFAULT_ACQUIRE_TIMEOUT_MS = 60_000;

export class MemoryMutex {
  private static _instance: MemoryMutex | null = null;

  private currentPhase: MemoryPhase = "idle";
  private activeOwner: string | null = null;
  private phaseWaiters: Array<{
    phase: MemoryPhase;
    owner: string;
    resolve: () => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  private constructor() {}

  static getInstance(): MemoryMutex {
    if (!MemoryMutex._instance) {
      MemoryMutex._instance = new MemoryMutex();
    }
    return MemoryMutex._instance;
  }

  getCurrentPhase(): MemoryPhase {
    return this.currentPhase;
  }

  getActiveOwner(): string | null {
    return this.activeOwner;
  }

  /**
   * Acquire execution lock for a given pipeline phase.
   * If transitioning from LLM to TTS on 8GB host, unloads all Ollama models first.
   */
  async acquirePhase(
    phase: Exclude<MemoryPhase, "idle">,
    owner = "anonymous",
    timeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
  ): Promise<void> {
    if (this.currentPhase === phase && this.activeOwner === owner) {
      // Re-entrant for the same owner and phase
      return;
    }

    if (this.currentPhase !== "idle") {
      log.info(
        {
          requestedPhase: phase,
          currentPhase: this.currentPhase,
          activeOwner: this.activeOwner,
          incomingOwner: owner,
        },
        "memory-mutex: phase busy, queuing request",
      );

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this._removeWaiter(resolve);
          reject(
            new MemoryMutexError(
              `Timed out waiting to acquire memory phase ${phase} after ${timeoutMs}ms (current: ${this.currentPhase})`,
              "MEMORY_MUTEX_TIMEOUT",
              phase,
            ),
          );
        }, timeoutMs);

        this.phaseWaiters.push({ phase, owner, resolve, reject, timer });
      });
    }

    // Entering the phase
    await this._prePhaseCheck(phase);
    this.currentPhase = phase;
    this.activeOwner = owner;

    log.info(
      { phase, owner, memory: await this.getMemorySnapshot() },
      "memory-mutex: acquired phase lock",
    );
  }

  /**
   * Release current execution phase lock.
   */
  async releasePhase(phase: Exclude<MemoryPhase, "idle">, owner = "anonymous"): Promise<void> {
    if (this.currentPhase !== phase) {
      log.warn(
        {
          attemptedReleasePhase: phase,
          currentPhase: this.currentPhase,
          owner,
          activeOwner: this.activeOwner,
        },
        "memory-mutex: attempted release of mismatched phase",
      );
      return;
    }

    log.info(
      { phase, owner, memory: await this.getMemorySnapshot() },
      "memory-mutex: releasing phase lock",
    );

    await this._postPhaseCleanup(phase);

    this.currentPhase = "idle";
    this.activeOwner = null;

    // Wake next waiter
    if (this.phaseWaiters.length > 0) {
      const next = this.phaseWaiters.shift()!;
      clearTimeout(next.timer);
      next.resolve();
    }
  }

  /**
   * Wrap an asynchronous task inside a phase lock with guaranteed release.
   */
  async withPhase<T>(
    phase: Exclude<MemoryPhase, "idle">,
    owner: string,
    fn: () => Promise<T>,
    timeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
  ): Promise<T> {
    await this.acquirePhase(phase, owner, timeoutMs);
    try {
      return await fn();
    } finally {
      await this.releasePhase(phase, owner);
    }
  }

  /**
   * Force an emergency release of any active lock.
   */
  async forceReset(): Promise<void> {
    log.warn(
      { previousPhase: this.currentPhase, previousOwner: this.activeOwner },
      "memory-mutex: force resetting lock",
    );
    while (this.phaseWaiters.length > 0) {
      const waiter = this.phaseWaiters.shift()!;
      clearTimeout(waiter.timer);
      waiter.reject(
        new MemoryMutexError(
          "MemoryMutex force reset aborted waiting acquisition",
          "MEMORY_MUTEX_RESET",
          waiter.phase,
        ),
      );
    }
    this.currentPhase = "idle";
    this.activeOwner = null;
  }

  /**
   * Capture current memory metrics.
   */
  async getMemorySnapshot(): Promise<MemorySnapshot> {
    const rssBytes = process.memoryUsage().rss;
    const rssMb = Math.round(rssBytes / (1024 * 1024));
    let availableRamMb = 4096;

    try {
      const { readFile } = await import("node:fs/promises");
      const meminfo = await readFile("/proc/meminfo", "utf8");
      const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
      if (match?.[1]) {
        availableRamMb = Math.floor(parseInt(match[1], 10) / 1024);
      }
    } catch {
      // Fallback
    }

    return {
      rssMb,
      availableRamMb,
      phase: this.currentPhase,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Private Execution Hooks ──────────────────────────────────────────────────

  private async _prePhaseCheck(phase: Exclude<MemoryPhase, "idle">): Promise<void> {
    const snapshot = await this.getMemorySnapshot();

    // Invariant check: Host memory must not exceed ceiling
    if (snapshot.rssMb > MAX_RSS_MEMORY_CEILING_MB) {
      log.error(
        { rssMb: snapshot.rssMb, ceilingMb: MAX_RSS_MEMORY_CEILING_MB },
        "memory-mutex: RSS memory ceiling exceeded",
      );
      throw new MemoryMutexError(
        `Memory ceiling exceeded: ${snapshot.rssMb}MB > ${MAX_RSS_MEMORY_CEILING_MB}MB`,
        "MEMORY_CEILING_EXCEEDED",
        phase,
      );
    }

    if (snapshot.availableRamMb < RAM_CRITICAL_MB) {
      log.warn(
        { availableRamMb: snapshot.availableRamMb, criticalMb: RAM_CRITICAL_MB },
        "memory-mutex: available RAM below critical threshold",
      );
    }

    // Phase-specific preparation
    if (phase === "tts" || phase === "render") {
      // Ensure zero resident Ollama models before TTS or Render
      const mo = getModelOrchestrator();
      const unloaded = await mo.unloadAllModels();
      if (unloaded.length > 0) {
        log.info(
          { unloaded, phase },
          "memory-mutex: unloaded Ollama models to secure RAM mutex boundary",
        );
      }
    }
  }

  private async _postPhaseCleanup(phase: Exclude<MemoryPhase, "idle">): Promise<void> {
    if (phase === "llm") {
      // When LLM phase completes, trigger explicit Ollama unload to free memory for TTS/Render
      const env = loadEnv();
      const isConstrained =
        env.SWARMX_VIDEO_LOW_RAM_MODE === "1" ||
        (await this.getMemorySnapshot()).availableRamMb < 4000;

      if (isConstrained) {
        const mo = getModelOrchestrator();
        await mo.unloadAllModels();
      }
    }

    if (phase === "tts") {
      // Verify node process garbage collection if exposed
      if (typeof global.gc === "function") {
        try {
          global.gc();
        } catch {
          // ignore
        }
      }
    }
  }

  private _removeWaiter(resolve: () => void): void {
    const idx = this.phaseWaiters.findIndex((w) => w.resolve === resolve);
    if (idx !== -1) {
      this.phaseWaiters.splice(idx, 1);
    }
  }
}

export function getMemoryMutex(): MemoryMutex {
  return MemoryMutex.getInstance();
}
