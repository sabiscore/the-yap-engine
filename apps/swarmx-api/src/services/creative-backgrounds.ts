import type { BackgroundFamily, BackgroundRecipe } from "@swarmx/types/video-types";

const PALETTES: Record<string, BackgroundRecipe["palette"]> = {
  cinematic: { primary: "#0b1020", secondary: "#243b53", accent: "#7dd3fc", neutral: "#e2e8f0" },
  neon: { primary: "#050508", secondary: "#111827", accent: "#00d9ff", neutral: "#f8fafc" },
  editorial: { primary: "#f5f1e8", secondary: "#d8cdbd", accent: "#111827", neutral: "#fafaf9" },
  data: { primary: "#06111a", secondary: "#0f2d3d", accent: "#67e8f9", neutral: "#dbeafe" },
  minimal: { primary: "#09090b", secondary: "#18181b", accent: "#fafafa", neutral: "#a1a1aa" },
};

const FAMILY_DEFAULTS: Record<BackgroundFamily, { palette: keyof typeof PALETTES; renderer: string; resourceClass: BackgroundRecipe["resourceClass"] }> = {
  procedural_2d: { palette: "cinematic", renderer: "ffmpeg", resourceClass: "cpu_light" },
  shader: { palette: "neon", renderer: "three-shader", resourceClass: "gpu_optional" },
  gradient_field: { palette: "cinematic", renderer: "ffmpeg", resourceClass: "cpu_light" },
  plasma: { palette: "neon", renderer: "three-shader", resourceClass: "gpu_optional" },
  fractal_noise: { palette: "cinematic", renderer: "ffmpeg", resourceClass: "cpu_light" },
  minimal_grid: { palette: "data", renderer: "ffmpeg", resourceClass: "cpu_light" },
  editorial_collage: { palette: "editorial", renderer: "ffmpeg", resourceClass: "cpu_light" },
  "2_5d_parallax": { palette: "cinematic", renderer: "ffmpeg-2.5d", resourceClass: "gpu_optional" },
  architectural_2_5d: { palette: "cinematic", renderer: "ffmpeg-2.5d", resourceClass: "gpu_optional" },
  particle_field: { palette: "neon", renderer: "three-particles", resourceClass: "gpu_optional" },
  data_space: { palette: "data", renderer: "three-data", resourceClass: "gpu_optional" },
  generative_plate: { palette: "cinematic", renderer: "remote", resourceClass: "remote_generation" },
  broll_environment: { palette: "cinematic", renderer: "ffmpeg", resourceClass: "cpu_light" },
  blender_3d: { palette: "cinematic", renderer: "blender", resourceClass: "hero_render" },
  hybrid: { palette: "cinematic", renderer: "hybrid", resourceClass: "gpu_optional" },
};

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

export function createBackgroundRecipe(input: {
  id: string;
  family: BackgroundFamily;
  seed?: number;
  palette?: keyof typeof PALETTES;
  complexity?: number;
  motionEnergy?: number;
  renderer?: string;
}): BackgroundRecipe {
  const defaults = FAMILY_DEFAULTS[input.family];
  const complexity = clamp(input.complexity ?? 0.45);
  const motionEnergy = clamp(input.motionEnergy ?? 0.25);
  return {
    id: input.id,
    version: 1,
    family: input.family,
    palette: PALETTES[input.palette ?? defaults.palette]!,
    composition: {
      focalPoint: { x: 0.5, y: 0.42 },
      negativeSpace: "caption-safe",
      captionSafeRegions: ["lower-third", "center-left"],
      subjectSeparation: clamp(0.55 + (1 - complexity) * 0.35),
    },
    depth: { layerCount: Math.max(1, Math.round(2 + complexity * 4)), parallaxStrength: clamp(complexity * 0.55) },
    lighting: {
      keyDirection: "upper-right",
      softness: clamp(0.65 - complexity * 0.2),
      intensity: clamp(0.45 + complexity * 0.25),
      volumetricStrength: clamp(complexity * 0.4),
      rimStrength: clamp(0.2 + complexity * 0.35),
    },
    motion: {
      direction: "diagonal-drift",
      energy: motionEnergy,
      frequency: clamp(0.2 + motionEnergy * 0.6),
      drift: clamp(0.1 + motionEnergy * 0.5),
    },
    texture: {
      noise: clamp(0.08 + complexity * 0.25),
      grain: clamp(0.04 + complexity * 0.12),
      particles: clamp(complexity * 0.4),
      detailDensity: complexity,
    },
    post: {
      bloom: input.family === "minimal_grid" ? 0.08 : clamp(complexity * 0.35),
      haze: clamp(0.08 + complexity * 0.25),
      vignette: 0.15,
      grain: clamp(0.03 + complexity * 0.08),
    },
    seed: input.seed ?? 1,
    renderer: input.renderer ?? defaults.renderer,
    resourceClass: defaults.resourceClass,
  };
}

export function backgroundFamilies(): BackgroundFamily[] {
  return Object.keys(FAMILY_DEFAULTS) as BackgroundFamily[];
}

export function selectBackgroundFamily(input: {
  visualIntent: string;
  resourceClass?: BackgroundRecipe["resourceClass"];
}): BackgroundFamily {
  const intent = input.visualIntent.toLowerCase();
  const family = intent.includes("data") ? "data_space"
    : intent.includes("editorial") || intent.includes("story") ? "editorial_collage"
    : intent.includes("architecture") || intent.includes("environment") ? "architectural_2_5d"
    : intent.includes("energy") || intent.includes("neon") ? "shader"
    : intent.includes("minimal") || intent.includes("proof") ? "minimal_grid"
    : "gradient_field";
  if (input.resourceClass === "cpu_light" && ["shader", "architectural_2_5d"].includes(family)) return "gradient_field";
  return family;
}

export function backgroundBudget(input: {
  captionDensity: number;
  subjectSalience: number;
  visualEventDensity: number;
}): {
  complexity: number;
  motionEnergy: number;
  contrast: number;
  textureDensity: number;
  particleDensity: number;
  highlightDensity: number;
  captionClearance: number;
  subjectClearance: number;
} {
  const competition = clamp(input.captionDensity * 0.45 + input.visualEventDensity * 0.35 + (1 - input.subjectSalience) * 0.2);
  return {
    complexity: clamp(0.78 - competition * 0.62),
    motionEnergy: clamp(0.68 - competition * 0.55),
    contrast: clamp(0.58 - input.captionDensity * 0.3),
    textureDensity: clamp(0.7 - competition * 0.7),
    particleDensity: clamp(0.45 - competition * 0.4),
    highlightDensity: clamp(0.4 - competition * 0.35),
    captionClearance: clamp(0.6 + input.captionDensity * 0.35),
    subjectClearance: clamp(0.6 + input.subjectSalience * 0.35),
  };
}
