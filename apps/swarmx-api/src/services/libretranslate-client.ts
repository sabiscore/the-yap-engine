import { loadEnv } from "../lib/env.js";

export async function translateCaption(text: string, targetLang: string): Promise<string | null> {
  const base = loadEnv().SWARMX_LIBRETRANSLATE_URL;
  if (!base || !targetLang.trim()) return null;
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: text, source: "auto", target: targetLang, format: "text" }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { translatedText?: string };
    return payload.translatedText?.trim() || null;
  } catch {
    return null;
  }
}
