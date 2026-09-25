/**
 * apps/swarmx-api/src/services/virality-cheatbook-tracker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SwarmXQ APEX-19 r1 — Virality Cheatbook Telemetry Logger
 *
 * Logs creative, structural, and performance DNA of generated videos:
 *  - Hook style, latency, and typography
 *  - Word boundary count and prosody markers
 *  - Retention interrupt cadence (2.8s)
 *  - Virality score heuristics and platform targets
 *  - Appends to data/virality_cheatbook.json
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { log } from "../lib/logger.js";

export interface ViralityCheatbookEntry {
  jobId: string;
  campaignId?: string;
  topic: string;
  niche: string;
  tone: string;
  hookStyle: string;
  hookText: string;
  hookLatencyMs: number;
  retentionInterruptCadenceSeconds: number;
  prosodyTagsUsed: string[];
  wordBoundaryCount: number;
  platform: string;
  viralityScore: number;
  recommendations: string[];
  captionDraft?: string;
  timestamp: string;
}

export function getCheatbookFilePath(): string {
  if (process.cwd().endsWith("swarmx-api")) {
    return resolve(process.cwd(), "..", "..", "data", "virality_cheatbook.json");
  }
  return resolve(process.cwd(), "data", "virality_cheatbook.json");
}

export async function readViralityCheatbook(): Promise<ViralityCheatbookEntry[]> {
  const filePath = getCheatbookFilePath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function recordViralityCheatbookEntry(entry: ViralityCheatbookEntry): Promise<void> {
  const filePath = getCheatbookFilePath();
  try {
    await mkdir(dirname(filePath), { recursive: true });
    const current = await readViralityCheatbook();
    // Prepend or append new entry (capped at recent 500 for bounded storage)
    const updated = [entry, ...current.filter((e) => e.jobId !== entry.jobId)].slice(0, 500);
    await writeFile(filePath, JSON.stringify(updated, null, 2), "utf8");
    log.info(
      { jobId: entry.jobId, hookStyle: entry.hookStyle, viralityScore: entry.viralityScore },
      "virality-cheatbook: entry logged to data/virality_cheatbook.json",
    );
  } catch (err) {
    log.warn(
      { jobId: entry.jobId, err: err instanceof Error ? err.message : String(err) },
      "virality-cheatbook: failed to write telemetry entry",
    );
  }
}
