import { loadEnv } from "../lib/env.js";
import type { VideoJobRequest } from "../types/video.js";

const cache = new Map<string, { value: string; expiresAt: number }>();
const FEED = "https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en";

export async function getTrendLine(req: VideoJobRequest): Promise<string> {
  const env = loadEnv();
  if (env.SWARMX_TREND_RADAR_ENABLED !== "1") return "";
  const key = req.niche ?? "general";
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const query = encodeURIComponent(`${key} ${req.prompt}`.slice(0, 140));
    const response = await fetch(FEED.replace("{q}", query), { signal: AbortSignal.timeout(6_000) });
    if (!response.ok) return "";
    const xml = await response.text();
    const titles = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g)]
      .map((match) => (match[1] ?? "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 5);
    const value = titles.join(" · ");
    cache.set(key, { value, expiresAt: Date.now() + env.SWARMX_TREND_RADAR_CACHE_TTL_MS });
    return value;
  } catch {
    return "";
  }
}
