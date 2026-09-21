import { describe, expect, it } from "vitest";
import { QUICK_START_PRESETS, mapQuickStartPresetToDraft } from "@/lib/video-form-presets";

describe("video form presets", () => {
  it("defines expected quick-start presets", () => {
    expect(QUICK_START_PRESETS).toHaveLength(4);
    expect(QUICK_START_PRESETS.map((preset) => preset.id)).toEqual([
      "tech-kinetic",
      "finance-explainer",
      "motivational-warm",
      "myth-busting-facts",
    ]);
  });

  it("maps preset fields to a form draft without loss", () => {
    const preset = QUICK_START_PRESETS[0];
    expect(preset).toBeDefined();
    const draft = mapQuickStartPresetToDraft(preset!);

    expect(draft.prompt).toBe(preset!.prompt);
    expect(draft.platform).toBe(preset!.platform);
    expect(draft.niche).toBe(preset!.niche);
    expect(draft.templateFamily).toBe(preset!.templateFamily);
    expect(draft.tone).toBe(preset!.tone);
    expect(draft.style).toBe(preset!.style);
    expect(draft.captionStyle).toBe(preset!.captionStyle);
    expect(draft.voice).toBe(preset!.voice);
    expect(draft.voiceProfileId).toBe(preset!.voiceProfileId);
    expect(draft.storyMode).toBe(preset!.storyMode);
    expect(draft.audience).toBe(preset!.audience);
  });
});