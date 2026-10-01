/**
 * SwarmX Vercel gateway / serverless entrypoint.
 *
 * Vercel detects src/server.ts as the Fastify application entrypoint. Keep
 * this file deliberately dependency-light: no BullMQ, Redis, Ollama, FFmpeg,
 * node-pty, database clients, worker orchestration, or filesystem state.
 *
 * The full Render runtime is isolated in server-runtime.ts and is launched by
 * the container/package start command, never imported by this gateway.
 */
import Fastify, { type FastifyRequest } from "fastify";

const DEFAULT_VERSION = "2026.6.0";

function targetBaseUrl(): URL | null {
  const raw = process.env["SWARMX_API_URL"]?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      process.env["NODE_ENV"] === "production" &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function isWriteMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

const server = Fastify({
  logger: { level: process.env["LOG_LEVEL"] ?? "info" },
  requestTimeout: 30_000,
  bodyLimit: 1_048_576,
});

const health = async () => ({
  status: "ok",
  service: "swarmx-api-gateway",
  version: process.env["npm_package_version"] ?? DEFAULT_VERSION,
  execution: "vercel-gateway",
  ts: Date.now(),
});

server.get("/", { logLevel: "silent" }, health);
server.get("/health", { logLevel: "silent" }, health);
server.get("/api/health", { logLevel: "silent" }, health);

server.all("/*", async (request: FastifyRequest, reply) => {
  const base = targetBaseUrl();
  if (!base) {
    return reply.code(503).header("cache-control", "no-store").send({
      error: "api_not_configured",
      message: "SWARMX_API_URL must point to the Render-hosted Fastify API.",
      requestId: request.id,
    });
  }

  const target = new URL(request.raw.url ?? "/", base);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (["host", "connection", "content-length"].includes(name.toLowerCase())) continue;
    if (Array.isArray(value)) headers.set(name, value.join(", "));
    else if (value !== undefined) headers.set(name, value);
  }
  headers.set("x-request-id", request.id);

  if (isWriteMethod(request.method.toUpperCase())) {
    const token = process.env["SWARMX_VIDEO_API_TOKEN"]?.trim();
    if (token) {
      headers.set("authorization", "Bearer " + token);
      headers.set("x-video-api-key", token);
    }
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  };

  // Vercel gateway rejects payloads above 1 MiB and forwards request bodies
  // only after Fastify's bounded parser has accepted them. Video binaries must
  // never traverse this process; Render owns the media pipeline.
  if (!["GET", "HEAD"].includes(request.method.toUpperCase())) {
    if (typeof request.body === "string") init.body = request.body;
    else if (request.body !== undefined) init.body = JSON.stringify(request.body);
    init.duplex = "half";
  }

  try {
    const upstream = await fetch(target, init);
    reply.code(upstream.status);
    const contentType = upstream.headers.get("content-type");
    if (contentType) reply.header("content-type", contentType);
    reply.header("cache-control", "no-store");
    reply.header("x-request-id", request.id);

    if (!upstream.body) return reply.send();

    return reply.send(upstream.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    request.log.error(
      { err: error, target: target.toString() },
      "gateway upstream invocation failed",
    );
    return reply.code(timedOut ? 504 : 502).header("cache-control", "no-store").send({
      error: timedOut ? "upstream_timeout" : "upstream_unreachable",
      message: timedOut
        ? "The Render-hosted API did not respond within 8 seconds."
        : "The Render-hosted API could not be reached.",
      requestId: request.id,
    });
  }
});

export default server;
