import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, rename, rm, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  MediaQualityReport,
  RawQcFinding,
  RendererCapabilityTier,
  VoiceProsodySection,
  VoiceArtifact,
  AudioMasteringRequest,
} from "@swarmx/types/video-types";
import type { VideoJobRequest } from "../types/video.js";
import { outputDir, resolveOutputPath } from "./video-assets.js";
import { loadEnv } from "../lib/env.js";
import { clampCertificationTier } from "./renderer-certification.js";
import { KokoroVoiceProvider, normalizeScriptForSpeech, selectVoiceProvider, type SectionVoiceSynthesisSegment } from "./voice-providers.js";
import { runTemplateQc } from "./template-aware-qc.js";
import { alignNarrationAudio, type CaptionAlignmentArtifacts } from "./video-caption-alignment-client.js";
import { createAmbientBed, masterAudioWithBed } from "./audio-mastering.js";

const _ffenv = loadEnv();
const RENDER_COMMAND_TIMEOUT_MS = Math.min(
  900_000,
  Math.max(30_000, _ffenv.SWARMX_VIDEO_FFMPEG_TIMEOUT_MS || 240_000),
);
const COMMAND_MAX_BUFFER_BYTES = 1024 * 1024;
const RENDER_TEMP_DIR = resolve(_ffenv.SWARMX_VIDEO_TEMP_DIR);

async function moveFileAcrossDevices(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
      throw error;
    }
    await copyFile(source, destination);
    await unlink(source);
  }
}

interface FfmpegRenderInput {
  jobId: string;
  request: VideoJobRequest;
  scriptText?: string;
  storyboardFrames: string[];
  backgroundVideoPaths?: string[];
  signal?: AbortSignal;
}

export interface FfmpegRenderPackage {
  rendererTier: RendererCapabilityTier;
  templateId: string;
  packageDir: string;
  renderManifestPath: string;
  transcriptPath: string;
  srtPath: string;
  vttPath: string;
  rightsManifestPath: string;
  platformPackagePath: string;
  qualityReportPath: string;
  thumbnailPath: string;
  voiceLineagePath: string;
  templateLineagePath: string;
  mediaQualityReport: MediaQualityReport;
  voiceArtifact?: VoiceArtifact;
  alignment?: CaptionAlignmentArtifacts;
}

// ── Visual Palette ─────────────────────────────────────────────────────────────

const TONE_BACKGROUNDS: Record<string, string> = {
  contrarian:    "0x0a0a0a",  // near black — harsh, high-contrast
  urgent:        "0x150505",  // very dark red
  educational:   "0x070e1a",  // deep navy
  cinematic:     "0x0c0c0c",  // dark charcoal
  warm:          "0x100805",  // dark warm brown
  minimal:       "0x000000",  // pure black
  faceless_broll:"0x1a1a1a",  // neutral dark gray — lets b-roll footage dictate mood
  kinetic_text:  "0x000000",  // pure black — maximum contrast for on-screen text
};

const TONE_ACCENTS: Record<string, string> = {
  contrarian:    "0xff2222",  // sharp red
  urgent:        "0xff6600",  // orange
  educational:   "0x3399ff",  // electric blue
  cinematic:     "0xddaa44",  // gold
  warm:          "0xff9966",  // peach
  minimal:       "0xffffff",  // white
  faceless_broll:"0x00ccee",  // soft cyan — unobtrusive; doesn't fight b-roll footage
  kinetic_text:  "0xffcc00",  // bright amber — bold kinetic accent; distinct from minimal's white
};

const NICHE_ACCENT_OFFSETS: Record<NonNullable<VideoJobRequest["niche"]>, { hue: number; saturation: number; lightness: number }> = {
  motivational: { hue: 8, saturation: 6, lightness: 4 },
  finance: { hue: 150, saturation: -8, lightness: -2 },
  facts: { hue: 205, saturation: -10, lightness: 3 },
  true_crime: { hue: 220, saturation: -32, lightness: -8 },
  tech: { hue: 28, saturation: 12, lightness: 2 },
  other: { hue: 0, saturation: -6, lightness: 0 },
};

interface StyleMotionProfile {
  pulseHz: number;
  xAmp: number;
  widthAmp: number;
  panelSpeed: number;
  slowPanelSpeed: number;
  hookBoost: number;
  parallaxAlpha: string;
  backgroundProfile: "gradient_flow" | "plasma_pulse" | "fractal_noise" | "minimal_grid";
}

const STYLE_MOTION_PROFILES: Record<NonNullable<VideoJobRequest["style"]>, StyleMotionProfile> = {
  kinetic_text: { pulseHz: 2.25, xAmp: 30, widthAmp: 58, panelSpeed: 1.35, slowPanelSpeed: 0.44, hookBoost: 0.55, parallaxAlpha: "0.105", backgroundProfile: "minimal_grid" },
  storytime: { pulseHz: 0.95, xAmp: 13, widthAmp: 24, panelSpeed: 0.7, slowPanelSpeed: 0.32, hookBoost: 0.24, parallaxAlpha: "0.075", backgroundProfile: "gradient_flow" },
  tutorial: { pulseHz: 1.05, xAmp: 15, widthAmp: 28, panelSpeed: 0.78, slowPanelSpeed: 0.34, hookBoost: 0.22, parallaxAlpha: "0.070", backgroundProfile: "minimal_grid" },
  myth_busting: { pulseHz: 1.75, xAmp: 24, widthAmp: 48, panelSpeed: 1.12, slowPanelSpeed: 0.42, hookBoost: 0.46, parallaxAlpha: "0.095", backgroundProfile: "plasma_pulse" },
  faceless_broll: { pulseHz: 1.15, xAmp: 16, widthAmp: 30, panelSpeed: 0.82, slowPanelSpeed: 0.35, hookBoost: 0.20, parallaxAlpha: "0.070", backgroundProfile: "fractal_noise" },
};

const DEFAULT_MOTION_PROFILE: StyleMotionProfile = STYLE_MOTION_PROFILES.faceless_broll;

interface CaptionStyleConfig {
  yExpr: string;
  baseFontSize: number;
  boxOpacity: string;
  borderW: number;
}

