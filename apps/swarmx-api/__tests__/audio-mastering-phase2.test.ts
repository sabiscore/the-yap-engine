import { describe, expect, test } from "vitest";
import { masteringTargets } from "../src/services/audio-mastering.js";

describe("Phase 2 audio mastering targets", () => {
  test("uses speech-first short-form targets", () => {
    expect(masteringTargets()).toEqual({
      speechLUFS: -14,
      ambientLUFS: -26,
      duckFilter: "sidechaincompress=threshold=0.08:ratio=5:attack=10:release=250",
    });
  });
});
