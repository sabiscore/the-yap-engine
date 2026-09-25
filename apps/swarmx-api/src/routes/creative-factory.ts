import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  AudiencePersona,
  BackgroundRecipe,
  BrandKit,
  ConceptCandidate,
  ConceptTournament,
  CreativeAgentSpec,
  CreativeDNA,
  CreativeFactoryStage,
  VariantRecord,
  VideoBlueprint,
} from "@swarmx/types/video-types";
import {
  CREATIVE_FACTORY_STAGE_ORDER,
  checkpointWorkflowStage,
  createWorkflowRun,
  getWorkflowRun,
  listWorkflowRuns,
  workflowDefinitions,
} from "../services/creative-factory-workflow.js";
import {
  getRegistryRecord,
  listPlatformCapabilities,
  listRegistryRecords,
  upsertRegistryRecord,
} from "../services/creative-factory-registry.js";
import { runConceptTournament } from "../services/creative-tournament.js";
import { backgroundFamilies, backgroundBudget, createBackgroundRecipe, selectBackgroundFamily } from "../services/creative-backgrounds.js";
import { compileCreativeArtifact, deriveAudioTimingSpine } from "../services/creative-compiler.js";
import { generateRetentionMap } from "../services/retention-map.js";
import {
  createLearningRecord,
  listLearningRecords,
  listPerformanceSnapshots,
  recordPerformanceSnapshot,
} from "../services/creative-factory-analytics.js";
import { normalizeRuntimeProfileId } from "../services/runtime-profiles.js";
import { requireVideoWriteAuth } from "../services/video-auth.js";

const CapabilityRequirementSchema = z.object({
  capability: z.string().min(1),
  requiredFor: z.array(z.enum(["QUICK_DRAFT", "PLAN_ONLY", "PRODUCTION_PACK", "FULL_RENDER", "PUBLISH_BUNDLE", "PUBLISH_AND_LEARN"])).min(1),
  state: z.enum(["available", "degraded", "unavailable"]),
  reason: z.string().optional(),
  action: z.string().optional(),
});

const WorkflowRunBodySchema = z.object({
  mode: z.enum(["QUICK_DRAFT", "PLAN_ONLY", "PRODUCTION_PACK", "FULL_RENDER", "PUBLISH_BUNDLE", "PUBLISH_AND_LEARN"]),
  profile: z.enum([
    "constrained_cpu_8gb",
    "standard_cpu_16gb",
    "accelerated_optional",
    "constrained_cpu",
    "standard_cpu",
  ]),
  idempotencyKey: z.string().min(1).max(160),
  capabilityRequirements: z.array(CapabilityRequirementSchema).optional(),
});

const WorkflowCheckpointBodySchema = z.object({
  stage: z.enum(CREATIVE_FACTORY_STAGE_ORDER),
  status: z.enum(["pending", "running", "checkpointed", "complete", "failed", "skipped", "blocked"]),
  revision: z.number().int().min(0),
  outputRef: z.string().max(500).optional(),
  errorCode: z.string().max(100).optional(),
  errorMessage: z.string().max(1000).optional(),
});

const BrandKitBodySchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  voicePrinciples: z.array(z.string().min(1)).min(1).max(12),
  colorTokens: z.record(z.string(), z.string().min(1)),
  typographyTokens: z.record(z.string(), z.string().min(1)).default({}),
  visualMotifs: z.array(z.string().min(1)).default([]),
  forbiddenClaims: z.array(z.string().min(1)).default([]),
  revision: z.number().int().min(0).optional(),
});

const AudienceBodySchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  pains: z.array(z.string().min(1)).default([]),
  desiredOutcomes: z.array(z.string().min(1)).default([]),
  platformHabits: z.record(z.enum(["tiktok", "reels", "shorts", "generic"]), z.string()).default({}),
  languageLocale: z.string().min(2).max(30).default("en-US"),
  revision: z.number().int().min(0).optional(),
});

const PerformanceSnapshotBodySchema = z.object({
  packageId: z.string().min(1),
  platform: z.enum(["tiktok", "reels", "shorts", "generic"]),
  observedAt: z.string().datetime().optional(),
  views: z.number().int().min(0).optional(),
  likes: z.number().int().min(0).optional(),
  shares: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
  completionRate: z.number().min(0).max(1).optional(),
  averageWatchSeconds: z.number().min(0).optional(),
});

