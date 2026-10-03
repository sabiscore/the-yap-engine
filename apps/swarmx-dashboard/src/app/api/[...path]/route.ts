import { randomUUID, timingSafeEqual } from "node:crypto";
import { type NextRequest } from "next/server";
import { resolveServerApiUrl } from "@/lib/api-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const API_URL = resolveServerApiUrl();
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_PROXY_PREFIXES = ["/api/system/","/api/video/","/api/series/","/api/agents/","/api/workflows/","/api/logs/","/api/settings/"] as const;
const ALLOWED_EXACT_READS = new Set(["/api/health"]);
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function requestId(request: NextRequest): string {
  return request.headers.get("x-request-id")?.trim() || randomUUID();
}

export function isAllowedPath(pathname: string): boolean {
  return ALLOWED_EXACT_READS.has(pathname) || ALLOWED_PROXY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  } catch {
    return false;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function authConfigured(): boolean {
  if (process.env.SWARMX_ALLOW_LOOPBACK_PROXY === "1" && !process.env.SWARMX_DASHBOARD_ACCESS_TOKEN?.trim()) {
    return true;
  }
  return Boolean(process.env.SWARMX_DASHBOARD_ACCESS_TOKEN?.trim());
}

function hasDashboardSession(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production" || process.env.SWARMX_ALLOW_LOOPBACK_PROXY === "1") return true;
  const expected = process.env.SWARMX_DASHBOARD_ACCESS_TOKEN?.trim();
  const actual = request.cookies.get("swarmx_session")?.value?.trim();
  return Boolean(expected && actual && constantTimeEqual(actual, expected));
}

function originAllowed(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configured = process.env.SWARMX_DASHBOARD_ORIGIN?.trim();
  return origin === (configured || request.nextUrl.origin);
}

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() || "unknown";
}

function rateLimited(request: NextRequest): boolean {
  const now = Date.now();
  const key = clientIp(request);
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  if (rateBuckets.size > 2_000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }
  return current.count > RATE_LIMIT;
}

function jsonError(status: number, code: string, message: string, id: string): Response {
  return Response.json(
    { error: code, message, requestId: id },
    { status, headers: { "cache-control": "no-store", "x-request-id": id } },
  );
}

function buildTargetUrl(path: string[], request: NextRequest): string {
  const target = new URL(API_URL + "/api/" + path.map(encodeURIComponent).join("/"));
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  return target.toString();
}

function forwardedHeaders(request: NextRequest, id: string, injectToken: boolean): Headers {
  const headers = new Headers();
  for (const name of ["accept", "content-type", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-request-id", id);
  if (injectToken) {
    const token = process.env.SWARMX_VIDEO_API_TOKEN?.trim();
    if (token) {
      headers.set("authorization", "Bearer " + token);
      headers.set("x-video-api-key", token);
    }
  }
  return headers;
}

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const id = requestId(request);
  const { path } = await context.params;
  const pathname = request.nextUrl.pathname;
  const method = request.method.toUpperCase();
  const isWrite = WRITE_METHODS.has(method);
  const isAnalyticsRead = method === "GET" && pathname === "/api/video/factory/analytics/monetization";

  if (!isAllowedPath(pathname)) {
    return jsonError(404, "route_not_allowed", "The requested API route is not exposed by the dashboard proxy.", id);
  }
  if (
    process.env.NODE_ENV === "production" &&
    isLoopbackUrl(API_URL) &&
    process.env.SWARMX_ALLOW_LOOPBACK_PROXY !== "1"
  ) {
    return jsonError(503, "api_not_configured", "The dashboard API target is not configured for this deployment.", id);
  }
  if ((isWrite || isAnalyticsRead) && !authConfigured()) {
    return jsonError(503, "auth_not_configured", "Dashboard access control is not configured.", id);
  }
  if ((isWrite || isAnalyticsRead) && !hasDashboardSession(request)) {
    return jsonError(401, "dashboard_auth_required", "Sign in before using protected dashboard actions.", id);
  }
  if (isWrite && !originAllowed(request)) {
    return jsonError(403, "csrf_origin_rejected", "The request origin is not allowed.", id);
  }
  if (isWrite && rateLimited(request)) {
    return jsonError(429, "rate_limited", "Too many protected requests. Retry shortly.", id);
  }

  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: forwardedHeaders(request, id, isWrite || isAnalyticsRead),
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(pathname.endsWith("/sse") ? 55_000 : 8_000),
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  try {
    const upstream = await fetch(buildTargetUrl(path, request), init);
    if (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) {
      return jsonError(
        upstream.status,
        upstream.status === 503 ? "upstream_unavailable" : "upstream_gateway_error",
        upstream.status === 503
          ? "The video service is temporarily unavailable. Check System → Health."
          : "The video service returned a gateway error. Retry only after checking the service state.",
        id,
      );
    }
    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("x-request-id", id);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return jsonError(
      timedOut ? 504 : 502,
      timedOut ? "upstream_timeout" : "upstream_unreachable",
      timedOut
        ? "The service took too long to respond. Your request may or may not have gone through. Check the queue before retrying."
        : "The service could not be reached. Retry, or open System → Health.",
      id,
    );
  }
}

export {
  proxyRequest as DELETE,
  proxyRequest as GET,
  proxyRequest as HEAD,
  proxyRequest as PATCH,
  proxyRequest as POST,
  proxyRequest as PUT,
};