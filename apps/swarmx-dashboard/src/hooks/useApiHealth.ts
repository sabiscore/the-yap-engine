"use client";

import { useQuery } from "@tanstack/react-query";
import { resolveClientApiBaseUrl } from "@/lib/api-config";

export interface WarmupSnapshot {
  done: boolean;
  coldStartEtaSecs: number | null;
  source: "file" | "default";
}

export interface ApiModelReadiness {
  role?: string;
  tag?: string;
  status: string;
  error?: string;
}

export interface ApiRuntimeProfileSnapshot {
  id?: string;
  label?: string;
  availableRamMb?: number;
  blockers: string[];
  warnings: string[];
}

export interface ApiHealthState {
  apiOnline: boolean | null;
  ollamaOnline: boolean | null;
  apiStatus: string | null;
  latencyMs: number | null;
  lastChecked: number | null;
  warmup: WarmupSnapshot | null;
  models: ApiModelReadiness[] | null;
  runtimeProfile: ApiRuntimeProfileSnapshot | null;
  warnings: string[];
  voiceBenchmarkRecommendedProviderId: string | null;
  voiceFallbackWarning: string | null;
}

function resolveDirectApiBaseUrl(): string {
  return resolveClientApiBaseUrl();
}

const API_HEALTH_QUERY_KEY = ["swarmx", "api-health"] as const;
const API_HEALTH_POLL_INTERVAL_MS = 12_000;
const API_HEALTH_REQUEST_TIMEOUT_MS = 3_000;

const INITIAL_HEALTH: ApiHealthState = {
  apiOnline: null,
  ollamaOnline: null,
  apiStatus: null,
  latencyMs: null,
  lastChecked: null,
  warmup: null,
  models: null,
  runtimeProfile: null,
  warnings: [],
  voiceBenchmarkRecommendedProviderId: null,
  voiceFallbackWarning: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseWarmup(value: unknown): WarmupSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const coldStartEtaSecs = finiteNumber(value["coldStartEtaSecs"]) ?? null;
  return {
    done: value["done"] === true,
    coldStartEtaSecs,
    source: value["source"] === "file" ? "file" : "default",
  };
}

function parseModels(value: unknown): ApiModelReadiness[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter(isRecord).map((model) => {
    const role = optionalString(model["role"]);
    const tag = optionalString(model["tag"]);
    const error = optionalString(model["error"]);
    return {
      ...(role ? { role } : {}),
      ...(tag ? { tag } : {}),
      status: optionalString(model["status"]) ?? "unknown",
      ...(error ? { error } : {}),
    };
  });
}

function parseRuntimeProfile(value: unknown): ApiRuntimeProfileSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = optionalString(value["id"]);
  const label = optionalString(value["label"]);
  const availableRamMb = finiteNumber(value["availableRamMb"]);
  return {
    ...(id ? { id } : {}),
    ...(label ? { label } : {}),
    ...(availableRamMb !== undefined ? { availableRamMb } : {}),
    blockers: stringArray(value["blockers"]),
    warnings: stringArray(value["warnings"]),
  };
}

async function fetchApiHealth(): Promise<ApiHealthState> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    API_HEALTH_REQUEST_TIMEOUT_MS,
  );
  const startedAt = Date.now();

  try {
    const response = await fetch(`${resolveDirectApiBaseUrl()}/api/system/health`, {
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        apiOnline: false,
        ollamaOnline: null,
        apiStatus: null,
        latencyMs,
        lastChecked: Date.now(),
        warmup: null,
        models: null,
        runtimeProfile: null,
        warnings: [],
        voiceBenchmarkRecommendedProviderId: null,
        voiceFallbackWarning: null,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const ollama = isRecord(data["ollama"]) ? data["ollama"] : null;
    const voice = isRecord(data["voice"]) ? data["voice"] : null;
    const voiceBenchmark = voice && isRecord(voice["benchmark"]) ? voice["benchmark"] : null;
    const isExplicitlyOffline = data["status"] === "offline" || data["apiOnline"] === false;
    return {
      apiOnline: isExplicitlyOffline ? false : true,
      ollamaOnline: isExplicitlyOffline
        ? false
        : typeof ollama?.["reachable"] === "boolean"
          ? ollama["reachable"]
          : null,
      apiStatus: optionalString(data["status"]) ?? (isExplicitlyOffline ? "offline" : null),
      latencyMs,
      lastChecked: Date.now(),
      warmup: parseWarmup(data["warmup"]),
      models: parseModels(data["models"]),
      runtimeProfile: parseRuntimeProfile(data["runtimeProfile"]),
      warnings: stringArray(data["warnings"]),
      voiceBenchmarkRecommendedProviderId: optionalString(voiceBenchmark?.["recommendedProviderId"]) ?? null,
      voiceFallbackWarning: optionalString(voice?.["fallbackWarning"]) ?? null,
    };
  } catch {
    return {
      apiOnline: false,
      ollamaOnline: null,
      apiStatus: null,
      latencyMs: null,
      lastChecked: Date.now(),
      warmup: null,
      models: null,
      runtimeProfile: null,
      warnings: [],
      voiceBenchmarkRecommendedProviderId: null,
      voiceFallbackWarning: null,
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/**
 * Polls `/api/system/health` through a single React Query cache entry. All
 * mounted consumers share both the in-flight request and the twelve-second
 * cache cadence, preventing each dashboard surface from multiplying probes.
 */
export function useApiHealth(): ApiHealthState {
  const { data } = useQuery({
    queryKey: API_HEALTH_QUERY_KEY,
    queryFn: fetchApiHealth,
    refetchInterval: API_HEALTH_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: API_HEALTH_POLL_INTERVAL_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return data ?? INITIAL_HEALTH;
}
