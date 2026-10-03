/**
 * WebSocket plugin — `/ws/terminal/:sessionId`
 *
 * Spawns a node-pty PTY per session and bidirectionally pipes data
 * between the WebSocket and the PTY. Enforces a max-sessions cap.
 */
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type { IPty } from "node-pty";
import { z } from "zod";

// Lazy-import node-pty so the server boots on non-Linux hosts for testing
let ptyModule: typeof import("node-pty") | null = null;
async function getPty() {
  if (!ptyModule) {
    try {
      ptyModule = await import("node-pty");
    } catch {
      return null;
    }
  }
  return ptyModule;
}

// ── Session registry ──────────────────────────────────────────────────────────

const MAX_SESSIONS = Number.parseInt(process.env["SWARMX_MAX_PTY_SESSIONS"] ?? "8", 10);
const sessions = new Map<string, IPty>();

const sessionIdSchema = z
  .string()
  .min(4)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid session ID format");

import { loadEnv } from "../lib/env.js";

export function isTerminalPtyAllowed(): boolean {
  try {
    const env = loadEnv();
    const isLoopback =
      env.SWARMX_API_HOST === "127.0.0.1" ||
      env.SWARMX_API_HOST === "localhost" ||
      env.SWARMX_API_HOST === "::1";
    if (env.NODE_ENV === "production" || !isLoopback || Boolean(process.env["VERCEL"])) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export async function websocketPlugin(server: FastifyInstance): Promise<void> {
  if (!isTerminalPtyAllowed()) {
    server.log.info("PTY terminal websocket endpoint is disabled in production or on non-loopback bind");
    return;
  }

  server.get(
    "/ws/terminal/:sessionId",
    { websocket: true },
    async (socket: WebSocket, req) => {
      const { sessionId } = req.params as { sessionId: string };

      // Validate session ID to prevent path injection
      const parsed = sessionIdSchema.safeParse(sessionId);
      if (!parsed.success) {
        socket.close(1008, "Invalid session ID");
        return;
      }

      if (sessions.size >= MAX_SESSIONS) {
        socket.close(1013, `Session limit reached (max ${MAX_SESSIONS})`);
        return;
      }

      const pty = await getPty();
      if (!pty) {
        socket.close(1011, "node-pty not available on this platform");
        return;
      }

      // Spawn a bash shell for the session
      const proc = pty.spawn(
        process.env["SWARMX_PTY_SHELL"] ?? "/bin/bash",
        [],
        {
          name: "xterm-256color",
          cols: 200,
          rows: 50,
          cwd: process.env["SWARMX_WORKSPACE"] ?? process.cwd(),
          env: {
            ...process.env,
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
          },
        }
      );

      sessions.set(sessionId, proc);
      server.log.info({ sessionId, pid: proc.pid }, "PTY session started");

      // PTY → WebSocket
      proc.onData((data) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(data);
        }
      });

      proc.onExit(({ exitCode }) => {
        server.log.info({ sessionId, exitCode }, "PTY session exited");
        sessions.delete(sessionId);
        if (socket.readyState === socket.OPEN) {
          // Send ESC sequence to signal exit, then close
          socket.send(`\r\n[Process exited with code ${exitCode}]\r\n`);
          socket.close(1000, "Process exited");
        }
      });

      // WebSocket → PTY
      socket.on("message", (raw: Buffer | string) => {
        try {
          const msg = typeof raw === "string" ? raw : raw.toString("utf8");
          // Check for resize control message: \x01{"cols":N,"rows":N}
          if (msg.startsWith("\x01")) {
            const dims = JSON.parse(msg.slice(1)) as { cols?: number; rows?: number };
            if (dims.cols != null && dims.rows != null) {
              proc.resize(
                Math.max(1, Math.min(500, dims.cols)),
                Math.max(1, Math.min(500, dims.rows))
              );
            }
            return;
          }
          proc.write(msg);
        } catch {
          // Malformed message — ignore
        }
      });

      socket.on("close", () => {
        server.log.info({ sessionId }, "WebSocket closed, killing PTY");
        try { proc.kill(); } catch { /* already dead */ }
        sessions.delete(sessionId);
      });

      socket.on("error", (err: Error) => {
        server.log.warn({ sessionId, err }, "WebSocket error");
        try { proc.kill(); } catch { /* already dead */ }
        sessions.delete(sessionId);
      });
    }
  );

  // Expose session count for health endpoint
  server.get("/api/terminal/sessions", async () => ({
    active: sessions.size,
    max: MAX_SESSIONS,
    sessionIds: [...sessions.keys()],
  }));
}
