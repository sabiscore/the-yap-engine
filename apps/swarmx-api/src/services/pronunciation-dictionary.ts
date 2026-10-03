/**
 * Pronunciation Dictionary — V1 (builtin-v1)
 *
 * Expands numbers, percentages, currencies, symbols, and acronyms into spoken words
 * for Kokoro and TTS pipelines, and provides strict ALL-CAPS linting (Gate G-S).
 */
import { log } from "../lib/logger.js";

export const PRONUNCIATION_DICTIONARY_VERSION = "builtin-v1";

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];

const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

const SCALES = ["", "thousand", "million", "billion", "trillion"];

export function numberToWords(num: number): string {
  if (!Number.isFinite(num)) return String(num);
  if (num === 0) return "zero";
  if (num < 0) return `negative ${numberToWords(Math.abs(num))}`;

  // Decimals
  if (!Number.isInteger(num)) {
    const [wholePart, decimalPart] = String(num).split(".");
    const wholeWords = numberToWords(Number(wholePart));
    const decimalDigits = (decimalPart ?? "")
      .split("")
      .map((d) => (d === "0" ? "zero" : ONES[Number(d)]))
      .join(" ");
    return `${wholeWords} point ${decimalDigits}`;
  }

  // Large years (e.g. 1990 - 2099)
  if (num >= 1900 && num <= 2099 && num % 100 !== 0) {
    const century = Math.floor(num / 100);
    const year = num % 100;
    const centuryWords = numberToWords(century);
    const yearWords = year < 10 ? `oh ${ONES[year]}` : numberToWords(year);
    return `${centuryWords} ${yearWords}`;
  }

  let words = "";
  let scaleIndex = 0;
  let remaining = num;

  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk !== 0) {
      const chunkWords = chunkToWords(chunk);
      const scale = SCALES[scaleIndex];
      words = scale ? `${chunkWords} ${scale} ${words}`.trim() : `${chunkWords} ${words}`.trim();
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex += 1;
  }

  return words.trim();
}

function chunkToWords(num: number): string {
  let str = "";
  if (num >= 100) {
    str += `${ONES[Math.floor(num / 100)]} hundred `;
    num %= 100;
  }
  if (num >= 20) {
    str += `${TENS[Math.floor(num / 10)]}`;
    if (num % 10 > 0) {
      str += `-${ONES[num % 10]}`;
    }
  } else if (num > 0) {
    str += `${ONES[num]}`;
  }
  return str.trim();
}

const COMMON_ACRONYMS: Record<string, string> = {
  AI: "A I",
  API: "A P I",
  CEO: "C E O",
  CTO: "C T O",
  CFO: "C F O",
  COO: "C O O",
  CMO: "C M O",
  CPU: "C P U",
  GPU: "G P U",
  RAM: "ram",
  ROM: "rom",
  SSD: "S S D",
  HDD: "H D D",
  URL: "U R L",
  HTTP: "H T T P",
  HTTPS: "H T T P S",
  HTML: "H T M L",
  CSS: "C S S",
  JS: "J S",
  TS: "T S",
  UI: "U I",
  UX: "U X",
  LLM: "L L M",
  TTS: "T T S",
  ASR: "A S R",
  ROI: "R O I",
  KPI: "K P I",
  SaaS: "sass",
  B2B: "B to B",
  B2C: "B to C",
  SEO: "S E O",
  USA: "U S A",
  UK: "U K",
  EU: "E U",
  FAQ: "F A Q",
  DIY: "D I Y",
  POV: "P O V",
  CTA: "C T A",
  AIGC: "A I G C",
  OK: "okay",
  SQL: "sequel",
  ARR: "A R R",
  MRR: "M R R",
  AWS: "A W S",
  GCP: "G C P",
  SDK: "S D K",
  CLI: "C L I",
  PR: "P R",
  OS: "O S",
  IP: "I P",
  P2P: "P to P",
  OAUTH: "oh-auth",
  FFMPEG: "eff-eff-em-peg",
};

const TECHNICAL_TERMS: Record<string, string> = {
  OAuth: "oh-auth",
  oauth: "oh-auth",
  FFmpeg: "eff-eff-em-peg",
  ffmpeg: "eff-eff-em-peg",
  PostgreSQL: "post-gres-cue-ell",
  Postgres: "post-gres",
};

