import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isAllowedPath, isLoopbackUrl, GET } from "@/app/api/[...path]/route";

describe("dashboard proxy contract", () => {
  it("allows only dashboard API namespaces", () => {
    expect(isAllowedPath("/api/video/jobs")).toBe(true);
    expect(isAllowedPath("/api/system/health")).toBe(true);
    expect(isAllowedPath("/api/events")).toBe(true);
    expect(isAllowedPath("/api/sse")).toBe(true);
    expect(isAllowedPath("/api/agents")).toBe(true);
    expect(isAllowedPath("/api/workflows")).toBe(true);
    expect(isAllowedPath("/api/models/status")).toBe(true);
    expect(isAllowedPath("/api/composer/chat")).toBe(true);
    expect(isAllowedPath("/api/metrics")).toBe(true);
    expect(isAllowedPath("/api/config")).toBe(true);
    expect(isAllowedPath("/api/terminal/sessions")).toBe(true);
    expect(isAllowedPath("/api/admin/secrets")).toBe(false);
    expect(isAllowedPath("/api/../../etc/passwd")).toBe(false);
  });

  it("recognises loopback upstreams", () => {
    expect(isLoopbackUrl("http://127.0.0.1:3001")).toBe(true);
    expect(isLoopbackUrl("http://localhost:3001")).toBe(true);
    expect(isLoopbackUrl("https://api.example.com")).toBe(false);
  });

  it("returns clean offline health payload with 200 when upstream is down", async () => {
    const req = new NextRequest("http://localhost:3000/api/system/health");
    const res = await GET(req, { params: Promise.resolve({ path: ["system", "health"] }) });
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data["status"]).toBe("offline");
    expect(data["apiOnline"]).toBe(false);
    expect(data["service"]).toBe("swarmx-api");
  });

  it("returns fallback SSE stream with 200 and retry delay when upstream is down", async () => {
    const req = new NextRequest("http://localhost:3000/api/events", {
      headers: { accept: "text/event-stream" },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["events"] }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("retry: 3000");
  });

  it("returns empty event history with 200 when upstream is down", async () => {
    const req = new NextRequest("http://localhost:3000/api/logs/events?limit=120");
    const res = await GET(req, { params: Promise.resolve({ path: ["logs", "events"] }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { events: unknown[]; count: number; offline?: boolean };
    expect(data.events).toEqual([]);
    expect(data.offline).toBe(true);
  });

  it("returns 502 with upstream_unreachable for data endpoints when upstream is down", async () => {
    const req = new NextRequest("http://localhost:3000/api/video/jobs");
    const res = await GET(req, { params: Promise.resolve({ path: ["video", "jobs"] }) });
    expect(res.status).toBe(502);
    const data = await res.json() as { error: string };
    expect(data.error).toBe("upstream_unreachable");
  });

  it("rejects unauthorized namespaces with 404", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/secrets");
    const res = await GET(req, { params: Promise.resolve({ path: ["admin", "secrets"] }) });
    expect(res.status).toBe(404);
  });
});