const LearningRecordBodySchema = z.object({
  sourceExperimentId: z.string().min(1).optional(),
  sourcePackageId: z.string().min(1).optional(),
  recommendation: z.string().min(1).max(1000),
  evidence: z.string().min(1).max(1000),
  approvalState: z.enum(["pending", "approved", "rejected"]).optional(),
});

const ConceptCandidateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  premise: z.string().min(1).max(1000),
  hookFamily: z.string().min(1).max(80),
  visualLanguage: z.string().min(1).max(200),
  emotionalArc: z.string().min(1).max(200),
  CTAStyle: z.string().min(1).max(200),
  feasibility: z.number().min(0).max(1),
  originality: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

const ConceptTournamentBodySchema = z.object({
  runId: z.string().min(1).optional(),
  creativeDnaId: z.string().min(1),
  candidates: z.array(ConceptCandidateSchema).min(2).max(12),
});



const BackgroundPreviewSchema = z.object({
  id: z.string().min(1).max(120),
  family: z.enum([
    "procedural_2d", "shader", "gradient_field", "plasma", "fractal_noise", "minimal_grid",
    "editorial_collage", "2_5d_parallax", "architectural_2_5d", "particle_field", "data_space",
    "generative_plate", "broll_environment", "blender_3d", "hybrid",
  ]).optional(),
  visualIntent: z.string().min(1).max(200).optional(),
  seed: z.number().int().min(0).max(2147483647).optional(),
  complexity: z.number().min(0).max(1).optional(),
  motionEnergy: z.number().min(0).max(1).optional(),
  captionDensity: z.number().min(0).max(1).default(0.35),
  subjectSalience: z.number().min(0).max(1).default(0.75),
  visualEventDensity: z.number().min(0).max(1).default(0.35),
});

const CreativeCompileSchema = z.object({
  id: z.string().min(1).max(120),
  creativeDnaId: z.string().min(1).max(120),
  rendererVersion: z.string().min(1).max(120).optional(),
  changed: z.array(z.string().min(1).max(160)).max(100).default([]),
  scenes: z.array(z.object({
    id: z.string().min(1).max(120),
    purpose: z.string().min(1).max(200),
    startSec: z.number().min(0),
    endSec: z.number().positive(),
    narrative: z.object({
      beat: z.string().min(1),
      semanticIntent: z.string().min(1),
      spokenText: z.string(),
      emotionalState: z.string().min(1),
    }),
    composition: z.object({
      shotType: z.string().min(1),
      focalPoint: z.string().min(1),
      negativeSpace: z.string().min(1),
      captionSafeZone: z.string().min(1),
    }),
    camera: z.object({ framing: z.string(), movement: z.string(), depth: z.number().min(0).max(1), easing: z.string() }),
    background: z.object({
      recipeId: z.string().min(1),
      complexity: z.number().min(0).max(1),
      motionEnergy: z.number().min(0).max(1),
      seed: z.number().int(),
    }),
    visual: z.object({ visualEvent: z.string(), transitionIn: z.string(), transitionOut: z.string(), motif: z.string() }),
    audio: z.object({ beatAnchorsMs: z.array(z.number().min(0)), accentPointsMs: z.array(z.number().min(0)) }),
    caption: z.object({ style: z.string(), emphasisWords: z.array(z.string()) }),
  })).min(1).max(200),
  backgroundRecipes: z.array(z.object({
    id: z.string(), version: z.number().int(), family: z.string(), palette: z.object({
      primary: z.string(), secondary: z.string(), accent: z.string(), neutral: z.string(),
    }), composition: z.object({
      focalPoint: z.object({x:z.number(),y:z.number()}), negativeSpace:z.string(),
      captionSafeRegions:z.array(z.string()), subjectSeparation:z.number(),
    }), depth:z.object({layerCount:z.number().int(),parallaxStrength:z.number()}),
    lighting:z.object({keyDirection:z.string(),softness:z.number(),intensity:z.number(),volumetricStrength:z.number(),rimStrength:z.number()}),
    motion:z.object({direction:z.string(),energy:z.number(),frequency:z.number(),drift:z.number()}),
    texture:z.object({noise:z.number(),grain:z.number(),particles:z.number(),detailDensity:z.number()}),
    post:z.object({bloom:z.number(),haze:z.number(),vignette:z.number(),grain:z.number()}),
    seed:z.number().int(), renderer:z.string(), resourceClass:z.enum(["cpu_light","gpu_optional","hero_render","remote_generation"]),
  })).default([]),
  audioTiming: z.object({
    durationMs:z.number().int().min(0),
    words:z.array(z.object({word:z.string(),startMs:z.number().min(0),endMs:z.number().min(0)})),
    sections:z.array(z.object({label:z.string(),startMs:z.number(),endMs:z.number()})).optional(),
    beatsMs:z.array(z.number()).optional(),
    onsetsMs:z.array(z.number()).optional(),
  }).optional(),
});

