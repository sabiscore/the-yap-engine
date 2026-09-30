import type { IncomingMessage, ServerResponse } from "node:http";

type FastifyServer = typeof import("../apps/swarmx-api/src/server.js").default;

let serverPromise: Promise<FastifyServer> | undefined;

function getServer(): Promise<FastifyServer> {
  serverPromise ??= import("../apps/swarmx-api/src/server.js").then((module) => module.default);
  return serverPromise;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(payload);
}

/**
 * Vercel adapter for the Fastify application.
 *
 * Keep health/root responses independent of the full backend module graph.
 * The API imports a substantial worker/model graph, and eagerly importing it
 * before serving "/" can turn an otherwise healthy deployment into an
 * invocation failure during a cold start. Non-health routes still use the
 * canonical Fastify application.
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const pathname = new URL(req.url ?? "/", "http://vercel.local").pathname;

  if (req.method === "GET" && (pathname === "/" || pathname === "/health" || pathname === "/api/health")) {
    sendJson(res, 200, {
      status: "ok",
      service: "swarmx-api",
      version: process.env["npm_package_version"] ?? "2026.6.0",
      ts: Date.now(),
    });
    return;
  }

  try {
    const server = await getServer();
    await server.ready();
    server.server.emit("request", req, res);
  } catch (error) {
    console.error("[vercel-adapter] Fastify invocation failed", error);
    if (!res.headersSent) {
      sendJson(res, 503, {
        status: "unavailable",
        service: "swarmx-api",
      });
    }
  }
}
