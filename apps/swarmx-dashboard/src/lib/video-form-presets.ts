import type { VideoJobRequest } from "./video-dashboard";

export interface QuickStartPreset {
  id: string;
  label: string;
  prompt: string;
  platform: NonNullable<VideoJobRequest["platform"]>;
  niche: NonNullable<VideoJobRequest["niche"]>;
  templateFamily?: NonNullable<VideoJobRequest["templateFamily"]>;
  targetDuration: string;
  tone: NonNullable<VideoJobRequest["tone"]>;
  style: NonNullable<VideoJobRequest["style"]>;
  captionStyle: NonNullable<VideoJobRequest["captionStyle"]>;
  voice: NonNullable<VideoJobRequest["voice"]>;
  voiceProfileId: NonNullable<VideoJobRequest["voiceProfileId"]>;
  storyMode: NonNullable<VideoJobRequest["storyMode"]>;
  audience: string;
}

export interface QuickStartDraft {
  prompt: string;
  platform: NonNullable<VideoJobRequest["platform"]>;
  niche: NonNullable<VideoJobRequest["niche"]>;
  templateFamily?: NonNullable<VideoJobRequest["templateFamily"]>;
  targetDuration: string;
  tone: NonNullable<VideoJobRequest["tone"]>;
  style: NonNullable<VideoJobRequest["style"]>;
  captionStyle: NonNullable<VideoJobRequest["captionStyle"]>;
  voice: NonNullable<VideoJobRequest["voice"]>;
  voiceProfileId: NonNullable<VideoJobRequest["voiceProfileId"]>;
  storyMode: NonNullable<VideoJobRequest["storyMode"]>;
  audience: string;
}

export const QUICK_START_PRESETS: QuickStartPreset[] = [
  {
    id: "tech-kinetic",
    label: "Tech Kinetic",
    prompt: "Create a 30-second kinetic-text video titled '3 AI workflow mistakes costing you hours every week' with a hard-hitting hook, escalating stakes, and one specific workflow fix.",
    platform: "tiktok",
    niche: "tech",
    templateFamily: "list/countdown",
    targetDuration: "30",
    tone: "urgent",
    style: "kinetic_text",
    captionStyle: "bold_center",
    voice: "energetic",
    voiceProfileId: "kokoro_energetic",
    storyMode: "single_narrator",
    audience: "early-career developers and creators",
  },
  {
    id: "finance-explainer",
    label: "Finance Explainer",
    prompt: "Create a 45-second faceless video titled 'Why your salary still feels tight after a raise' with one counterintuitive claim, one practical example, and a concrete weekly action.",
    platform: "reels",
    niche: "finance",
    templateFamily: "pov-immersion",
    targetDuration: "60",
    tone: "educational",
    style: "faceless_broll",
    captionStyle: "lower_third",
    voice: "narrator",
    voiceProfileId: "kokoro_narrator",
    storyMode: "single_narrator",
    audience: "young professionals and first-time investors",
  },
  {
    id: "motivational-warm",
    label: "Motivation Story",
    prompt: "Create a 30-second storytime video titled 'The 10-minute rule that beats procrastination' with emotional progression from resistance to action and a save-worthy CTA.",
    platform: "youtube_shorts",
    niche: "motivational",
    templateFamily: "reddit-story",
    targetDuration: "30",
    tone: "warm",
    style: "storytime",
    captionStyle: "bold_center",
    voice: "calm",
    voiceProfileId: "kokoro_warm",
    storyMode: "dialogue_storytime",
    audience: "students and solo builders",
  },
  {
    id: "myth-busting-facts",
    label: "Myth Bust",
    prompt: "Create a 30-second myth-busting video titled 'No, multitasking is not making you faster' that opens with a contrarian line, gives one proof point, and ends with a behavior change CTA.",
    platform: "tiktok",
    niche: "facts",
    templateFamily: "myth-vs-fact",
    targetDuration: "30",
    tone: "contrarian",
    style: "myth_busting",
    captionStyle: "bold_center",
    voice: "default",
    voiceProfileId: "kokoro_contrarian",
    storyMode: "single_narrator",
    audience: "knowledge workers and creators",
  },
];

export function mapQuickStartPresetToDraft(preset: QuickStartPreset): QuickStartDraft {
  const draft: QuickStartDraft = {
    prompt: preset.prompt,
    platform: preset.platform,
    niche: preset.niche,
    targetDuration: preset.targetDuration,
    tone: preset.tone,
    style: preset.style,
    captionStyle: preset.captionStyle,
    voice: preset.voice,
    voiceProfileId: preset.voiceProfileId,
    storyMode: preset.storyMode,
    audience: preset.audience,
  };

  if (preset.templateFamily !== undefined) {
    draft.templateFamily = preset.templateFamily;
  }

  return draft;
}