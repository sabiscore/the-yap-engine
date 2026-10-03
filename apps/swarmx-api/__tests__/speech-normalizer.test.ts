import { describe, it, expect } from "vitest";
import {
  normalizeScriptText,
  chunkTextForSpeech,
  buildSpeechPlan,
  SpeechNormalizationError,
} from "../src/services/speech-normalizer.js";

describe("Phase 2: R1 Speech Normalizer & Chunker (V1, V2, V3)", () => {
  describe("V1: Prosody marks preservation & no arbitrary 1200-char truncation", () => {
    it("preserves paragraph breaks \\n\\n", () => {
      const input = "Your phone is lying to you.\n\nHere is how.";
      const normalized = normalizeScriptText(input, { targetSeconds: 30 });
      expect(normalized).toBe("Your phone is lying to you.\n\nHere is how.");
    });

    it("preserves single ellipsis ... at sentence end", () => {
      const input = "Wait for it... It worked.";
      const normalized = normalizeScriptText(input, { targetSeconds: 30 });
      expect(normalized).toContain("Wait for it...");
    });

    it("collapses >= 4 dots to exactly 3 dots", () => {
      const input = "Here comes the surprise..... Done.";
      const normalized = normalizeScriptText(input, { targetSeconds: 30 });
      expect(normalized).toContain("surprise...");
      expect(normalized).not.toContain(".....");
    });

    it("preserves spaced hyphen - for parenthetical beats", () => {
      const input = "The main reason - and this is important - is speed.";
      const normalized = normalizeScriptText(input, { targetSeconds: 30 });
      expect(normalized).toContain(" - ");
    });

    it("normalizes curly quotes to straight quotes", () => {
      const input = "He said “hello” and ‘goodbye’.";
      const normalized = normalizeScriptText(input, { targetSeconds: 30 });
      expect(normalized).toContain('"hello"');
      expect(normalized).toContain("'goodbye'");
    });

    it("does not truncate at 1,200 characters for long scripts", () => {
      const longSentence = "This is a detailed analysis of financial markets that will guide your investments wisely. ";
      const repeated = longSentence.repeat(25); // ~2,250 characters
      expect(repeated.length).toBeGreaterThan(1200);

      const normalized = normalizeScriptText(repeated, { targetSeconds: 120, wordsPerSecond: 2.5 });
      expect(normalized.length).toBeGreaterThan(1200);
    });

    it("throws SCRIPT_TOO_LONG when script exceeds the duration budget", () => {
      const longSentence = "This is a detailed analysis of financial markets that will guide your investments wisely. ";
      const huge = longSentence.repeat(40); // 400+ words
      expect(() => normalizeScriptText(huge, { targetSeconds: 15, wordsPerSecond: 2.0 })).toThrowError(
        SpeechNormalizationError,
      );
    });
  });

  describe("V2: Property test over 1,000 random scripts (all chunks < 500 chars)", () => {
    it("ensures every chunk is strictly < 500 characters across 1,000 generated scripts", () => {
      const vocabulary = [
        "market", "growth", "revenue", "strategy", "algorithm", "innovation",
        "scaling", "execution", "focus", "discipline", "metrics", "customer",
        "retention", "engagement", "opportunity", "leverage", "momentum", "vision",
        "architecture", "systems", "automation", "intelligence", "distributed",
      ];
      const punctuationMarks = [". ", "! ", "? ", ", ", "; ", " - ", "\n\n", "... "];

      for (let i = 0; i < 1000; i++) {
        // Generate random script of 30 to 400 words
        const wordCount = 30 + Math.floor(Math.random() * 370);
        let script = "";
        for (let w = 0; w < wordCount; w++) {
          const word = vocabulary[Math.floor(Math.random() * vocabulary.length)]!;
          const punct = Math.random() < 0.2
            ? punctuationMarks[Math.floor(Math.random() * punctuationMarks.length)]!
            : " ";
          script += word + punct;
        }

        const chunks = chunkTextForSpeech(script, 480);
        expect(chunks.length).toBeGreaterThan(0);
        for (const chunk of chunks) {
          expect(chunk.length).toBeLessThan(500);
          expect(chunk.trim().length).toBeGreaterThan(0);
        }

        // Test that words are preserved in concatenation
        const originalWords = script.trim().split(/\s+/).filter(Boolean);
        const chunkWords = chunks.join(" ").trim().split(/\s+/).filter(Boolean);
        expect(chunkWords.length).toBe(originalWords.length);
      }
    });
  });

  describe("V3: ALL-CAPS linting and bracket tag strip", () => {
    it("strips [pause:Xs], [speed:X], and [emphasis] tags without crashing", () => {
      const input = "Here is the key insight [pause:0.5s] and [emphasis]now watch this[/emphasis].";
      const normalized = normalizeScriptText(input, { targetSeconds: 30 });
      expect(normalized).not.toContain("[pause");
      expect(normalized).not.toContain("[emphasis");
      expect(normalized).not.toContain("[/emphasis");
      expect(normalized).toContain("Here is the key insight and now watch this.");
    });

    it("expands numbers and currencies via pronunciation dictionary", () => {
      const input = "Revenue hit $100 and grew 3.5% in 2026.";
      const normalized = normalizeScriptText(input, { targetSeconds: 30 });
      expect(normalized).toContain("one hundred dollars");
      expect(normalized).toContain("three point five percent");
    });

    it("expands currency scale suffixes like $2.5M and $100K", () => {
      const input = "We raised $2.5M in ARR and spent $100K on marketing.";
      const normalized = normalizeScriptText(input, { targetSeconds: 30 });
      expect(normalized).toContain("two point five million dollars");
      expect(normalized).toContain("A R R");
      expect(normalized).toContain("one hundred thousand dollars");
    });

    it("expands technical terms and acronyms like SQL, OAuth, and FFmpeg without lint failure", () => {
      const input = "Query with SQL, authorize via OAuth, and render using FFmpeg.";
      const normalized = normalizeScriptText(input, { targetSeconds: 30 });
      expect(normalized).toContain("sequel");
      expect(normalized).toContain("oh-auth");
      expect(normalized).toContain("eff-eff-em-peg");
    });

    it("expands standard acronyms like AI and CEO", () => {
      const input = "The CEO presented the new AI strategy.";
      const normalized = normalizeScriptText(input, { targetSeconds: 30 });
      expect(normalized).toContain("C E O");
      expect(normalized).toContain("A I");
    });

    it("fails with SCRIPT_ALL_CAPS_DETECTED when raw ALL-CAPS words remain", () => {
      const input = "This is ABSOLUTELY UNACCEPTABLE behavior.";
      expect(() => normalizeScriptText(input, { targetSeconds: 30 })).toThrowError(
        SpeechNormalizationError,
      );
      try {
        normalizeScriptText(input, { targetSeconds: 30 });
      } catch (err) {
        const error = err as SpeechNormalizationError;
        expect(error.code).toBe("SCRIPT_ALL_CAPS_DETECTED");
        expect(error.details?.violations).toContain("ABSOLUTELY");
        expect(error.details?.violations).toContain("UNACCEPTABLE");
      }
    });
  });

  describe("SpeechPlan generation with beat speeds", () => {
    it("assigns beat speeds: HOOK 1.05, BODY 0.95, CTA 1.00", () => {
      const script = "HOOK: Your phone is lying.\n\nBODY: Here is the truth.\n\nCTA: Follow for more.";
      const plan = buildSpeechPlan(script, { targetSeconds: 30, voiceId: "am_adam" });

      expect(plan.chunks.length).toBeGreaterThanOrEqual(3);
      expect(plan.chunks[0]!.speed).toBe(1.05); // HOOK
      expect(plan.chunks[plan.chunks.length - 1]!.speed).toBe(1.00); // CTA
      expect(plan.chunks[0]!.voice).toBe("am_adam");
    });
  });
});
