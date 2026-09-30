import { describe, expect, it } from "vitest";
import { STATE_CONFIG } from "@/components/ui/state-badge";

describe("StateBadge contract", () => {
  it("defines a glyph and text label for every supported state", () => {
    for (const [state, config] of Object.entries(STATE_CONFIG)) {
      expect(state).toBeTruthy();
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.glyph).toBeTypeOf("function");
      expect(config.tone.length).toBeGreaterThan(0);
    }
  });
});
