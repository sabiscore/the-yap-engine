import { describe, expect, it } from "vitest";
import {
  VIDEO_TEMPLATE_FAMILY_VALUES,
  normalizeVideoTemplateFamily,
} from "@swarmx/types/video-types";

describe("video template contract", () => {
  it("defines one canonical template taxonomy", () => {
    expect(VIDEO_TEMPLATE_FAMILY_VALUES).toEqual([
      "myth-vs-fact",
      "list/countdown",
      "mystery/reveal",
      "product-demo",
      "quote-to-insight",
      "chart/data",
      "motivational",
      "series-recap",
      "pov-immersion",
      "reddit-story",
    ]);
  });

  it("normalizes the legacy listicle value", () => {
    expect(normalizeVideoTemplateFamily("listicle-countdown")).toBe("list/countdown");
  });

  it("preserves canonical values", () => {
    for (const value of VIDEO_TEMPLATE_FAMILY_VALUES) {
      expect(normalizeVideoTemplateFamily(value)).toBe(value);
    }
  });

  it("rejects unknown template values", () => {
    expect(() => normalizeVideoTemplateFamily("unknown-template")).toThrow(/Unsupported video template family/);
  });
});
