import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  create_video_job,
  get_video_job,
  wait_for_video_job,
  get_artifact_manifest,
  cancel_video_job,
  validateVideoJobRequest,
} from "../../integrations/openclaw/swarmx-bridge.ts";
import { resetEnvForTesting } from "../src/lib/env.js";

describe("OpenClaw SwarmX bounded bridge", () => {
  const fakeJob = {
    id: "job-123",
    status: "queued",
    prompt: "This private brief must not be returned by the bridge",
    createdAt: new Date().toISOString(),
    outputArtifacts: {
      outputPath: "/tmp/output.mp4",
      checksum: "ab".repeat(32),
      fileSizeBytes: 123456,
      durationSeconds: 22,
      widthPx: 720,
      heightPx: 1280,
      format: "mp4",
    },
  };

  const jsonResponse = (value: unknown, status = 200, headers: Record<string, string> = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
    json: async () => value,
  });

  beforeEach(() => {
    process.env["SWARMX_API_URL"] = "http://127.0.0.1:3001";
    process.env["NODE_ENV"] = "test";
    delete process.env["SWARMX_VIDEO_API_TOKEN"];
    resetEnvForTesting();
  });

  afterEach(() => {
    delete process.env["SWARMX_API_URL"];
    delete process.env["SWARMX_VIDEO_API_TOKEN"];
    delete process.env["SWARMX_VIDEO_ARTIFACT_DIR"];
    resetEnvForTesting();
    vi.restoreAllMocks();
  });

  test("validates and canonicalizes request fields and adds stable idempotency", () => {
    const first = validateVideoJobRequest({ prompt: "List three focus habits", template: "listicle-countdown", platform: "tiktok" });
    const second = validateVideoJobRequest({ platform: "tiktok", template: "listicle-countdown", prompt: "List three focus habits" });
    expect(first.templateFamily).toBe("list/countdown");
    expect(first).not.toHaveProperty("template");
    expect(first.clientRequestId).toBe(second.clientRequestId);
  });

  test("rejects extra fields, invalid template values, oversized prompts and unsafe API origins before fetch", async () => {
    expect(() => validateVideoJobRequest({ prompt: "x", shell: "id" })).toThrow(/Unsupported video request field/);
    expect(() => validateVideoJobRequest({ prompt: "x", templateFamily: "untrusted" })).toThrow(/Invalid video request field/);
    expect(() => validateVideoJobRequest({ prompt: "x".repeat(2001) })).toThrow(/prompt must/);
    const fetchFn = vi.fn();
    await expect(create_video_job({ prompt: "valid" } as any, {
      apiUrl: "http://169.254.169.254",
      apiToken: "test-token",
      fetchFn: fetchFn as any,
    })).rejects.toThrow(/configured API origin|loopback/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("create requires auth and sends canonical request with auth headers", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      jobId: "job-123", status: "queued", createdAt: "2026-10-09T00:00:00Z", message: "Job created",
    }, 201));

    await expect(create_video_job({ prompt: "Test prompt", platform: "tiktok" }, {
      fetchFn: fetchFn as any,
    })).rejects.toThrow(/SWARMX_VIDEO_API_TOKEN is required/);
    expect(fetchFn).not.toHaveBeenCalled();

    const result = await create_video_job({ prompt: "Test prompt", platform: "tiktok" }, {
      apiToken: "secret-token",
      fetchFn: fetchFn as any,
    });
    expect(result.jobId).toBe("job-123");
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:3001/api/video/jobs");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect((init.headers as Record<string, string>)["x-video-api-key"]).toBe("secret-token");
    expect(JSON.parse(String(init.body))).toMatchObject({ prompt: "Test prompt", platform: "tiktok" });
    expect(JSON.parse(String(init.body)).clientRequestId).toMatch(/^openclaw-[a-f0-9]{48}$/);
    expect(init.redirect).toBe("error");
  });

  test("job reads return a bounded projection and never echo the full prompt", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(fakeJob));
    const job = await get_video_job("job-123", { fetchFn: fetchFn as any });
    expect(job.id).toBe("job-123");
    expect(job.status).toBe("queued");
    expect(job.artifactEvidence?.checksum).toBe("ab".repeat(32));
    expect(job).not.toHaveProperty("prompt");
    expect(JSON.stringify(job)).not.toContain("private brief");
  });

  test("rejects malformed job identifiers before network access", async () => {
    const fetchFn = vi.fn();
    await expect(get_video_job("../etc/passwd", { fetchFn: fetchFn as any })).rejects.toThrow(/Invalid video job ID/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("bounds response size using declared content length", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 200, { "content-length": String(300 * 1024) }));
    await expect(get_video_job("job-123", { fetchFn: fetchFn as any })).rejects.toThrow(/response exceeds/);
  });

  test("waits until a terminal job status with bounded polling", async () => {
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(async () => {
      callCount += 1;
      return jsonResponse({ ...fakeJob, status: callCount > 1 ? "completed" : "running" });
    });
    const job = await wait_for_video_job("job-123", {
      pollIntervalMs: 500,
      timeoutMs: 2_000,
      fetchFn: fetchFn as any,
    });
    expect(job.status).toBe("completed");
    expect(callCount).toBe(2);
    await expect(wait_for_video_job("job-123", { timeoutMs: 901_000, fetchFn: fetchFn as any }))
      .rejects.toThrow(/timeoutMs must/);
    await expect(wait_for_video_job("job-123", { pollIntervalMs: 10_001, fetchFn: fetchFn as any }))
      .rejects.toThrow(/pollIntervalMs must/);
  });

  test("rejects manifests outside configured artifact/export roots", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      ...fakeJob,
      outputArtifacts: { ...fakeJob.outputArtifacts, manifestPath: "/etc/passwd" },
    }));
    await expect(get_artifact_manifest("job-123", { fetchFn: fetchFn as any }))
      .rejects.toThrow(/outside configured artifact\/export roots/);
  });

  test("reads in-root manifest but redacts prompt-like data", async () => {
    const root = await mkdtemp(join(tmpdir(), "swarmx-bridge-manifest-"));
    const manifestDir = join(root, "job-123");
    await mkdir(manifestDir, { recursive: true });
    const manifestPath = join(manifestDir, "manifest.json");
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: "1.0",
      jobId: "job-123",
      certificationTier: "TECHNICALLY_VALID",
      prompt: "this must not leak",
      mediaQualityReport: { passed: false, blockers: ["visual review pending"] },
    }));
    process.env["SWARMX_VIDEO_ARTIFACT_DIR"] = root;
    resetEnvForTesting();
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      ...fakeJob,
      outputArtifacts: { ...fakeJob.outputArtifacts, manifestPath },
    }));
    try {
      const manifest = await get_artifact_manifest("job-123", { fetchFn: fetchFn as any });
      expect(manifest.manifestData?.certificationTier).toBe("TECHNICALLY_VALID");
      expect(JSON.stringify(manifest.manifestData)).not.toContain("this must not leak");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("cancel requires authorization and validates the job ID", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ jobId: "job-123", cancelled: true, previousStatus: "running" }));
    await expect(cancel_video_job("job-123", { fetchFn: fetchFn as any })).rejects.toThrow(/SWARMX_VIDEO_API_TOKEN is required/);
    const result = await cancel_video_job("job-123", { apiToken: "test-token", fetchFn: fetchFn as any });
    expect(result.cancelled).toBe(true);
    expect(result.previousStatus).toBe("running");
  });
});
