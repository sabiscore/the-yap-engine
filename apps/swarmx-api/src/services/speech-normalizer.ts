/**
 * Speech Normalizer & Chunker (R1) — Video Swarm V5
 *
 * Deterministic speech normalizer and sentence-aware chunker.
 * Preserves prosody marks (\n\n, ...,  - ), expands pronunciation,
 * validates duration budgets without arbitrary char truncation, and emits SpeechPlan.
 */
import type {
  ScriptBeatKind,
  SpeechPlan,
  SpeechPlanChunk,
  VideoTone,
} from "@swarmx/types/video-types";
import { log } from "../lib/logger.js";
import {
  expandPronunciations,
  lintNarrationCapitalization,
} from "./pronunciation-dictionary.js";

export class SpeechNormalizationError extends Error {
  code: string;
  details?: Record<string, unknown> | undefined;

  constructor(message: string, code: string, details?: Record<string, unknown> | undefined) {
    super(message);
    this.name = "SpeechNormalizationError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export interface NormalizeScriptOptions {
  jobId?: string;
  tone?: VideoTone;
  targetSeconds?: number;
  voiceId?: string;
  wordsPerSecond?: number;
}

export const BEAT_SPEED_MAP: Record<ScriptBeatKind, number> = {
  HOOK: 1.05,
  BODY: 0.95,
  RESOLUTION: 0.95,
  CTA: 1.00,
};

export const TONE_SPEED_OFFSETS: Record<string, number> = {
  urgent: 0.05,
  cinematic: -0.05,
  educational: -0.03,
  contrarian: 0.02,
  warm: -0.02,
  minimal: 0.00,
  faceless_broll: 0.00,
  kinetic_text: 0.05,
};

export function clampSpeed(speed: number): number {
  return Math.max(0.90, Math.min(1.10, Math.round(speed * 100) / 100));
}

/**
 * Normalizes script text for speech synthesis while preserving prosodic punctuation.
 */
export function normalizeScriptText(rawText: string, options: NormalizeScriptOptions = {}): string {
  if (!rawText || !rawText.trim()) {
    throw new SpeechNormalizationError("Narration text is empty after normalization", "SCRIPT_NORMALIZATION_EMPTY");
  }

  // 1. Strip <think> blocks
  let text = rawText.replace(/<think>[\s\S]*?<\/think>/gi, " ");

  // 2. Strip [VISUAL: ...] lines
  text = text.replace(/\[VISUAL:[^\]]*\]/gi, " ");

  // 3. Strip [HOOK], [BODY], [RESOLUTION], [CTA] tags and beat prefixes (HOOK:, BODY:, etc.)
  text = text.replace(/\[(?:HOOK|BODY|RESOLUTION|CTA)\]/gi, " ");
  text = text.replace(/\b(?:HOOK|BODY|RESOLUTION|CTA)\s*:\s*/gi, " ");

