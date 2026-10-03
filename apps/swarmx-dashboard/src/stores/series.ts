/**
 * apps/swarmx-dashboard/src/stores/series.ts
 * SwarmXQ Series Engine — Zustand Store
 *
 * Single source of truth for series plans. Mirrors the video store pattern:
 * Map<id, SeriesJob>, actions for CRUD + episode production, shared apiFetch.
 */

"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  SeriesBrief,
  SeriesJob,
  SeriesCreateResponse,
  SeriesListResponse,
  SeriesProduceEpisodeResponse,
  SeriesPreProductionResponse,
} from "@swarmx/types/series-types";

// ─── API base ─────────────────────────────────────────────────────────────────
// Use relative paths so all requests route through the Next.js server.
// The Next.js /api/* route proxy injects SWARMX_VIDEO_API_TOKEN server-side;
// the token never reaches the browser bundle.
const API_BASE = "";

class SeriesApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null) {
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
    } catch { /* non-JSON body */ }
    throw new SeriesApiError(res.status, message, code);
  }
  return res.json() as Promise<T>;
}

// ─── State shape ──────────────────────────────────────────────────────────────

export interface SeriesState {
  series: Map<string, SeriesJob>;
  isLoading: boolean;
  isCreating: boolean;
  listError: string | null;
  createError: string | null;
}

export interface SeriesActions {
  fetchSeries: () => Promise<void>;
  fetchSeriesDetail: (id: string) => Promise<void>;
  createSeries: (brief: SeriesBrief) => Promise<string | null>;
  produceEpisode: (seriesId: string, episodeNumber: number) => Promise<SeriesProduceEpisodeResponse | null>;
  // V2.0 — episode pre-production
  prepareEpisode: (seriesId: string, episodeNumber: number) => Promise<SeriesPreProductionResponse | null>;
  // V2.1 — modular pass re-runs
  rerunSeriesPass: (seriesId: string, pass: "1" | "2" | "3" | "4") => Promise<void>;
  rerunEpisodePass: (seriesId: string, episodeNumber: number, pass: "a" | "b" | "c" | "d") => Promise<void>;
  deleteSeries: (id: string) => Promise<void>;
  pollSeriesStatus: (id: string) => Promise<void>;
  clearErrors: () => void;
  getSeries: (id: string) => SeriesJob | undefined;
  listSeries: () => SeriesJob[];
}

type SeriesStore = SeriesState & SeriesActions;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSeriesStore = create<SeriesStore>()(
  devtools(
    (set, get) => ({
      series: new Map(),
      isLoading: false,
      isCreating: false,
      listError: null,
      createError: null,

      fetchSeries: async () => {
        set({ isLoading: true, listError: null });
        try {
          const data = await apiFetch<SeriesListResponse>("/api/video/series");
          const map = new Map<string, SeriesJob>();
          for (const s of data.series) {
            map.set(s.id, s);
          }
          set({ series: map, isLoading: false });
        } catch (err) {
          const message =
            err instanceof SeriesApiError && (err.status === 502 || err.code === "upstream_unreachable")
              ? "Yap Engine API is currently unreachable. Confirm the service is running on port 3001."
              : err instanceof Error
                ? err.message
                : "Failed to load series.";
          set({ isLoading: false, listError: message });
        }
      },

      fetchSeriesDetail: async (id: string) => {
        try {
          const data = await apiFetch<SeriesJob>(`/api/video/series/${id}`);
          set((state) => {
            const next = new Map(state.series);
            next.set(data.id, data);
            return { series: next };
          });
        } catch {
          // non-fatal — series may have been evicted
        }
      },

      createSeries: async (brief: SeriesBrief) => {
        set({ isCreating: true, createError: null });
        try {
          const data = await apiFetch<SeriesCreateResponse>("/api/video/series", {
            method: "POST",
            body: JSON.stringify(brief),
          });
          // Optimistically add to map with planning status
          const optimistic: SeriesJob = {
            id: data.seriesId,
            status: "planning",
            brief,
            videoJobIds: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          set((state) => {
            const next = new Map(state.series);
            next.set(data.seriesId, optimistic);
            return { series: next, isCreating: false };
          });
          return data.seriesId;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to create series.";
          set({ isCreating: false, createError: msg });
          return null;
        }
      },

      produceEpisode: async (seriesId: string, episodeNumber: number) => {
        try {
          const data = await apiFetch<SeriesProduceEpisodeResponse>(
            `/api/video/series/${seriesId}/episodes/${episodeNumber}/produce`,
            { method: "POST", body: "{}" },
          );
          // Refresh series detail to get updated videoJobIds
          await get().fetchSeriesDetail(seriesId);
          return data;
        } catch (err) {
          set({ createError: err instanceof Error ? err.message : "Failed to produce episode." });
          return null;
        }
      },

      prepareEpisode: async (seriesId: string, episodeNumber: number) => {
        try {
          const data = await apiFetch<SeriesPreProductionResponse>(
            `/api/video/series/${seriesId}/episodes/${episodeNumber}/preproduction`,
            { method: "POST", body: "{}" },
          );
          // Refresh series detail so preProduction field is updated in state
          await get().fetchSeriesDetail(seriesId);
          return data;
        } catch (err) {
          set({ createError: err instanceof Error ? err.message : "Failed to start pre-production." });
          return null;
        }
      },

      rerunSeriesPass: async (seriesId: string, pass: "1" | "2" | "3" | "4") => {
        await apiFetch<unknown>(
          `/api/video/series/${seriesId}/rerun-pass/${pass}`,
          { method: "POST", body: "{}" },
        );
      },

      rerunEpisodePass: async (seriesId: string, episodeNumber: number, pass: "a" | "b" | "c" | "d") => {
        await apiFetch<unknown>(
          `/api/video/series/${seriesId}/episodes/${episodeNumber}/rerun-pass/${pass}`,
          { method: "POST", body: "{}" },
        );
      },

      deleteSeries: async (id: string) => {
        try {
          await apiFetch<void>(`/api/video/series/${id}`, { method: "DELETE" });
          set((state) => {
            const next = new Map(state.series);
            next.delete(id);
            return { series: next };
          });
        } catch { /* already gone */ }
      },

      pollSeriesStatus: async (id: string) => {
        await get().fetchSeriesDetail(id);
      },

      clearErrors: () => set({ listError: null, createError: null }),

      getSeries: (id: string) => get().series.get(id),

      listSeries: () =>
        Array.from(get().series.values()).sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        ),
    }),
    { name: "series-store" },
  ),
);
