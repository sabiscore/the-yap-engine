import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi, afterEach } from "vitest";
import { executeTikTokDirectPostWithAccessToken } from "../src/services/tiktok-protocol.js";

describe("TikTok Direct Post protocol", () => {
  afterEach(() => vi.restoreAllMocks());

  it("executes creator-info -> init -> bounded PUT -> status fetch and discloses AIGC", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tiktok-protocol-"));
    const file = join(dir, "sample.mp4");
    writeFileSync(file, Buffer.alloc(10 * 1024 * 1024 + 123));

    const calls: Array<{ url: string; method: string; body?: string | Uint8Array | null }> = [];
    let statusCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body as string | Uint8Array | null | undefined });
      if (url.endsWith("/creator_info/query/")) {
        return new Response(JSON.stringify({
          data: { privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"], max_video_post_duration_sec: 600 },
          error: { code: "ok" },
        }), { status: 200 });
      }
      if (url.endsWith("/video/init/")) {
        const body = JSON.parse(String(init?.body));
        expect(body.post_info.privacy_level).toBe("SELF_ONLY");
        expect(body.post_info.is_aigc).toBe(true);
        expect(body.source_info.source).toBe("FILE_UPLOAD");
        expect(body.source_info.total_chunk_count).toBe(2);
        return new Response(JSON.stringify({
          data: { publish_id: "pub-test-1", upload_url: "https://upload.example/video" },
          error: { code: "ok" },
        }), { status: 200 });
      }
      if (url === "https://upload.example/video") {
        expect(method).toBe("PUT");
        const body = init?.body;
        const chunkLength = body instanceof Uint8Array
          ? body.byteLength
          : typeof body === "string"
            ? new TextEncoder().encode(body).byteLength
            : 0;
        expect(chunkLength).toBeGreaterThan(0);
        expect(chunkLength).toBeGreaterThanOrEqual(5 * 1024 * 1024);
        expect(chunkLength).toBeLessThanOrEqual(10 * 1024 * 1024 + 123);
        return new Response("", { status: 201 });
      }
      if (url.endsWith("/status/fetch/")) {
        statusCalls += 1;
        return new Response(JSON.stringify({
          data: statusCalls === 1 ? { status: "PROCESSING" } : { status: "PUBLISH_COMPLETE", public_url: "https://tiktok.com/@test/video/1" },
          error: { code: "ok" },
        }), { status: 200 });
      }
      throw new Error("Unexpected URL " + url);
    }));

    try {
      const result = await executeTikTokDirectPostWithAccessToken({
        token: "test-token",
        prompt: "Controlled verification",
        outputPath: file,
        durationSeconds: 75,
        privacyLevel: "SELF_ONLY",
        requireSelfOnly: true,
        pollAttempts: 2,
        pollDelayMs: 0,
      });
      expect(result).toEqual({
        publishId: "pub-test-1",
        status: "published",
        platformUrl: "https://tiktok.com/@test/video/1",
      });
      expect(calls.map((call) => call.method)).toEqual(["POST", "POST", "PUT", "PUT", "POST", "POST"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when controlled verification cannot obtain SELF_ONLY privacy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: { privacy_level_options: ["PUBLIC_TO_EVERYONE"] },
      error: { code: "ok" },
    }), { status: 200 })));
    const dir = mkdtempSync(join(tmpdir(), "tiktok-privacy-"));
    const file = join(dir, "sample.mp4");
    writeFileSync(file, "fixture");
    try {
      await expect(executeTikTokDirectPostWithAccessToken({
        token: "test-token",
        prompt: "Controlled verification",
        outputPath: file,
        privacyLevel: "SELF_ONLY",
        requireSelfOnly: true,
        pollAttempts: 1,
        pollDelayMs: 0,
      })).rejects.toThrow("SELF_ONLY");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
