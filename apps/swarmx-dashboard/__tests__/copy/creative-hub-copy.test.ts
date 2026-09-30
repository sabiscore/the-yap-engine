import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Creative Hub copy contract", () => {
  it("does not expose deprecated outcome language in the score component", async () => {
    const source = await readFile(new URL("../../src/components/video/ViralityMeter.tsx", import.meta.url), "utf8");
    expect(source.toLowerCase()).not.toContain("guaranteed");
    expect(source.toLowerCase()).not.toContain("revenue positive");
    expect(source.toLowerCase()).not.toContain("viral score");
    expect(source).toContain("signal estimate");
  });
});
