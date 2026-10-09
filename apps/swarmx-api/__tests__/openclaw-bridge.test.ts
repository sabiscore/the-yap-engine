import { describe, test, expect, vi } from "vitest";
import {
  create_video_job,
  get_video_job,
  wait_for_video_job,
  get_artifact_manifest,
  cancel_video_job,
} from "../../integrations/openclaw/swarmx-bridge.ts";

describe("OpenClaw SwarmX Bounded Bridge", () => {
  const fakeJob = {
    id: "job-123",
    status: "queued",
    prompt: "Test short",
    createdAt: new Date().toISOString(),
    outputArtifacts: {
      manifestPath: "/tmp/non-existent-manifest.json",
      outputPath: "/tmp/output.mp4",
    },
  };

  test("create_video_job submits POST request with auth headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        jobId: "job-123",
        status: "queued",
        createdAt: "2026-10-09T00:00:00Z",
        message: "Job created",
      }),
    });

    const result = await create_video_job(
      { prompt: "Test prompt", platform: "tiktok" } as any,
      {
        apiUrl: "http://127.0.0.1:3001",
        apiToken: "secret-token",
        fetchFn: mockFetch as any,
      },
    );

    expect(result.jobId).toBe("job-123");
    expect(mockFetch).toHaveBeenCalledWith("http://127.0.0.1:3001/api/video/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-token",
        "x-video-api-key": "secret-token",
      },
      body: JSON.stringify({ prompt: "Test prompt", platform: "tiktok" }),
    });
  });

  test("get_video_job queries GET endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fakeJob,
    });

    const job = await get_video_job("job-123", {
      apiUrl: "http://127.0.0.1:3001",
      fetchFn: mockFetch as any,
    });

    expect(job.id).toBe("job-123");
    expect(mockFetch).toHaveBeenCalledWith("http://127.0.0.1:3001/api/video/jobs/job-123", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
  });

  test("wait_for_video_job polls until terminal status", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...fakeJob,
          status: callCount > 1 ? "completed" : "running",
        }),
      };
    });

    const job = await wait_for_video_job("job-123", {
      apiUrl: "http://127.0.0.1:3001",
      pollIntervalMs: 10,
      timeoutMs: 1000,
      fetchFn: mockFetch as any,
    });

    expect(job.status).toBe("completed");
    expect(callCount).toBe(2);
  });

  test("get_artifact_manifest returns artifacts from job", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fakeJob,
    });

    const manifest = await get_artifact_manifest("job-123", {
      apiUrl: "http://127.0.0.1:3001",
      fetchFn: mockFetch as any,
    });

    expect(manifest.jobId).toBe("job-123");
    expect(manifest.outputArtifacts?.outputPath).toBe("/tmp/output.mp4");
  });

  test("cancel_video_job sends cancel request", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ jobId: "job-123", cancelled: true, previousStatus: "running" }),
    });

    const result = await cancel_video_job("job-123", {
      apiUrl: "http://127.0.0.1:3001",
      fetchFn: mockFetch as any,
    });

    expect(result.cancelled).toBe(true);
    expect(result.previousStatus).toBe("running");
  });
});
