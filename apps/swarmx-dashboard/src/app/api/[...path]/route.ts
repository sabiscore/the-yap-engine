import { type NextRequest } from "next/server";
import { resolveServerApiUrl } from "@/lib/api-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API_URL = resolveServerApiUrl();
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function buildTargetUrl(path: string[], request: NextRequest): string {
  const target = new URL(`${API_URL}/api/${path.map(encodeURIComponent).join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });
  return target.toString();
}

function forwardedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("authorization");
  headers.delete("x-video-api-key");

  const token = process.env.SWARMX_VIDEO_API_TOKEN?.trim();
  const pathname = request.nextUrl.pathname;
  const isAnalyticsRead =
    request.method.toUpperCase() === "GET" &&
    pathname === "/api/video/factory/analytics/monetization";
  if (token && (WRITE_METHODS.has(request.method.toUpperCase()) || isAnalyticsRead)) {
    headers.set("authorization", `Bearer ${token}`);
    headers.set("x-video-api-key", token);
  }

  return headers;
}

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const method = request.method.toUpperCase();
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: forwardedHeaders(request),
    cache: "no-store",
    redirect: "manual",
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  return fetch(buildTargetUrl(path, request), init);
}

export {
  proxyRequest as DELETE,
  proxyRequest as GET,
  proxyRequest as HEAD,
  proxyRequest as PATCH,
  proxyRequest as POST,
  proxyRequest as PUT,
};
