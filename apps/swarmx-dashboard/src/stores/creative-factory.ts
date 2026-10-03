"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";
export interface TikTokPublishingReadiness {
  apiApproved: boolean;
  publicPostsEnabled: boolean;
  accountCount: number;
  controlledVerifiedCount: number;
  state: "blocked" | "controlled_verified" | "ready_for_operator_review";
  reason: string;
}

import type {
  AudiencePersona,
  BrandKit,
  CreativeFactoryWorkflowRun,
  MonetizationSummary,
  PlatformCapability,
  VideoBlueprint,
  WorkflowStageDefinition,
} from "@swarmx/types/video-types";

const API_BASE = "";

export class CreativeFactoryApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    let code: string | null = null;
    let message = res.statusText;
    try {
      const body = await res.json() as { error?: string; message?: string };
      code = typeof body?.error === "string" ? body.error : null;
      message = typeof body?.message === "string" ? body.message : message;
    } catch {
      // keep statusText
    }
    throw new CreativeFactoryApiError(res.status, message, code);
  }
  return res.json() as Promise<T>;
}

export interface CreativeFactoryState {
  stages: WorkflowStageDefinition[];
  runs: CreativeFactoryWorkflowRun[];
  capabilities: PlatformCapability[];
  brandKits: BrandKit[];
  audiences: AudiencePersona[];
  blueprints: VideoBlueprint[];
  monetizationSummary: MonetizationSummary | null;
  tiktokReadiness: TikTokPublishingReadiness | null;
  selectedRunId: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface CreativeFactoryActions {
  fetchFactory: () => Promise<void>;
  createRun: (input: Pick<CreativeFactoryWorkflowRun, "mode" | "profile" | "idempotencyKey">) => Promise<string | null>;
  upsertBrandKit: (input: { name: string; voicePrinciples: string[] }) => Promise<BrandKit | null>;
  upsertAudience: (input: { label: string; description: string; pains: string[] }) => Promise<AudiencePersona | null>;
  fetchRunDetail: (id: string) => Promise<void>;
  selectRun: (id: string | null) => void;
}

type CreativeFactoryStore = CreativeFactoryState & CreativeFactoryActions;

export const useCreativeFactoryStore = create<CreativeFactoryStore>()(
  devtools((set, get) => ({
    stages: [],
    runs: [],
    capabilities: [],
    brandKits: [],
    audiences: [],
    blueprints: [],
    monetizationSummary: null,
    tiktokReadiness: null,
    selectedRunId: null,
    isLoading: false,
    error: null,

    fetchFactory: async () => {
      set({ isLoading: true, error: null }, false, "factory/fetch/start");
      try {
        const [definitions, runs, capabilities, brandKits, audiences, blueprints, monetization, tiktokReadiness] = await Promise.all([
          apiFetch<{ stages: WorkflowStageDefinition[] }>("/api/video/factory/workflow/definitions"),
          apiFetch<{ runs: CreativeFactoryWorkflowRun[] }>("/api/video/factory/runs"),
          apiFetch<{ capabilities: PlatformCapability[] }>("/api/video/factory/capabilities"),
          apiFetch<{ brandKits: BrandKit[] }>("/api/video/factory/brand-kits"),
          apiFetch<{ audiences: AudiencePersona[] }>("/api/video/factory/audiences"),
          apiFetch<{ blueprints: VideoBlueprint[] }>("/api/video/factory/blueprints"),
          apiFetch<{ summary: MonetizationSummary }>("/api/video/factory/analytics/monetization"),
          apiFetch<{ readiness: TikTokPublishingReadiness }>("/api/video/factory/publishing/tiktok/readiness"),
        ]);
        set({
          stages: definitions.stages,
          runs: runs.runs,
          capabilities: capabilities.capabilities,
          brandKits: brandKits.brandKits,
          audiences: audiences.audiences,
          blueprints: blueprints.blueprints,
          monetizationSummary: monetization.summary,
          tiktokReadiness: tiktokReadiness.readiness,
          isLoading: false,
        }, false, "factory/fetch/done");
      } catch (err) {
        const message =
          err instanceof CreativeFactoryApiError && (err.status === 502 || err.code === "upstream_unreachable")
            ? "Yap Engine API is currently unreachable. Confirm the service is running on port 3001."
            : err instanceof Error
              ? err.message
              : "Failed to load Creative Factory state.";
        set({
          isLoading: false,
          error: message,
        }, false, "factory/fetch/error");
      }
    },

    createRun: async (input) => {
      try {
        const run = await apiFetch<CreativeFactoryWorkflowRun>("/api/video/factory/runs", {
          method: "POST",
          body: JSON.stringify(input),
        });
        set({ runs: [run, ...get().runs.filter((existing) => existing.id !== run.id)] }, false, "factory/createRun");
        return run.id;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : "Failed to create workflow run." });
        return null;
      }
    },

    upsertBrandKit: async (input) => {
      try {
        const kit = await apiFetch<BrandKit>("/api/video/factory/brand-kits", {
          method: "POST",
          body: JSON.stringify({
            name: input.name,
            voicePrinciples: input.voicePrinciples,
            colorTokens: {},
            typographyTokens: {},
            visualMotifs: [],
            forbiddenClaims: [],
          }),
        });
        set({
          brandKits: [kit, ...get().brandKits.filter((b) => b.id !== kit.id)],
        }, false, "factory/upsertBrandKit");
        return kit;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : "Failed to save brand kit." });
        return null;
      }
    },

    upsertAudience: async (input) => {
      try {
        const persona = await apiFetch<AudiencePersona>("/api/video/factory/audiences", {
          method: "POST",
          body: JSON.stringify({
            label: input.label,
            description: input.description,
            pains: input.pains,
            desiredOutcomes: [],
            platformHabits: {},
            languageLocale: "en-US",
          }),
        });
        set({
          audiences: [persona, ...get().audiences.filter((a) => a.id !== persona.id)],
        }, false, "factory/upsertAudience");
        return persona;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : "Failed to save audience." });
        return null;
      }
    },

    fetchRunDetail: async (id) => {
      try {
        const run = await apiFetch<CreativeFactoryWorkflowRun>(`/api/video/factory/runs/${id}`);
        const existing = get().runs;
        const updated = existing.some((r) => r.id === id)
          ? existing.map((r) => (r.id === id ? run : r))
          : [run, ...existing];
        set({ runs: updated, selectedRunId: id }, false, "factory/fetchRunDetail");
      } catch (err) {
        set({ error: err instanceof Error ? err.message : "Failed to fetch run detail." });
      }
    },

    selectRun: (id) => set({ selectedRunId: id }, false, "factory/selectRun"),
  }), { name: "creative-factory-store" }),
);
