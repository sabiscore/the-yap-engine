/**
 * SwarmX server entrypoint.
 *
 * Vercel zero-config Fastify discovers this file directly. The serverless
 * branch is intentionally a thin HTTP gateway: it never imports the worker,
 * BullMQ, Ollama, FFmpeg, PTY, filesystem state, or video orchestration graph.
 * The full runtime lives in server-runtime.ts and is loaded only off Vercel.
 */
import Fastify, { type FastifyRequest } from "fastify";

const IS_VERCEL = Boolean(process.env["VERCEL"]);
const DEFAULT_VERSION = "2026.6.0";

function targetBaseUrl(): string | null {
  const raw = process.env["SWARMX_API_URL"]?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (process.env["NODE_ENV"] === "production" &&
        ["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      return null;
    }
    return url.toString().replace(/\\/$/, "");
  } catch {
    return null;
  }
}

async function createServerlessGateway() {
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
      if (["host", "connection", "content-length"].includes(name)) continue;
      if (Array.isArray(value)) headers.set(name, value.join(", "));
      else if (value !== undefined) headers.set(name, value);
    }
    headers.set("x-request-id", request.id);

    const method = request.method.toUpperCase();
    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD") {
      if (typeof request.body === "string") body = request.body;
      else if (request.body !== undefined) body = JSON.stringify(request.body);
    }

    try {
      const upstream = await fetch(target, {
        method,
        headers,
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });

      reply.code(upstream.status);
      const contentType = upstream.headers.get("content-type");
      if (contentType) reply.header("content-type", contentType);
      reply.header("cache-control", "no-store");
      reply.header("x-request-id", request.id);

      const payload = await upstream.text();
      return reply.send(payload);
    } catch (error) {
      request.log.error({ err: error, target: target.toString() }, "gateway upstream failure");
      return reply.code(504).header("cache-control", "no-store").send({
        error: "upstream_unavailable",
        message: "The Render-hosted API could not be reached within 8 seconds.",
        requestId: request.id,
      });
    }
  });

  return server;
}

let server: Awaited<ReturnType<typeof createServerlessGateway>>;

if (IS_VERCEL) {
  server = await createServerlessGateway();
} else {
  const runtime = await import("./server-runtime.js");
  server = runtime.default;
}

export default server;
