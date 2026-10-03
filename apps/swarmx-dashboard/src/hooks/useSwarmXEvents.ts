"use client";

import { useEffect, useRef } from "react";
import type { SwarmXEvent } from "@swarmx/types";
import { useEventsStore } from "@/stores/events";

const SSE_URL = "/api/events";
const HISTORY_URL = "/api/logs/events?limit=120";
// [V5.9-ENH-07] Exponential backoff: 1s → 2s → 4s → 8s → 16s (capped at 30s)
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const STALE_CHECK_INTERVAL_MS = 2_000;

interface HistoricalEventsResponse {
  events: SwarmXEvent[];
  count: number;
}

/**
 * Establishes an SSE connection to /api/events and dispatches all events
 * into the Zustand events store. Handles reconnection automatically.
 * Stale data indicator: if silent > 5s, marks store as stale.
 *
 * Mount once at the root dashboard layout. The underlying EventSource
 * auto-reconnects on network drop — this hook adds exponential back-pressure
 * via a manual reconnect gate when the server sends close/error.
 */
export function useSwarmXEvents(): void {
  const handleEvent = useEventsStore((s) => s.handleEvent);
  const setConnectionStatus = useEventsStore((s) => s.setConnectionStatus);
  const setReconnectTelemetry = useEventsStore((s) => s.setReconnectTelemetry);
  const checkStale = useEventsStore((s) => s.checkStale);

  const esRef = useRef<EventSource | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // [V5.9-ENH-07] Exponential backoff attempt counter
  const reconnectAttemptRef = useRef<number>(0);
  const historyLoadedRef = useRef<boolean>(false);

  useEffect(() => {
    let destroyed = false;

    async function bootstrapHistory() {
      try {
        const response = await fetch(HISTORY_URL, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as HistoricalEventsResponse & { offline?: boolean };
        if (payload.offline) return;
        historyLoadedRef.current = true;
        for (const event of payload.events) {
          if (destroyed) return;
          handleEvent(event);
        }
      } catch {
        // Historical bootstrap is best-effort only
      }
    }

    function connect() {
      if (destroyed) return;

      setConnectionStatus("connecting");
      const es = new EventSource(SSE_URL);
      esRef.current = es;

      es.onopen = () => {
        if (!destroyed) {
          setConnectionStatus("connected");
          setReconnectTelemetry(0, null);
          // [V5.9-ENH-07] Reset backoff on successful connection
          reconnectAttemptRef.current = 0;
          if (!historyLoadedRef.current) {
            void bootstrapHistory();
          }
        }
      };

      es.onmessage = (e: MessageEvent<string>) => {
        if (destroyed) return;
        try {
          const event = JSON.parse(e.data) as SwarmXEvent;
          handleEvent(event);
        } catch {
          // Malformed SSE payload — skip silently
        }
      };

      es.onerror = () => {
        if (destroyed) return;
        setConnectionStatus("disconnected");
        es.close();
        esRef.current = null;
        // [V5.9-ENH-07] Exponential backoff with jitter: base * 2^attempt, capped at 30s
        const attempt = reconnectAttemptRef.current;
        const backoff = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS);
        // Add ±20% jitter to avoid thundering herd
        const jitter = backoff * 0.2 * (Math.random() * 2 - 1);
        const delay = Math.round(backoff + jitter);
        reconnectAttemptRef.current = attempt + 1;
        setReconnectTelemetry(attempt + 1, delay);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    }

    connect();
    void bootstrapHistory();

    // Stale data watchdog
    staleTimerRef.current = setInterval(() => {
      if (!destroyed) checkStale();
    }, STALE_CHECK_INTERVAL_MS);

    return () => {
      destroyed = true;
      esRef.current?.close();
      esRef.current = null;
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [handleEvent, setConnectionStatus, setReconnectTelemetry, checkStale]);
}
