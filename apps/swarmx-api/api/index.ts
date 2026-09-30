import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";

type ServerModule = typeof import("../src/server.js");

let serverModulePromise: Promise<ServerModule> | undefined;

async function getServer(): Promise<FastifyInstance> {
  const module = await (serverModulePromise ??= import("../src/server.js"));
  const instance: FastifyInstance = module.default;
  return instance;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
      sendJson(res, 503, { status: "unavailable", service: "swarmx-api" });
    }
  }
}