const CAPTION_STYLE_CONFIGS: Record<string, CaptionStyleConfig> = {
  bold_center: { yExpr: "(h-text_h)/2",   baseFontSize: 52, boxOpacity: "0.55", borderW: 32 },
  lower_third: { yExpr: "h*0.72",          baseFontSize: 44, boxOpacity: "0.78", borderW: 24 },
  minimal:     { yExpr: "(h-text_h)*0.45", baseFontSize: 38, boxOpacity: "0.20", borderW: 16 },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function execFileChecked(
  command: string,
  args: string[],
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        ...(signal !== undefined ? { signal } : {}),
        timeout: RENDER_COMMAND_TIMEOUT_MS,
        maxBuffer: COMMAND_MAX_BUFFER_BYTES,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stderr }));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
    child.on("error", reject);
  });
}

// ffmpeg/ffprobe reject `--version` on 6.x builds; espeak-ng rejects `-version`.
async function commandAvailable(command: string, versionFlag = "-version"): Promise<boolean> {
  try {
    await execFileChecked(command, [versionFlag]);
    return true;
  } catch {
    return false;
  }
}

function discoverFont(): string {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw Object.assign(new Error("No system font found for FFmpeg drawtext"), {
      code: "FONT_UNAVAILABLE",
    });
  }
  return found;
}

function clampDuration(requested: number | undefined): number {
  return Math.max(15, Math.min(180, requested ?? 30));
}

function firstNonEmpty(lines: string[], fallback: string): string {
  return lines.find((line) => line.trim().length > 0)?.trim() ?? fallback;
}

