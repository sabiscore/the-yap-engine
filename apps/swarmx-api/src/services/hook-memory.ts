import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadEnv } from "../lib/env.js";
import type { VideoJob } from "../types/video.js";
import { classifyHookFamily } from "../lib/hook-laboratory.js";

const require = createRequire(import.meta.url);
let db: any = null;

function database(): any {
  const env = loadEnv();
  if (env.SWARMX_HOOK_MEMORY_ENABLED !== "1") return null;
  if (db) return db;
  try {
    const path = env.SWARMX_HOOK_MEMORY_DB_PATH;
    mkdirSync(dirname(path), { recursive: true });
    const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => any };
    db = new DatabaseSync(path);
    db.exec(`CREATE TABLE IF NOT EXISTS hook_history (job_id TEXT PRIMARY KEY, hook_text TEXT NOT NULL, hook_family TEXT NOT NULL, preliminary_score REAL NOT NULL, template_family TEXT, niche TEXT, platform TEXT, published_at TEXT, completion_rate REAL, like_rate REAL, scored_at TEXT NOT NULL)`);
    return db;
  } catch { return null; }
}

export async function recordHook(job: VideoJob, hookText: string, score: number): Promise<void> {
  const databaseInstance = database();
  if (!databaseInstance) return;
  try {
    databaseInstance.prepare(`INSERT INTO hook_history (job_id,hook_text,hook_family,preliminary_score,template_family,niche,platform,scored_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET hook_text=excluded.hook_text,hook_family=excluded.hook_family,preliminary_score=excluded.preliminary_score,scored_at=excluded.scored_at`).run(job.id, hookText, classifyHookFamily(hookText), score, job.request.templateFamily ?? null, job.request.niche ?? null, job.request.platform ?? null, new Date().toISOString());
  } catch { /* fail-open */ }
}

export function bestHookFamilies(niche?: string): string[] {
  const databaseInstance = database();
  if (!databaseInstance) return [];
  try {
    return databaseInstance.prepare(`SELECT hook_family FROM hook_history WHERE completion_rate IS NOT NULL AND (? IS NULL OR niche=?) GROUP BY hook_family HAVING COUNT(*)>=2 ORDER BY AVG(completion_rate) DESC LIMIT 3`).all(niche ?? null, niche ?? null).map((row: { hook_family: string }) => row.hook_family);
  } catch { return []; }
}