  // 4. Strip bracket tags ([pause:X], [speed:X], [emphasis], [/emphasis]) with warning
  const bracketTagRegex = /\[(pause:[^\]]+|speed:[^\]]+|emphasis|\/emphasis)\]/gi;
  let match: RegExpExecArray | null;
  while ((match = bracketTagRegex.exec(text)) !== null) {
    log.warn({
      msg: "Stripped bracket tag from narration (prosody is punctuation-only in V5)",
      tag: match[1],
      jobId: options.jobId,
    });
  }
  text = text.replace(bracketTagRegex, " ");

  // 5. Strip code blocks and markdown symbols
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/[`*_#>{}[\]]/g, " ");

  // 6. Strip emoji and control characters
  text = text.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "");
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 7. Normalize quotes
  text = text.replace(/[“”]/g, "\"").replace(/[‘’]/g, "'");

  // 8. Punctuation preservation rules:
  // - Clean spaces before punctuation marks
  text = text.replace(/\s+([.,!?;:])/g, "$1");
  // - Normalize paragraph breaks: 2 or more newlines become \n\n
  // - Convert single newlines/tabs to spaces
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\n{2,}/g, "\n\n");
  text = text.replace(/([^\n])\n([^\n])/g, "$1 $2");
  text = text.replace(/[\t\f\v ]+/g, " ");
  text = text.replace(/\s+([.,!?;:])/g, "$1");

  // - Preserve spaced hyphen " - " while normalizing other dashes
  text = text.replace(/—|–/g, " - ");
  text = text.replace(/\s+-\s+/g, " - ");

  // - Collapse >= 4 dots to "..." and preserve single "..."
  text = text.replace(/\.{4,}/g, "...");

  // - Validate "..." count: <= 2 per script, only at sentence end
  const ellipsisMatches = text.match(/\.{3}/g) || [];
  if (ellipsisMatches.length > 2) {
    // Keep first 2, replace subsequent with single dot
    let count = 0;
    text = text.replace(/\.{3}/g, (m) => {
      count += 1;
      return count <= 2 ? m : ".";
    });
  }

  // 9. Expand numbers, currencies, percentages, symbols, and acronyms
  const { expandedText } = expandPronunciations(text);
  text = expandedText;

  // 10. Lint ALL-CAPS tokens
  const capResult = lintNarrationCapitalization(text);
  if (!capResult.valid) {
    throw new SpeechNormalizationError(
      `Narration contains unexpanded ALL-CAPS words: ${capResult.violations.join(", ")}`,
      "SCRIPT_ALL_CAPS_DETECTED",
      { violations: capResult.violations },
    );
  }

  // 11. Word budget & length check
  const words = text.trim().split(/\s+/).filter(Boolean);
  const targetSeconds = options.targetSeconds ?? 30;
  const wps = options.wordsPerSecond ?? 2.5;
  const maxAllowedWords = Math.ceil(targetSeconds * wps * 1.5) + 20;

  if (words.length > maxAllowedWords) {
    throw new SpeechNormalizationError(
      `Script is too long for target duration of ${targetSeconds}s (${words.length} words > limit ${maxAllowedWords})`,
      "SCRIPT_TOO_LONG",
      { wordCount: words.length, maxAllowedWords, targetSeconds },
    );
  }

  const cleaned = text.trim();
  if (!cleaned) {
    throw new SpeechNormalizationError("Narration text is empty after normalization", "SCRIPT_NORMALIZATION_EMPTY");
  }

  return cleaned;
}

/**
 * Splits text into sentence-aware chunks < 500 characters.
 */
export function chunkTextForSpeech(text: string, maxChunkChars = 480): string[] {
  const chunks: string[] = [];
  // Split on paragraph boundaries first
  const paragraphs = text.split(/\n\n+/);

  for (const paragraph of paragraphs) {
    const trimmedPara = paragraph.trim();
    if (!trimmedPara) continue;

    if (trimmedPara.length <= maxChunkChars) {
      chunks.push(trimmedPara);
      continue;
    }

    // Split paragraph by sentence stops (. ! ?)
    const sentences = trimmedPara.match(/[^.!?]+(?:[.!?]+|$)/g) || [trimmedPara];
    let currentChunk = "";

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      if (trimmedSentence.length > maxChunkChars) {
        // Long sentence: split on clause boundaries (; ,  - )
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
        const clauses = trimmedSentence.split(/(?<=[;,]|\s-\s)/);
        for (const clause of clauses) {
          const trimmedClause = clause.trim();
          if (!trimmedClause) continue;

          if ((currentChunk + " " + trimmedClause).trim().length <= maxChunkChars) {
            currentChunk = currentChunk ? `${currentChunk} ${trimmedClause}` : trimmedClause;
          } else {
            if (currentChunk.trim()) chunks.push(currentChunk.trim());
            // If even a single clause exceeds maxChunkChars, force word split
            if (trimmedClause.length > maxChunkChars) {
              const clauseWords = trimmedClause.split(/\s+/);
              let sub = "";
              for (const w of clauseWords) {
                if ((sub + " " + w).trim().length <= maxChunkChars) {
                  sub = sub ? `${sub} ${w}` : w;
                } else {
                  if (sub.trim()) chunks.push(sub.trim());
                  sub = w;
                }
              }
              currentChunk = sub;
            } else {
              currentChunk = trimmedClause;
            }
          }
        }
      } else if ((currentChunk + " " + trimmedSentence).trim().length <= maxChunkChars) {
        currentChunk = currentChunk ? `${currentChunk} ${trimmedSentence}` : trimmedSentence;
      } else {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = trimmedSentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Builds a deterministic SpeechPlan from normalized script text.
 */
export function buildSpeechPlan(
  scriptText: string,
  options: NormalizeScriptOptions & { beatKind?: ScriptBeatKind } = {},
): SpeechPlan {
  const normalized = normalizeScriptText(scriptText, options);
  const rawChunks = chunkTextForSpeech(normalized, 480);
  const toneOffset = options.tone ? (TONE_SPEED_OFFSETS[options.tone] ?? 0) : 0;
  const defaultVoice = options.voiceId ?? "am_adam";

  const planChunks: SpeechPlanChunk[] = rawChunks.map((chunkText, idx) => {
    // Determine beat kind from context or index
    let beatKind: ScriptBeatKind = options.beatKind ?? "BODY";
    if (!options.beatKind) {
      if (idx === 0) beatKind = "HOOK";
      else if (idx === rawChunks.length - 1) beatKind = "CTA";
      else if (idx === rawChunks.length - 2 && rawChunks.length > 3) beatKind = "RESOLUTION";
    }

    const baseSpeed = BEAT_SPEED_MAP[beatKind] ?? 1.0;
    const speed = clampSpeed(baseSpeed + toneOffset);

    // Silence calculation:
    // trailing silence: \n\n -> 400ms, ellipsis -> 1000ms, standard intra-beat -> 120ms
    let trailingSilenceMs = 120;
    if (chunkText.endsWith("...") || chunkText.includes("...")) {
      trailingSilenceMs = 1000;
    } else if (idx === rawChunks.length - 1) {
      trailingSilenceMs = 500;
    } else if (idx === 0) {
      trailingSilenceMs = 300;
    }

    return {
      id: `chunk_${idx + 1}`,
      text: chunkText,
      speed,
      voice: defaultVoice,
      trailingSilenceMs,
      beatKind,
    };
  });

  return {
    schemaVersion: "1.0",
    jobId: options.jobId ?? "job_synthetic",
    chunks: planChunks,
  };
}
