import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";

type ServerModule = typeof import("../src/server.js");

let serverModulePromise: Promise<ServerModule> | undefined;

async function getServer(): Promise<FastifyInstance> {
  try {
    const module = await (serverModulePromise ??= import("../src/server.js"));
    return module.default;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[vercel-adapter] Fastify initialization failed", { message, stack });
    throw error;
  }
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  if (res.headersSent) return;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function isWriteMethod(method: string | undefined): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes((method ?? "").toUpperCase());
}

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

function copyResponseHeaders(upstream: Response, res: ServerResponse): void {
  upstream.headers.forEach((value, name) => {
    if (["connection", "transfer-encoding", "content-length"].includes(name.toLowerCase())) return;
    res.setHeader(name, value);
  });
  res.setHeader("Cache-Control", "no-store");
}

async function proxyToRender(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const base = targetBaseUrl();
  if (!base) {
    sendJson(res, 503, {
      status: "unavailable",
      service: "swarmx-api-gateway",
      error: "api_not_configured",
      message: "SWARMX_API_URL must point to the Render-hosted Fastify API.",
    });
    return;
  }

  const target = new URL(req.url ?? "/", base);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (["host", "connection", "content-length"].includes(name.toLowerCase())) continue;
    if (Array.isArray(value)) headers.set(name, value.join(", "));
    else if (value !== undefined) headers.set(name, value);
  }

  const requestId = req.headers["x-request-id"]?.toString().trim() || crypto.randomUUID();
  headers.set("x-request-id", requestId);

  if (isWriteMethod(req.method)) {
    const token = process.env["SWARMX_VIDEO_API_TOKEN"]?.trim();
    if (token) {
      headers.set("authorization", "Bearer " + token);
      headers.set("x-video-api-key", token);
    }
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method ?? "GET",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  };

  if (!["GET", "HEAD"].includes((req.method ?? "GET").toUpperCase())) {
    init.body = req as unknown as BodyInit;
    init.duplex = "half";
  }

  try {
    const upstream = await fetch(target, init);
    res.statusCode = upstream.status;
    copyResponseHeaders(upstream, res);
    res.setHeader("x-request-id", requestId);

    if (!upstream.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream)
      .on("error", (error) => {
        console.error("[vercel-adapter] upstream response stream failed", error);
        if (!res.headersSent) sendJson(res, 502, {
          status: "unavailable",
          service: "swarmx-api-gateway",
          error: "upstream_stream_failed",
          message: error instanceof Error ? error.message : String(error),
        });
        else res.destroy(error instanceof Error ? error : undefined);
      })
      .pipe(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    console.error("[vercel-adapter] upstream invocation failed", {
      message,
      stack: error instanceof Error ? error.stack : undefined,
      target: target.toString(),
    });
    sendJson(res, timedOut ? 504 : 502, {
      status: "unavailable",
      service: "swarmx-api-gateway",
      error: timedOut ? "upstream_timeout" : "upstream_unreachable",
      message: timedOut
        ? "The Render-hosted API did not respond within 8 seconds."
        : message,
      requestId,
    });
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const pathname = new URL(req.url ?? "/", "http://vercel.local").pathname;

  if (req.method === "GET" && (pathname === "/" || pathname === "/health" || pathname === "/api/health")) {
    sendJson(res, 200, {
      status: "ok",
      service: "swarmx-api-gateway",
      version: process.env["npm_package_version"] ?? "2026.6.0",
      execution: "vercel-gateway",
      ts: Date.now(),
    });
    return;
  }

  if (process.env["VERCEL"]) {
    await proxyToRender(req, res);
    return;
  }

  try {
    const server = await getServer();
    await server.ready();
    server.server.emit("request", req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[vercel-adapter] Fastify invocation failed", {
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    sendJson(res, 503, {
      status: "unavailable",
      service: "swarmx-api",
      error: "server_initialization_failed",
      message,
    });
  }
}