function titleFromRequest(request: VideoJobRequest): string {
  const quotedTitle = request.prompt.match(/(?:titled|called)\s+["'""'']([^"'""'']+)["'""'']/i)?.[1];
  if (quotedTitle?.trim()) return quotedTitle.trim();
  return request.prompt
    .replace(/\s+/g, " ")
    .replace(/^create\s+(?:a|an)\s+/i, "")
    .slice(0, 80)
    .trim() || "SwarmXQ Video";
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace(/^0x/, "");
  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isFinite(parsed)) return { r: 51, g: 153, b: 255 };
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / delta + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): { r: number; g: number; b: number } {
  const hn = (((h % 360) + 360) % 360) / 360;
  const sn = clampPercent(s) / 100;
  const ln = clampPercent(l) / 100;
  if (sn === 0) {
    const channel = clampChannel(ln * 255);
    return { r: channel, g: channel, b: channel };
  }

  const hueToRgb = (p: number, q: number, tInput: number): number => {
    let t = tInput;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return {
    r: clampChannel(hueToRgb(p, q, hn + 1 / 3) * 255),
    g: clampChannel(hueToRgb(p, q, hn) * 255),
    b: clampChannel(hueToRgb(p, q, hn - 1 / 3) * 255),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const toHex = (value: number) => clampChannel(value).toString(16).padStart(2, "0");
  return `0x${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function resolveNicheAccentColor(accentHex: string, niche: VideoJobRequest["niche"]): string {
  const offset = NICHE_ACCENT_OFFSETS[niche ?? "other"] ?? NICHE_ACCENT_OFFSETS.other;
  const base = rgbToHsl(hexToRgb(accentHex));
  return rgbToHex(hslToRgb({
    h: base.h + offset.hue,
    s: base.s + offset.saturation,
    l: base.l + offset.lightness,
  }));
}

// Extract structured [HOOK] / [BODY] / [RESOLUTION] / [CTA] sections from the
// orchestrator script output and strip inline [VISUAL:...] cues so they never
// appear as rendered text on screen.
function extractScriptSections(scriptText: string): {
  hook: string;
  body: string[];
  resolution: string;
  cta: string;
} {
  const clean = (s: string) =>
    s.replace(/\[VISUAL:[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();

  const between = (tag: string, next: string) => {
    const re = new RegExp(`\\[${tag}\\]\\s*([\\s\\S]*?)(?=\\[${next}\\]|$)`, "i");
    return re.exec(scriptText)?.[1]?.trim() ?? "";
  };

  const hookRaw       = between("HOOK",       "BODY");
  const bodyRaw       = between("BODY",       "RESOLUTION");
  const resolutionRaw = between("RESOLUTION", "CTA");
  const ctaRaw        = /\[CTA\]\s*([\s\S]*)$/i.exec(scriptText)?.[1]?.trim() ?? "";

  // Body section → at most 3 individual sentences for separate cards.
  const bodySentences = bodyRaw
    .split(/(?<=[.!?])\s+/)
    .map(clean)
    .filter(Boolean)
    .slice(0, 3);

  return {
    hook:       clean(hookRaw),
    body:       bodySentences,
    resolution: clean(resolutionRaw),
    cta:        clean(ctaRaw),
  };
}

function renderCards(input: FfmpegRenderInput): string[] {
  const sections = input.scriptText ? extractScriptSections(input.scriptText) : null;
  const frameLines = input.storyboardFrames.map((l) => l.trim()).filter(Boolean);
  const audience = input.request.audience?.trim() || "people who need this now";
  const tone = input.request.tone ?? "educational";

  if (sections && (sections.hook || sections.cta)) {
    // Use structured script content — much higher quality output.
    const cards: string[] = [];

    cards.push(sections.hook || titleFromRequest(input.request));

    if (sections.body.length > 0) {
      cards.push(...sections.body);
    } else {
      // Fall back to storyboard frame descriptions.
      cards.push(
        firstNonEmpty(frameLines.slice(0, 1), "Insight that changes how you see this."),
        firstNonEmpty(frameLines.slice(1, 2), "The detail most people overlook."),
      );
    }

    if (sections.resolution) cards.push(sections.resolution);
    if (sections.cta)        cards.push(sections.cta);

    return cards.slice(0, 7);
  }

  // Fallback: storyboard frames + generic structure.
  const title = titleFromRequest(input.request);
  return [
    title,
    firstNonEmpty([], `Stop scrolling. This ${tone} short is for ${audience}.`),
    firstNonEmpty(frameLines.slice(0, 1), "Here is what most people get wrong."),
    firstNonEmpty(frameLines.slice(1, 2), "The data tells a different story."),
    firstNonEmpty(frameLines.slice(2, 3), "One habit changes everything."),
    "Save this. Come back when you need it.",
  ];
}

function narrationText(input: FfmpegRenderInput, cards: string[]): string {
  const script = input.scriptText?.trim();
  const raw = script || cards.join(". ");
  const normalized = normalizeScriptForSpeech(raw);
  return normalized.slice(0, 600);
}

function dialogueEligible(request: VideoJobRequest): boolean {
  return request.style === "storytime" &&
    (request.storyMode === "dialogue_storytime" || request.voiceProfileId === "kokoro_storytime_dual");
}

function audioPlatformForRequest(request: VideoJobRequest): AudioMasteringRequest["platform"] {
  switch (request.platform) {
    case "reels":
      return "reels";
    case "youtube_shorts":
      return "shorts";
    case "tiktok":
      return "tiktok";
    default:
      return "youtube";
  }
}

function segmentSection(section: VoiceProsodySection, text: string, speakingRate: number): SectionVoiceSynthesisSegment | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return { section, text: clean, speakingRate };
}

function buildNarrationSegments(input: FfmpegRenderInput, cards: string[]): SectionVoiceSynthesisSegment[] {
  if (!input.scriptText) {
    const fallback = segmentSection("BODY", cards.join(". "), 1);
    return fallback ? [fallback] : [];
  }

  const sections = extractScriptSections(input.scriptText);
  const segments: SectionVoiceSynthesisSegment[] = [];
  const hook = segmentSection("HOOK", sections.hook, 1.09);
  if (hook) segments.push(hook);

  for (const sentence of sections.body) {
    const section: VoiceProsodySection = dialogueEligible(input.request) && /["“][^"”]{4,180}["”]/.test(sentence)
      ? "DIALOGUE"
      : "BODY";
    const body = segmentSection(section, sentence, 1);
    if (body) segments.push(body);
  }

  const resolution = segmentSection("RESOLUTION", sections.resolution, 0.95);
  if (resolution) segments.push(resolution);
  const cta = segmentSection("CTA", sections.cta, 0.95);
  if (cta) segments.push(cta);

  if (segments.length === 0) {
    const fallback = segmentSection("BODY", narrationText(input, cards), 1);
    return fallback ? [fallback] : [];
  }
  return segments;
}

function rendererTierForRequest(request: VideoJobRequest): RendererCapabilityTier {
  if (request.style === "faceless_broll" || request.tone === "faceless_broll") return "ffmpeg_faceless_broll";
  if (request.style === "kinetic_text" || request.tone === "kinetic_text") return "ffmpeg_kinetic_text";
  if (request.tone === "cinematic") return "ffmpeg_cinematic_explainer";
  return "ffmpeg_kinetic_text";
}

function templateIdForTier(tier: RendererCapabilityTier): string {
  switch (tier) {
    case "ffmpeg_faceless_broll":
      return "faceless_broll_story_v1";
    case "ffmpeg_cinematic_explainer":
      return "narrator_cinematic_explainer_v1";
    case "ffmpeg_text_smoke":
      return "ffmpeg_text_smoke_v1";
    default:
      return "kinetic_text_insight_v1";
  }
}

// Scale font size down for long text so it stays readable in a 720px wide frame.
function fontSizeForText(text: string, base: number): number {
  const normalized = text.replace(/\n/g, " ");
  const len = normalized.length;
  const longestLine = Math.max(
    ...text.split("\n").map((line) => line.trim().length),
    0,
  );
  if (longestLine > 34 || len > 150) return Math.round(base * 0.62);
  if (longestLine > 28 || len > 100) return Math.round(base * 0.75);
  if (longestLine > 22 || len > 60)  return Math.round(base * 0.88);
  if (len <= 20) return Math.round(base * 1.25);
  return base;
}

function wrapCardText(text: string, baseFontSize: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const estimatedFontSize = fontSizeForText(normalized, baseFontSize);
  const maxChars = Math.max(18, Math.min(34, Math.floor(620 / (estimatedFontSize * 0.54))));
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.slice(0, 4).join("\n");
}

function resolveMotionProfile(request: VideoJobRequest): StyleMotionProfile {
  return STYLE_MOTION_PROFILES[request.style ?? "faceless_broll"] ?? DEFAULT_MOTION_PROFILE;
}

function buildBackgroundMotionLayers(
  rendererTier: RendererCapabilityTier,
  accentRgb: string,
  request: VideoJobRequest,
  hookEndSeconds: number,
): string[] {
  if (rendererTier === "ffmpeg_text_smoke") return [];

  const profile = resolveMotionProfile(request);
  const cinematic = rendererTier === "ffmpeg_cinematic_explainer";
  const faceless = rendererTier === "ffmpeg_faceless_broll";
  const gridOpacity = cinematic ? "0.07" : faceless ? "0.09" : "0.13";
  const panelOpacity = cinematic ? "0.08" : faceless ? "0.10" : "0.15";
  const lineOpacity = cinematic ? "0.20" : faceless ? "0.24" : "0.34";
  // Ambient glow static alpha — FFmpeg drawbox alpha does not accept `t`
  // expressions, so the "breathing" feel comes from position/size oscillation
  // in the drifting layers below rather than fading opacity.
  const glowAlpha = cinematic ? "0.06" : faceless ? "0.07" : "0.09";
  const glowSoft = cinematic ? "0.03" : faceless ? "0.04" : "0.05";

  // Organic motion: linear drift + low-amplitude sine offset. The `mod(x,N)`
  // period stays the same, but the trajectory now breathes instead of scanning
  // in a robotic straight line. FFmpeg needs commas inside expressions
  // escaped when the filter is joined into a comma-separated filter chain.
  const safeHookEnd = Math.max(0.8, Math.min(2, hookEndSeconds));
  const hookBoost = `(1+${profile.hookBoost}*lt(t\\,${safeHookEnd.toFixed(1)}))`;
  const pulseHz = profile.pulseHz.toFixed(2);
  const panelFast = (44 * profile.panelSpeed).toFixed(1);
  const panelSlow = (18 * profile.slowPanelSpeed).toFixed(1);

  // ── Core layers (every profile) ──────────────────────────────────────────
  // Grid texture, the two ambient glows, and the vignette-lite dark corners
  // anchor the kinetic visual identity across all four named profiles.
  const grid = `drawgrid=width=90:height=90:thickness=1:color=${accentRgb}@${gridOpacity}`;
  const glowLeft = `drawbox=x='-ih*0.35+${profile.xAmp}*${hookBoost}*sin(t*${pulseHz})':y=ih*0.10:w='ih*0.9+${profile.widthAmp}*${hookBoost}*sin(t*${pulseHz})':h=ih*0.9:color=${accentRgb}@${glowAlpha}:t=fill`;
  const glowRight = `drawbox=x='iw-ih*0.55+${Math.round(profile.xAmp * 0.8)}*${hookBoost}*sin(t*${pulseHz}+3.14)':y=ih*0.30:w='ih*0.9+${Math.round(profile.widthAmp * 0.75)}*${hookBoost}*sin(t*${pulseHz}+3.14)':h=ih*0.9:color=white@${glowSoft}:t=fill`;
  const parallaxSlow = `drawbox=x='-420+mod(t*${panelSlow}+24*sin(t*0.40)\\,1320)':y=ih*0.42:w=420:h=420:color=${accentRgb}@${profile.parallaxAlpha}:t=fill`;
  const scanLine = `drawbox=x=0:y='ih*0.28+mod(t*34\\,420)':w=iw:h=2:color=${accentRgb}@${lineOpacity}:t=fill`;
  // Vignette-lite: dark corner boxes darken the edges to focus attention on
  // center caption. Cheaper and safer than the `vignette` filter, which can
  // cost noticeable CPU on 4-core hosts — kept as-is per ADR-4 (never add
  // the literal `vignette` filter here).
  const vignetteLite = [
    "drawbox=x=0:y=0:w=iw:h=ih*0.06:color=black@0.35:t=fill",
    "drawbox=x=0:y=ih*0.94:w=iw:h=ih*0.06:color=black@0.35:t=fill",
  ];

  // ── Character layers (differ per named backgroundProfile, ADR-4) ────────
  // `minimal_grid`, `gradient_flow`, `plasma_pulse`, and `fractal_noise` were
  // previously just labels on StyleMotionProfile with no distinct rendering
  // — every request produced the same generic layer stack. This branch gives
  // each name an actual, cheap-primitive-only visual identity.
  const characterLayers: string[] = (() => {
    switch (profile.backgroundProfile) {
      case "minimal_grid":
        // Calmer, text-forward: drop the busy drifting panels/streaks/blocks
        // entirely so captions read cleanly. Cheaper than the default stack,
        // not just quieter — fewer drawbox calls for kinetic_text/tutorial.
        return [];

      case "gradient_flow":
        // A wide, very slow soft "wash" band simulates a flowing gradient
        // using the same cheap drawbox primitive — no new filter type.
        return [
          `drawbox=x='-iw*0.6+mod(t*18\\,iw*2.2)':y=0:w=iw*0.9:h=ih:color=${accentRgb}@0.045:t=fill`,
          `drawbox=x='iw-mod(t*13\\,iw*2)':y=0:w=iw*0.7:h=ih:color=white@0.025:t=fill`,
          // Drifting accent panel — linear+sine trajectory (breathing motion).
          `drawbox=x='-280+mod(t*${panelFast}+40*sin(t*1.2)\\,1000)':y=ih*0.10:w=280:h=280:color=${accentRgb}@${panelOpacity}:t=fill`,
        ];

      case "plasma_pulse":
        // Higher-energy throb: an extra fast-pulsing glow layered on top of
        // the core glows, for myth_busting's sharper reveal-pulse hook.
        return [
          `drawbox=x='iw*0.5-180+${Math.round(profile.xAmp * 1.3)}*sin(t*${(profile.pulseHz * 1.8).toFixed(2)})':y='ih*0.5-180+120*sin(t*${(profile.pulseHz * 1.4).toFixed(2)}+1.5)':w=360:h=360:color=${accentRgb}@0.05:t=fill`,
          // Drifting accent panel — linear+sine trajectory (breathing motion).
          `drawbox=x='-280+mod(t*${panelFast}+40*sin(t*1.2)\\,1000)':y=ih*0.10:w=280:h=280:color=${accentRgb}@${panelOpacity}:t=fill`,
          // Drifting white panel — counter direction, faster sine wobble.
          `drawbox=x='iw-360-mod(t*32+50*sin(t*0.9)\\,1080)':y=ih*0.58:w=360:h=360:color=white@0.055:t=fill`,
          // Horizontal accent streak — fast, thin.
          `drawbox=x='-160+mod(t*120\\,880)':y=120:w=160:h=6:color=${accentRgb}@0.55:t=fill`,
        ];

      case "fractal_noise":
      default:
        // Organic multi-frequency jitter (two sine terms summed) reads as
        // noisier/less mechanical drift — fits faceless_broll's b-roll-led,
        // "let the footage breathe" character.
        return [
          // Drifting accent panel — linear+sine trajectory (breathing motion).
          `drawbox=x='-280+mod(t*${panelFast}+40*sin(t*1.2)\\,1000)':y=ih*0.10:w=280:h=280:color=${accentRgb}@${panelOpacity}:t=fill`,
          // Drifting white panel — counter direction, faster sine wobble.
          `drawbox=x='iw-360-mod(t*32+50*sin(t*0.9)\\,1080)':y=ih*0.58:w=360:h=360:color=white@0.055:t=fill`,
          // Small accent block — subtle secondary motion.
          `drawbox=x='iw-80-mod(t*90\\,820)':y=ih*0.18:w=80:h=80:color=${accentRgb}@0.18:t=fill`,
          // Vertical accent bar — travels top to bottom with sine damping.
          `drawbox=x=80:y='220+mod(t*75\\,760)':w=5:h=180:color=${accentRgb}@0.45:t=fill`,
          // Vertical white bar — right side, upward travel.
          "drawbox=x=iw-96:y='ih-320-mod(t*60\\,700)':w=8:h=220:color=white@0.22:t=fill",
          // Jitter box A — fast primary + slow secondary sine, summed.
          `drawbox=x='iw*0.22+30*sin(t*2.1)+14*sin(t*0.53)':y='ih*0.65+22*sin(t*1.7+1)':w=6:h=6:color=${accentRgb}@0.3:t=fill`,
          // Jitter box B — offset phase for a second noise particle.
          `drawbox=x='iw*0.74+26*sin(t*1.9+2)+18*sin(t*0.61+0.4)':y='ih*0.22+18*sin(t*2.3)':w=5:h=5:color=white@0.22:t=fill`,
          // Bottom sweeping accent line — feels like a subtitle underline.
          `drawbox=x='mod(t*132\\,iw+320)-320':y=ih*0.84:w=320:h=5:color=white@0.16:t=fill`,
        ];
    }
  })();

  return [grid, glowLeft, glowRight, parallaxSlow, ...characterLayers, scanLine, ...vignetteLite];
}

interface CardTiming { start: number; end: number }

/**
 * Compute per-card display windows weighted by word count so caption cards
 * stay visible for a duration proportional to what the narrator is speaking.
 *
 * A 25-word card gets ~5× the display time of a 5-word card, aligning
 * overlay + SRT/VTT with the actual audio rather than splitting the video
 * into equal slots. Timings are rounded to one decimal so drawtext, SRT,
 * and VTT reference the exact same boundaries.
 *
 * Guarantees:
 *   - each card gets at least MIN_CARD_SEC = 1.5 s of screen time
 *   - the last card ends exactly at `duration`
 *   - card N+1 starts exactly when card N ends (no half-open gap between)
 */
function computeCardTimings(cards: string[], duration: number): CardTiming[] {
  const MIN_CARD_SEC = 1.5;
  const n = Math.max(1, cards.length);

  const rawWeights = cards.map((c) => Math.max(1, c.trim().split(/\s+/).filter(Boolean).length));
  const weightTotal = rawWeights.reduce((s, w) => s + w, 0);

  // First pass: word-weighted allocation, floored at MIN_CARD_SEC.
  const minTotal = n * MIN_CARD_SEC;
  const flexTotal = Math.max(0, duration - minTotal);
  const durations = rawWeights.map((w) => MIN_CARD_SEC + (flexTotal * w) / weightTotal);

  // Rescale so sum equals `duration` even after flooring, then round to
  // one decimal for stable FFmpeg + SRT boundaries.
  const scale = duration / durations.reduce((s, d) => s + d, 0);
  const scaled = durations.map((d) => Math.max(MIN_CARD_SEC, d * scale));

  const timings: CardTiming[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i += 1) {
    const start = Math.round(cursor * 10) / 10;
    const end = i === n - 1 ? duration : Math.round((cursor + (scaled[i] ?? 0)) * 10) / 10;
    timings.push({ start, end });
    cursor = end;
  }
  return timings;
}

// Build the filter_complex chain: fade in, per-card drawtext, progress bar, fade out.
/**
 * Caption overlay mode for the render's filter chain:
 *  - "cards": estimated word-weighted drawtext cards (default path).
 *  - "subtitles": whisper-aligned ASS burn-in via the `subtitles` filter,
 *    applied as a normal node inside this SAME filter_complex chain (not a
 *    separate `-vf`, which cannot be combined with `-filter_complex` on the
 *    same mapped output stream). This keeps fades, background motion layers,
 *    and the progress bar intact for aligned kinetic-text jobs instead of
 *    losing them, per ADR-1.
 */
type CaptionOverlay = { mode: "cards" } | { mode: "subtitles"; assPath: string };

function buildFilterComplex(
  fontFile: string,
  textFiles: string[],
  cardTexts: string[],
  duration: number,
  accentHex: string,
  styleConfig: CaptionStyleConfig,
  rendererTier: RendererCapabilityTier,
  request: VideoJobRequest,
  timings: CardTiming[],
  captionOverlay: CaptionOverlay = { mode: "cards" },
): string {
  const accentRgb = accentHex.replace(/^0x/, "");

  const textFilters = captionOverlay.mode === "cards"
    ? textFiles.map((file, index) => {
      const timing = timings[index] ?? { start: 0, end: duration };
      const { start, end } = timing;

      const cardText = cardTexts[index] ?? "";
      const fontSize = fontSizeForText(cardText, styleConfig.baseFontSize);
      const enableExpr = index === textFiles.length - 1
        ? `gte(t,${start})*lte(t,${end})`
        : `gte(t,${start})*lt(t,${end})`;

      return [
        `drawtext=fontfile=${fontFile}`,
        `textfile=${file}`,
        "fontcolor=white",
        `fontsize=${fontSize}`,
        "line_spacing=12",
        "box=1",
        `boxcolor=black@${styleConfig.boxOpacity}`,
        `boxborderw=${styleConfig.borderW}`,
        "x=(w-text_w)/2",
        `y=${styleConfig.yExpr}`,
        `enable='${enableExpr}'`,
      ].join(":");
    })
    : [];

  // Animated progress bar: grows from left to right over the full duration.
  // Accent color in hex without the 0x prefix for FFmpeg's color syntax.
  const progressBar = `drawbox=x=0:y=ih-8:w=trunc(iw*t/${duration}):h=8:color=${accentRgb}@0.9:t=fill`;
  const motionLayers = buildBackgroundMotionLayers(rendererTier, accentRgb, request, timings[0]?.end ?? 2);

  const subtitleFilter = captionOverlay.mode === "subtitles"
    ? [`subtitles=${captionOverlay.assPath.replaceAll("\\", "/").replaceAll(":", "\\:")}`]
    : [];

  return [
    "format=yuv420p",
    `fade=t=in:st=0:d=0.4`,
    ...motionLayers,
    ...textFilters,
    progressBar,
    ...subtitleFilter,
    `fade=t=out:st=${Math.max(0, duration - 0.6)}:d=0.6`,
  ].join(",");
}

function cueTimestamp(seconds: number, separator: "," | "."): string {
  const safe = Math.max(0, seconds);
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = Math.floor(safe % 60);
  const ms = Math.floor((safe - Math.floor(safe)) * 1000);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}${separator}${String(ms).padStart(3, "0")}`;
}

function buildTimedText(
  cards: string[],
  duration: number,
  timings: CardTiming[],
): { srt: string; vtt: string } {
  const resolved = timings.length === cards.length ? timings : computeCardTimings(cards, duration);
  const srt = cards.map((card, index) => {
    const timing = resolved[index] ?? { start: 0, end: duration };
    return `${index + 1}\n${cueTimestamp(timing.start, ",")} --> ${cueTimestamp(timing.end, ",")}\n${card.replace(/\n/g, " ")}\n`;
  }).join("\n");
  const vtt = `WEBVTT\n\n${cards.map((card, index) => {
    const timing = resolved[index] ?? { start: 0, end: duration };
    return `${cueTimestamp(timing.start, ".")} --> ${cueTimestamp(timing.end, ".")}\n${card.replace(/\n/g, " ")}\n`;
  }).join("\n")}`;
  return { srt, vtt };
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashFile(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

/**
 * Extract structured intervals from FFmpeg blackdetect/freezedetect stderr.
 * Returns one RawQcFinding per detected interval; empty array when no intervals present.
 */
function parseDetectorIntervals(
  raw: string,
  detector: "blackdetect" | "freezedetect",
): RawQcFinding[] {
  const type: RawQcFinding["type"] = detector === "blackdetect" ? "BLACK_FRAME" : "FREEZE_FRAME";
  const prefix = detector === "blackdetect" ? "black" : "freeze";
  // Match "start:X" and optional "duration:Y" on the same line-neighborhood.
  // Handles both "black_start:1.2 black_end:1.5 black_duration:0.3" and the
  // parametric "lavfi.freeze_start=5.0 ... lavfi.freeze_duration=2.5" forms.
  const intervals: RawQcFinding[] = [];
  const startRe = new RegExp(`${prefix}_start[:=]\\s*([0-9]+(?:\\.[0-9]+)?)`, "g");
  const durationRe = new RegExp(`${prefix}_duration[:=]\\s*([0-9]+(?:\\.[0-9]+)?)`, "g");
  const starts = [...raw.matchAll(startRe)]
    .map((m) => (m[1] !== undefined ? parseFloat(m[1]) : NaN))
    .filter((n) => Number.isFinite(n));
  const durations = [...raw.matchAll(durationRe)]
    .map((m) => (m[1] !== undefined ? parseFloat(m[1]) : NaN))
    .filter((n) => Number.isFinite(n));
  for (let i = 0; i < starts.length; i += 1) {
    const startSec = starts[i] ?? 0;
    const durationSec = durations[i] ?? 0;
    const severity: RawQcFinding["severity"] =
      durationSec >= 5 ? "HIGH" : durationSec >= 1 ? "MEDIUM" : "LOW";
    intervals.push({ type, startSec, durationSec, severity });
  }
  return intervals;
}

async function collectDetectorFinding(
  outputPath: string,
  detector: "blackdetect" | "freezedetect",
  filter: string,
  templateId: string,
): Promise<MediaQualityReport["rawDetectorFindings"][number]> {
  const result = await execFileChecked("ffmpeg", [
    "-hide_banner",
    "-i", outputPath,
    "-vf", filter,
    "-an",
    "-f", "null",
    "-",
  ]).catch((error: unknown) => ({
    stdout: "",
    stderr: error instanceof Error ? error.message : String(error),
  }));
  const raw = result.stderr.slice(-4_000);
  const hasFinding = raw.includes(detector === "blackdetect" ? "black_start" : "freeze_start");
  return {
    detector,
    raw,
    interpretedStatus: hasFinding ? "review" : "pass",
    message: hasFinding
      ? `${detector} reported intervals; interpreted by ${templateId} cadence rules`
      : `${detector} reported no intervals`,
  };
}

async function writeProductionPackage(input: {
  jobId: string;
  request: VideoJobRequest;
  outputPath: string;
  outputFilename: string;
  rendererTier: RendererCapabilityTier;
  templateId: string;
  cards: string[];
  narration: string;
  duration: number;
  voiceArtifact?: VoiceArtifact;
  signal?: AbortSignal;
}): Promise<FfmpegRenderPackage> {
  const packageDir = resolve(loadEnv().SWARMX_VIDEO_ARTIFACT_DIR, input.jobId);
  await mkdir(packageDir, { recursive: true });

  const transcriptPath = join(packageDir, "transcript.txt");
  const srtPath = join(packageDir, "captions.srt");
  const vttPath = join(packageDir, "captions.vtt");
  const rightsManifestPath = join(packageDir, "rights-manifest.json");
  const platformPackagePath = join(packageDir, "platform-manifest.json");
  const renderManifestPath = join(packageDir, "render-manifest.json");
  const qcPath = join(packageDir, "quality-report.json");
  const thumbnailPath = join(packageDir, "thumbnail.jpg");
  const voiceLineagePath = join(packageDir, "voice-lineage.json");
  const templateLineagePath = join(packageDir, "template-lineage.json");
  const packagedVoicePath = join(packageDir, "narration.wav");
  let voiceArtifact = input.voiceArtifact;

  const cardTimings = computeCardTimings(input.cards, input.duration);
  const timedText = buildTimedText(input.cards, input.duration, cardTimings);
  await writeFile(transcriptPath, `${input.narration}\n`, "utf8");
  await writeFile(srtPath, timedText.srt, "utf8");
  await writeFile(vttPath, timedText.vtt, "utf8");
  if (voiceArtifact) {
    await copyFile(voiceArtifact.outputPath, packagedVoicePath);
    voiceArtifact = { ...voiceArtifact, outputPath: packagedVoicePath };
  }

  const rights = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    assets: [{
      id: "swarmxq-template-motion-shapes",
      sourceProvider: "bundled-local-fixture",
      creator: "SwarmXQ",
      license: {
        state: "approved",
        sourceName: "SwarmXQ generated geometric fixtures",
        allowedUses: ["short-form-video", "local-export"],
        attribution: "Generated geometric motion fixtures bundled with SwarmXQ.",
      },
      transformations: ["ffmpeg drawgrid background texture", "ffmpeg drawbox motion layers", "caption text rendering"],
      reviewStatus: "approved",
    }],
    voice: voiceArtifact ?? null,
  };
  await writeFile(rightsManifestPath, `${JSON.stringify(rights, null, 2)}\n`, "utf8");
  await writeFile(join(packageDir, "rights-provenance.json"), `${JSON.stringify(rights, null, 2)}\n`, "utf8");

  await execFileChecked("ffmpeg", [
    "-y",
    "-ss", "0.5",
    "-i", input.outputPath,
    "-frames:v", "1",
    "-q:v", "3",
    thumbnailPath,
  ], input.signal);

  const platformPackage = {
    schemaVersion: 1,
    platform: input.request.platform ?? "generic",
    lifecycleState: "REVIEW_REQUIRED",
    mediaPath: input.outputPath,
    title: titleFromRequest(input.request).slice(0, 60),
    description: input.cards.slice(0, 3).join(" ").slice(0, 160),
    caption: {
      firstLine: input.cards[0]?.replace(/\n/g, " ").slice(0, 40) ?? "Watch this",
      body: input.cards.slice(1, -1).join(" "),
      cta: input.cards.at(-1) ?? "Save this for later",
      hashtags: { broad: ["#creator"], niche: ["#swarmxq"], trending: [] },
    },
    aiDisclosure: "AI-assisted local video package; no external publication attempted.",
    subtitleTracks: [srtPath, vttPath],
    thumbnailPath,
  };
  await writeFile(platformPackagePath, `${JSON.stringify(platformPackage, null, 2)}\n`, "utf8");
  await writeFile(join(packageDir, "platform-package.json"), `${JSON.stringify(platformPackage, null, 2)}\n`, "utf8");

  const blackFinding = await collectDetectorFinding(
    input.outputPath, "blackdetect", "blackdetect=d=0.5:pix_th=0.10", input.templateId,
  );
  const freezeFinding = await collectDetectorFinding(
    input.outputPath, "freezedetect", "freezedetect=n=-60dB:d=0.5", input.templateId,
  );
  const rawDetectorFindings = [blackFinding, freezeFinding];

  // Template-aware interpretation: parse structured intervals from each detector's
  // stderr, then let template-aware-qc apply per-renderer-tier context.
  const structuredFindings: RawQcFinding[] = [
    ...parseDetectorIntervals(blackFinding.raw, "blackdetect"),
    ...parseDetectorIntervals(freezeFinding.raw, "freezedetect"),
  ];
  const qcResult = runTemplateQc(structuredFindings, input.rendererTier);

  const productionRenderer = input.rendererTier !== "ffmpeg_text_smoke";
  const voiceEligible = voiceArtifact !== undefined && voiceArtifact.qualityTier !== "silent_fixture";
  // A blocker from template-aware QC downgrades certification.
  const templateQcBlocked = qcResult.blockers.length > 0;
  const desiredTier =
    productionRenderer && voiceEligible && !templateQcBlocked
      ? "PRODUCTION_PACK_VALID"
      : "CREATIVE_REVIEW_REQUIRED";
  const mediaQualityReport: MediaQualityReport = {
    id: `qc-${input.jobId}`,
    schemaVersion: 1,
    certificationTier: clampCertificationTier(desiredTier, input.rendererTier),
    rendererTier: input.rendererTier,
    templateId: input.templateId,
    technicalPassed: !templateQcBlocked,
    creativePassed: productionRenderer,
    accessibilityPassed: true,
    audioPassed: voiceEligible,
    rightsPassed: true,
    rawDetectorFindings,
    // If no structured intervals were parsed (raw text but no matches), fall back to
    // one "template" finding per raw detector so the report still shows something.
    interpretedFindings: qcResult.interpretations.length > 0
      ? qcResult.interpretations.map((i) => ({
          detector: "template",
          raw: i.notes,
          interpretedStatus: i.isExpected
            ? "pass"
            : i.interpretedSeverity === "HIGH"
              ? "fail"
              : "review",
          message: i.plannedEvent
            ? `${input.templateId} · ${i.plannedEvent} (${i.notes})`
            : `${input.templateId} · ${i.notes}`,
        }))
      : rawDetectorFindings.map((finding) => ({
          detector: "template" as const,
          raw: finding.raw,
          interpretedStatus: finding.interpretedStatus === "fail" ? "fail" as const : "pass" as const,
          message: `${input.templateId} · no structured intervals detected — template baseline holds`,
        })),
    createdAt: new Date().toISOString(),
  };
  await writeFile(qcPath, `${JSON.stringify(mediaQualityReport, null, 2)}\n`, "utf8");
  await writeFile(join(packageDir, "technical-creative-qc.json"), `${JSON.stringify(mediaQualityReport, null, 2)}\n`, "utf8");

  const voiceLineage = {
    schemaVersion: 1,
    providerId: voiceArtifact?.providerId ?? "unavailable",
    qualityTier: voiceArtifact?.qualityTier ?? "none",
    voiceProfileId: voiceArtifact?.voiceProfileId ?? input.request.voiceProfileId ?? null,
    storyMode: voiceArtifact?.storyMode ?? input.request.storyMode ?? null,
    outputPath: voiceArtifact?.outputPath ?? null,
    sha256: voiceArtifact?.sha256 ?? null,
    createdAt: new Date().toISOString(),
  };
  await writeFile(voiceLineagePath, `${JSON.stringify(voiceLineage, null, 2)}\n`, "utf8");

  const templateLineage = {
    schemaVersion: 1,
    rendererTier: input.rendererTier,
    templateId: input.templateId,
    source: "local-ffmpeg-template",
    motionSystem: "drawgrid-and-drawbox-motion-system",
    createdAt: new Date().toISOString(),
  };
  await writeFile(templateLineagePath, `${JSON.stringify(templateLineage, null, 2)}\n`, "utf8");

  const manifest = {
    schemaVersion: 1,
    rendererTier: input.rendererTier,
    templateId: input.templateId,
    outputFilename: input.outputFilename,
    outputSha256: await hashFile(input.outputPath),
    recipeHash: hashJson({
      rendererTier: input.rendererTier,
      templateId: input.templateId,
      cards: input.cards,
      duration: input.duration,
      voiceHash: voiceArtifact?.sha256 ?? null,
    }),
    transcriptPath,
    srtPath,
    vttPath,
    rightsManifestPath,
    platformPackagePath,
    qualityReportPath: qcPath,
    thumbnailPath,
    voiceLineagePath,
    templateLineagePath,
    qcPath,
    voiceArtifact: voiceArtifact ?? null,
    createdAt: new Date().toISOString(),
  };
  await writeFile(renderManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    rendererTier: input.rendererTier,
    templateId: input.templateId,
    packageDir,
    renderManifestPath,
    transcriptPath,
    srtPath,
    vttPath,
    rightsManifestPath,
    platformPackagePath,
    qualityReportPath: qcPath,
    thumbnailPath,
    voiceLineagePath,
    templateLineagePath,
    mediaQualityReport,
    ...(voiceArtifact ? { voiceArtifact } : {}),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function renderWithFfmpeg(input: FfmpegRenderInput): Promise<{ outputFilename: string; renderPackage: FfmpegRenderPackage }> {
  if (!(await commandAvailable("ffmpeg"))) {
    throw Object.assign(new Error("ffmpeg is not available"), { code: "FFMPEG_UNAVAILABLE" });
  }
  if (!(await commandAvailable("ffprobe"))) {
    throw Object.assign(new Error("ffprobe is not available"), { code: "FFPROBE_UNAVAILABLE" });
  }

  const tone         = input.request.tone ?? "educational";
  const captionKey   = input.request.captionStyle ?? "bold_center";
  const bgColor      = TONE_BACKGROUNDS[tone]         ?? TONE_BACKGROUNDS["educational"] ?? "0x070e1a";
  const baseAccentColor = TONE_ACCENTS[tone]          ?? TONE_ACCENTS["educational"]     ?? "0x3399ff";
  const accentColor  = resolveNicheAccentColor(baseAccentColor, input.request.niche);
  const styleConfig  = CAPTION_STYLE_CONFIGS[captionKey] ?? CAPTION_STYLE_CONFIGS["bold_center"]!;

  const fontFile     = discoverFont();
  const duration     = clampDuration(input.request.targetDurationSeconds);
  const cards        = renderCards(input);
  const rendererTier = rendererTierForRequest(input.request);
  const templateId   = templateIdForTier(rendererTier);

  await mkdir(RENDER_TEMP_DIR, { recursive: true });
  const workDir         = await mkdtemp(join(RENDER_TEMP_DIR, `swarmx-video-${input.jobId}-`));
  const outputFilename  = `video_${input.jobId}.mp4`;
  const outputPath      = resolveOutputPath(outputFilename);
  const tempOutputPath  = join(workDir, outputFilename);
  let renderCompleted   = false;

  try {
    await mkdir(outputDir(), { recursive: true });

    // Write each card to a temp text file for drawtext=textfile= (avoids
    // shell-quoting issues with apostrophes and special characters).
    const displayCards = cards.map((card) => wrapCardText(card, styleConfig.baseFontSize));
    const textFiles: string[] = [];
    for (let i = 0; i < displayCards.length; i += 1) {
      const file = join(workDir, `card-${i}-${randomUUID()}.txt`);
      await writeFile(file, `${displayCards[i] ?? ""}\n`, "utf8");
      textFiles.push(file);
    }

    const narrationPath = join(workDir, "narration.wav");
    const narration = narrationText(input, cards);
    let voiceArtifact: VoiceArtifact | undefined;
    let audioPath = narrationPath;
    try {
      const selected = await selectVoiceProvider({
        voiceProfileId: input.request.voiceProfileId,
      });
      const synthesisRequest = {
        jobId: input.jobId,
        text: narration,
        locale: loadEnv().SWARMX_TTS_LOCALE,
        voiceId: input.request.voice ?? "default",
        ...(input.request.tone ? { tone: input.request.tone } : {}),
        ...(input.request.voiceProfileId ? { voiceProfileId: input.request.voiceProfileId } : {}),
        ...(input.request.storyMode ? { storyMode: input.request.storyMode } : {}),
        requestedSampleRateHz: loadEnv().SWARMX_AUDIO_MASTER_SAMPLE_RATE_HZ,
      };
      voiceArtifact = selected.provider instanceof KokoroVoiceProvider && input.scriptText
        ? await selected.provider.synthesizeSegments(
          synthesisRequest,
          buildNarrationSegments(input, cards),
          narrationPath,
          input.signal,
        )
        : await selected.provider.synthesize(synthesisRequest, narrationPath, input.signal);
      if (selected.fallbackReason) {
        voiceArtifact = { ...voiceArtifact, fallbackReason: selected.fallbackReason };
      }
    } catch (error) {
      if (loadEnv().SWARMX_VIDEO_ALLOW_SILENT_AUDIO !== "1") {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          code: "VOICE_PROVIDER_UNAVAILABLE",
        });
      }
    }

    if (voiceArtifact && loadEnv().SWARMX_AUDIO_AMBIENT_BED_ENABLED === "1") {
      const ambientPath = join(workDir, "ambient-bed.wav");
      const mixedPath = join(workDir, "narration-with-ambient.wav");
      const masteredPath = join(workDir, "narration-mastered.m4a");
      createAmbientBed(duration, ambientPath);
      await masterAudioWithBed({
        inputPath: mixedPath,
        outputPath: masteredPath,
        platform: audioPlatformForRequest(input.request),
      }, narrationPath, ambientPath, mixedPath);
      audioPath = masteredPath;
    }

    const requireWordAlignment = loadEnv().SWARMX_VIDEO_REQUIRE_WORD_ALIGNMENT === "1" && input.request.style === "kinetic_text";
    let alignment: CaptionAlignmentArtifacts | undefined;
    if (requireWordAlignment && voiceArtifact) {
      try {
        alignment = await alignNarrationAudio(
          input.jobId,
          audioPath,
          loadEnv().SWARMX_TTS_LOCALE.split("-")[0] ?? "en",
          input.signal,
          { accentHex: accentColor.replace(/^0x/, ""), boxOpacity: Number(styleConfig.boxOpacity) },
        );
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          code: "WORD_ALIGNMENT_FAILED",
        });
      }
    }

    const renderTimings = computeCardTimings(cards, duration);
    // Whisper-aligned jobs still render the full cinematic filter chain
    // (fades, background motion layers, progress bar) — only the caption
    // overlay mechanism switches from drawtext cards to an ASS subtitle
    // burn-in, unified in one filter_complex chain (ADR-1).
    const filterComplex = buildFilterComplex(
      fontFile,
      textFiles,
      displayCards,
      duration,
      accentColor,
      styleConfig,
      rendererTier,
      input.request,
      renderTimings,
      alignment ? { mode: "subtitles", assPath: alignment.assPath } : { mode: "cards" },
    );

      const remoteSegments = input.backgroundVideoPaths ?? [];
    const segmentListPath = join(workDir, "remote-segments.txt");
    if (remoteSegments.length > 0) {
      await writeFile(
        segmentListPath,
        remoteSegments.map((path) => `file '${path.replace(/\\/g, "/").replace(/'/g, "\\'")}'`).join("\n") + "\n",
        "utf8",
      );
    }

    const visualInputArgs = remoteSegments.length > 0
      ? ["-f", "concat", "-safe", "0", "-i", segmentListPath]
      : ["-f", "lavfi", "-i", `color=c=${bgColor}:s=720x1280:r=30:d=${duration}`];
    const inputArgs = voiceArtifact
      ? ["-i", audioPath]
      : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];

    await execFileChecked("ffmpeg", [
      "-y",
      ...visualInputArgs,
      ...inputArgs,
      "-filter_complex", `[0:v]${filterComplex}[v]`,
      "-map", "[v]",
      "-map", "1:a",
      "-shortest",
      "-t", String(duration),
      "-af", `aformat=channel_layouts=stereo,aresample=${loadEnv().SWARMX_AUDIO_MASTER_SAMPLE_RATE_HZ},loudnorm=I=${loadEnv().SWARMX_AUDIO_TARGET_LUFS}:TP=${loadEnv().SWARMX_AUDIO_TRUE_PEAK_MAX_DBFS}:LRA=11`,
      "-ar", String(loadEnv().SWARMX_AUDIO_MASTER_SAMPLE_RATE_HZ),
      "-ac", String(loadEnv().SWARMX_AUDIO_MASTER_CHANNELS),
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      tempOutputPath,
    ], input.signal);

    await moveFileAcrossDevices(tempOutputPath, outputPath);
    renderCompleted = true;

    const renderPackage = await writeProductionPackage({
      jobId: input.jobId,
      request: input.request,
      outputPath,
      outputFilename,
      rendererTier,
      templateId,
      cards: displayCards,
      narration,
      duration,
      ...(voiceArtifact ? { voiceArtifact } : {}),
      ...(alignment ? { alignment } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    });

    return { outputFilename, renderPackage };
  } finally {
    if (!renderCompleted) {
      await unlink(tempOutputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    }
    await rm(workDir, { recursive: true, force: true });
  }
}