const CURRENCY_SUFFIXES: Record<string, string> = {
  k: "thousand",
  K: "thousand",
  m: "million",
  M: "million",
  b: "billion",
  B: "billion",
  t: "trillion",
  T: "trillion",
};

const CURRENCY_SYMBOLS: Record<string, { singular: string; plural: string }> = {
  $: { singular: "dollar", plural: "dollars" },
  "€": { singular: "euro", plural: "euros" },
  "£": { singular: "pound", plural: "pounds" },
  "¥": { singular: "yen", plural: "yen" },
};

export interface ExpansionResult {
  expandedText: string;
  expandedTokens: Array<{ original: string; expanded: string }>;
}

export function expandPronunciations(text: string): ExpansionResult {
  const expandedTokens: Array<{ original: string; expanded: string }> = [];

  let result = text;

  // 1. Currencies: $100, $3.50, €50, $2.5M, $100K, etc.
  result = result.replace(/([$€£¥])(\d+(?:\.\d+)?)\s*([kKmMbBtT])?(?!\w)/g, (_match, symbol: string, amountStr: string, suffix?: string) => {
    const amount = Number(amountStr);
    const unit = CURRENCY_SYMBOLS[symbol] ?? { singular: "dollar", plural: "dollars" };
    const numWords = numberToWords(amount);
    let expanded: string;
    if (suffix && CURRENCY_SUFFIXES[suffix]) {
      const scale = CURRENCY_SUFFIXES[suffix]!;
      expanded = `${numWords} ${scale} ${unit.plural}`;
    } else {
      expanded = `${numWords} ${amount === 1 ? unit.singular : unit.plural}`;
    }
    const token = `${symbol}${amountStr}${suffix ?? ""}`;
    expandedTokens.push({ original: token, expanded });
    return expanded;
  });

  // 2. Percentages: 3.5%, 100%, 15 %
  result = result.replace(/(\d+(?:\.\d+)?)\s*%/g, (_match, numStr: string) => {
    const numWords = numberToWords(Number(numStr));
    const expanded = `${numWords} percent`;
    expandedTokens.push({ original: `${numStr}%`, expanded });
    return expanded;
  });

  // 3. Technical terms (case-sensitive replacements before numbers)
  for (const [term, spoken] of Object.entries(TECHNICAL_TERMS)) {
    const regex = new RegExp(`\\b${term}\\b`, "g");
    if (regex.test(result)) {
      result = result.replace(regex, spoken);
      expandedTokens.push({ original: term, expanded: spoken });
    }
  }

  // 4. Standalone numbers with decimals or integers: e.g. "42", "3.14" (not part of words)
  result = result.replace(/\b(\d+(?:\.\d+)?)\b/g, (match) => {
    const numWords = numberToWords(Number(match));
    expandedTokens.push({ original: match, expanded: numWords });
    return numWords;
  });

  // 5. Mathematical symbols & operators
  result = result.replace(/(\s|^)&(\s|$)/g, "$1and$2");
  result = result.replace(/(\s|^)\+(\s|$)/g, "$1plus$2");
  result = result.replace(/(\s|^)=(\s|$)/g, "$1equals$2");
  result = result.replace(/(\s|^)@(\s|$)/g, "$1at$2");

  // 6. Common acronyms
  for (const [acronym, spoken] of Object.entries(COMMON_ACRONYMS)) {
    const regex = new RegExp(`\\b${acronym}\\b`, "g");
    if (regex.test(result)) {
      result = result.replace(regex, spoken);
      expandedTokens.push({ original: acronym, expanded: spoken });
    }
  }

  return { expandedText: result, expandedTokens };
}

export interface CapitalizationLintResult {
  valid: boolean;
  violations: string[];
}

/**
 * Gate G-S enforcement: Narration must contain zero ALL-CAPS words (tokens with >= 2 uppercase letters).
 */
export function lintNarrationCapitalization(text: string): CapitalizationLintResult {
  // Strip code blocks or quotes if any remain
  const clean = text.replace(/`[^`]*`/g, "");
  // Find words of length >= 2 with at least two uppercase letters and no lowercase letters
  const tokens = clean.match(/\b[A-Z]{2,}\b/g) || [];
  const violations = tokens.filter((tok) => !COMMON_ACRONYMS[tok] && !TECHNICAL_TERMS[tok]);

  if (violations.length > 0) {
    log.warn({
      msg: "Script ALL-CAPS lint failed",
      violations,
    });
    return { valid: false, violations };
  }

  return { valid: true, violations: [] };
}
