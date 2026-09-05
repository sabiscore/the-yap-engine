import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnv } from "../lib/env.js";
import type { VideoJobRequest } from "../types/video.js";

const API_BASE = "https://freesound.org/apiv2/search/";
const QUERY_MAP: Record<string, string> = {
  tech: "synth pulse loop",
  finance: "business pulse loop",
  facts: "documentary ambience loop",
  true_crime: "dark tension ambience loop",
  motivational: "uplifting pulse loop",
  other: "subtle ambient loop",
};

export async function searchAmbientBed(niche: VideoJobRequest["niche"], tone: VideoJobRequest["tone"]): Promise<string | null> {
  const env = loadEnv();
  if (env.SWARMX_AUDIO_FREESOUND_BED_ENABLED !== "1" || !env.SWARMX_FREESOUND_API_KEY) return null;
  const query = `${QUERY_MAP[niche ?? "other"] ?? QUERY_MAP.other} ${tone ?? "educational"}`;
  const hash = createHash("sha256").update(query).digest("hex").slice(0, 24);
  const target = join(env.SWARMX_FREESOUND_CACHE_DIR, `${hash}.mp3`);
  try { await access(target); return target; } catch { /* cache miss */ }
  try {
    const url = new URL(API_BASE);
    url.searchParams.set("query", query);
    url.searchParams.set("token", env.SWARMX_FREESOUND_API_KEY);
    url.searchParams.set("fields", "license,previews");
    url.searchParams.set("filter", 'duration:[10 TO 40] license:"Creative Commons 0"');
    url.searchParams.set("page_size", "5");
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const payload = await response.json() as { results?: Array<{ license?: string; previews?: { "preview-hq-mp3"?: string; "preview-lq-mp3"?: string } }> };
    const result = payload.results?.find((item) => item.license === "Creative Commons 0");
    const preview = result?.previews?.["preview-hq-mp3"] ?? result?.previews?.["preview-lq-mp3"];
    if (!preview) return null;
    const audio = await fetch(preview, { signal: AbortSignal.timeout(12_000) });
    if (!audio.ok) return null;
    await mkdir(env.SWARMX_FREESOUND_CACHE_DIR, { recursive: true });
    await writeFile(target, Buffer.from(await audio.arrayBuffer()));
    return target;
  } catch { return null; }
}