function sendParseError(reply: FastifyReply, error: z.ZodError): FastifyReply {
  return reply.status(400).send({
    error: "invalid_request",
    message: "Request validation failed",
    details: error.flatten().fieldErrors,
  });
}

export async function creativeFactoryRoutes(server: FastifyInstance): Promise<void> {
  server.get("/workflow/definitions", async () => ({
    stages: workflowDefinitions(),
  }));

  server.get("/runs", async () => ({
    runs: listWorkflowRuns(),
    total: listWorkflowRuns().length,
  }));

  server.get<{ Params: { id: string } }>("/runs/:id", async (request, reply) => {
    const run = getWorkflowRun(request.params.id);
    if (!run) {
      return reply.status(404).send({
        error: "not_found",
        message: `Creative Factory workflow run ${request.params.id} not found`,
      });
    }
    return reply.send(run);
  });

  server.post<{ Body: unknown }>(
    "/runs",
    { preHandler: requireVideoWriteAuth },
    async (request, reply) => {
      const parsed = WorkflowRunBodySchema.safeParse(request.body);
      if (!parsed.success) return sendParseError(reply, parsed.error);
      const normalizedProfile = normalizeRuntimeProfileId(parsed.data.profile);
      const run = createWorkflowRun({
        mode: parsed.data.mode,
        profile: normalizedProfile === "auto" ? "constrained_cpu_8gb" : normalizedProfile,
        idempotencyKey: parsed.data.idempotencyKey,
        ...(parsed.data.capabilityRequirements !== undefined
          ? {
              capabilityRequirements: parsed.data.capabilityRequirements.map((requirement) => ({
                capability: requirement.capability,
                requiredFor: requirement.requiredFor,
                state: requirement.state,
                ...(requirement.reason !== undefined ? { reason: requirement.reason } : {}),
                ...(requirement.action !== undefined ? { action: requirement.action } : {}),
              })),
            }
          : {}),
      });
      return reply.status(201).send(run);
    },
  );

  server.post<{ Params: { id: string }; Body: unknown }>(
    "/runs/:id/checkpoints",
    { preHandler: requireVideoWriteAuth },
    async (request, reply) => {
      const parsed = WorkflowCheckpointBodySchema.safeParse(request.body);
      if (!parsed.success) return sendParseError(reply, parsed.error);
      const updated = checkpointWorkflowStage(request.params.id, {
        stage: parsed.data.stage as CreativeFactoryStage,
        status: parsed.data.status,
        revision: parsed.data.revision,
        ...(parsed.data.outputRef !== undefined ? { outputRef: parsed.data.outputRef } : {}),
        ...(parsed.data.errorCode !== undefined ? { errorCode: parsed.data.errorCode } : {}),
        ...(parsed.data.errorMessage !== undefined ? { errorMessage: parsed.data.errorMessage } : {}),
      });
      if (!updated) {
        return reply.status(404).send({
          error: "not_found",
          message: `Creative Factory workflow run ${request.params.id} not found`,
        });
      }
      return reply.send(updated);
    },
  );

  server.get("/capabilities", async () => ({
    capabilities: listPlatformCapabilities(),
  }));

  server.get("/brand-kits", async () => ({
    brandKits: listRegistryRecords<BrandKit>("brand-kits"),
  }));

  server.post<{ Body: unknown }>(
    "/brand-kits",
    { preHandler: requireVideoWriteAuth },
    async (request, reply) => {
      const parsed = BrandKitBodySchema.safeParse(request.body);
      if (!parsed.success) return sendParseError(reply, parsed.error);
      const record = upsertRegistryRecord<BrandKit>("brand-kits", {
        name: parsed.data.name,
        voicePrinciples: parsed.data.voicePrinciples,
        colorTokens: parsed.data.colorTokens,
        typographyTokens: parsed.data.typographyTokens,
        visualMotifs: parsed.data.visualMotifs,
        forbiddenClaims: parsed.data.forbiddenClaims,
        ...(parsed.data.id !== undefined ? { id: parsed.data.id } : {}),
        ...(parsed.data.revision !== undefined ? { revision: parsed.data.revision } : {}),
      });
      return reply.status(201).send(record);
    },
  );

  server.get<{ Params: { id: string } }>("/brand-kits/:id", async (request, reply) => {
    const record = getRegistryRecord<BrandKit>("brand-kits", request.params.id);
    if (!record) return reply.status(404).send({ error: "not_found", message: "BrandKit not found" });
    return reply.send(record);
  });

  server.get("/audiences", async () => ({
    audiences: listRegistryRecords<AudiencePersona>("audience-personas"),
  }));

  server.post<{ Body: unknown }>(
    "/audiences",
    { preHandler: requireVideoWriteAuth },
    async (request, reply) => {
      const parsed = AudienceBodySchema.safeParse(request.body);
      if (!parsed.success) return sendParseError(reply, parsed.error);
      const record = upsertRegistryRecord<AudiencePersona>("audience-personas", {
        label: parsed.data.label,
        description: parsed.data.description,
        pains: parsed.data.pains,
        desiredOutcomes: parsed.data.desiredOutcomes,
        platformHabits: parsed.data.platformHabits,
        languageLocale: parsed.data.languageLocale,
        ...(parsed.data.id !== undefined ? { id: parsed.data.id } : {}),
        ...(parsed.data.revision !== undefined ? { revision: parsed.data.revision } : {}),
      });
      return reply.status(201).send(record);
    },
  );

  server.get<{ Params: { id: string } }>("/audiences/:id", async (request, reply) => {
    const record = getRegistryRecord<AudiencePersona>("audience-personas", request.params.id);
    if (!record) return reply.status(404).send({ error: "not_found", message: "AudiencePersona not found" });
    return reply.send(record);
  });

  server.get("/blueprints", async () => ({
    blueprints: listRegistryRecords<VideoBlueprint>("video-blueprints"),
  }));

  server.get("/creative-dna", async () => ({
    records: listRegistryRecords<CreativeDNA>("creative-dna"),
  }));

  server.get("/concept-tournaments", async () => ({
    tournaments: listRegistryRecords<ConceptTournament>("concept-tournaments"),
  }));

  server.post<{ Body: unknown }>(
    "/concept-tournaments",
    { preHandler: requireVideoWriteAuth },
    async (request, reply) => {
      const parsed = ConceptTournamentBodySchema.safeParse(request.body);
      if (!parsed.success) return sendParseError(reply, parsed.error);
      let tournament: ConceptTournament;
      try {
        tournament = runConceptTournament(
          parsed.data.candidates as ConceptCandidate[],
          parsed.data.creativeDnaId,
        );
      } catch (err) {
        return reply.status(422).send({
          error: "tournament_failed",
          message: err instanceof Error ? err.message : "Tournament execution failed",
        });
      }
      upsertRegistryRecord<ConceptTournament>("concept-tournaments", tournament);
      if (parsed.data.runId) {
        checkpointWorkflowStage(parsed.data.runId, {
          stage: "CONCEPT_TOURNAMENT",
          status: "complete",
          revision: 1,
          outputRef: tournament.id,
        });
      }
      return reply.status(201).send(tournament);
    },
  );


  server.get("/visual/background-families", async () => ({
    families: backgroundFamilies(),
    principle: "Choose the cheapest renderer that satisfies the scene's visual requirement.",
  }));

  server.post<{ Body: unknown }>(
    "/visual/background-preview",
    { preHandler: requireVideoWriteAuth },
    async (request, reply) => {
      const parsed = BackgroundPreviewSchema.safeParse(request.body);
      if (!parsed.success) return sendParseError(reply, parsed.error);
      const family = parsed.data.family ?? selectBackgroundFamily({
        visualIntent: parsed.data.visualIntent ?? "cinematic",
        resourceClass: "cpu_light",
      });
      const budget = backgroundBudget({
        captionDensity: parsed.data.captionDensity,
        subjectSalience: parsed.data.subjectSalience,
        visualEventDensity: parsed.data.visualEventDensity,
      });
      return reply.send({
        recipe: createBackgroundRecipe({
          id: parsed.data.id,
          family,
          seed: parsed.data.seed,
          complexity: parsed.data.complexity ?? budget.complexity,
          motionEnergy: parsed.data.motionEnergy ?? budget.motionEnergy,
        }),
        budget,
      });
    },
  );

  server.post<{ Body: unknown }>(
    "/visual/compile",
    { preHandler: requireVideoWriteAuth },
    async (request, reply) => {
      const parsed = CreativeCompileSchema.safeParse(request.body);
      if (!parsed.success) return sendParseError(reply, parsed.error);
      try {
        const audioTiming = parsed.data.audioTiming
          ? deriveAudioTimingSpine(parsed.data.audioTiming)
          : undefined;
        const artifact = compileCreativeArtifact({
          id: parsed.data.id,
          creativeDnaId: parsed.data.creativeDnaId,
          scenes: parsed.data.scenes,
          backgroundRecipes: parsed.data.backgroundRecipes as BackgroundRecipe,
          ...(audioTiming ? { audioTiming } : {}),
          changed: parsed.data.changed,
          rendererVersion: parsed.data.rendererVersion,
        });
        return reply.send(artifact);
      } catch (error) {
        return reply.status(422).send({
          error: "creative_compile_failed",
          message: error instanceof Error ? error.message : "Creative compilation failed",
        });
      }
    },
  );

  server.get("/variants", async () => ({
    variants: listRegistryRecords<VariantRecord>("variant-records"),
  }));

  // Retention preview — pure function, no persistence. Lets creators feed a draft
  // script + duration and inspect the generated retention beat map before committing.
  const RetentionPreviewSchema = z.object({
    script: z.string().min(1).max(20_000),
    targetDurationSecs: z.number().int().min(5).max(600),
  });
  server.post<{ Body: unknown }>(
    "/retention-map/preview",
    async (request, reply) => {
      const parsed = RetentionPreviewSchema.safeParse(request.body);
      if (!parsed.success) return sendParseError(reply, parsed.error);
      const map = generateRetentionMap(parsed.data.script, parsed.data.targetDurationSecs);
      return reply.status(200).send(map);
    },
  );

  server.get("/agents", async () => ({
    agents: listRegistryRecords<CreativeAgentSpec>("creative-agent-specs"),
  }));

  server.get("/analytics/performance", async () => ({
    snapshots: listPerformanceSnapshots(),
  }));

  server.post<{ Body: unknown }>(
    "/analytics/performance",
    { preHandler: requireVideoWriteAuth },
    async (request, reply) => {
      const parsed = PerformanceSnapshotBodySchema.safeParse(request.body);
      if (!parsed.success) return sendParseError(reply, parsed.error);
      return reply.status(201).send(recordPerformanceSnapshot({
        packageId: parsed.data.packageId,
        platform: parsed.data.platform,
        ...(parsed.data.observedAt !== undefined ? { observedAt: parsed.data.observedAt } : {}),
        ...(parsed.data.views !== undefined ? { views: parsed.data.views } : {}),
        ...(parsed.data.likes !== undefined ? { likes: parsed.data.likes } : {}),
        ...(parsed.data.shares !== undefined ? { shares: parsed.data.shares } : {}),
        ...(parsed.data.comments !== undefined ? { comments: parsed.data.comments } : {}),
        ...(parsed.data.completionRate !== undefined ? { completionRate: parsed.data.completionRate } : {}),
        ...(parsed.data.averageWatchSeconds !== undefined ? { averageWatchSeconds: parsed.data.averageWatchSeconds } : {}),
      }));
    },
  );

  server.get("/learning", async () => ({
    records: listLearningRecords(),
  }));

  server.post<{ Body: unknown }>(
    "/learning",
    { preHandler: requireVideoWriteAuth },
    async (request, reply) => {
      const parsed = LearningRecordBodySchema.safeParse(request.body);
      if (!parsed.success) return sendParseError(reply, parsed.error);
      return reply.status(201).send(createLearningRecord({
        recommendation: parsed.data.recommendation,
        evidence: parsed.data.evidence,
        ...(parsed.data.sourceExperimentId !== undefined ? { sourceExperimentId: parsed.data.sourceExperimentId } : {}),
        ...(parsed.data.sourcePackageId !== undefined ? { sourcePackageId: parsed.data.sourcePackageId } : {}),
        ...(parsed.data.approvalState !== undefined ? { approvalState: parsed.data.approvalState } : {}),
      }));
    },
  );
}
