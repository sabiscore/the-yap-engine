import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateVideoPreUpload } from "../src/services/publishers/pre-upload-validator.js";
import { YouTubeShortsPublisher } from "../src/services/publishers/youtube.js";
import { enqueuePublishTask, getPublishTask } from "../src/services/publishing-queue.js";

describe("Platform Publishing Pipeline (APEX-19 r1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Pre-Upload Media Validator", () => {
    it("should return valid: false if the video file does not exist", async () => {
      const result = await validateVideoPreUpload("/tmp/nonexistent-video-file-12345.mp4");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("does not exist");
    });
  });

  describe("YouTubeShortsPublisher", () => {
    it("should gracefully require approval and fallback when token is unconfigured", async () => {
      const publisher = new YouTubeShortsPublisher();
      const mockJob: any = {
        id: "job-test-yt-001",
        status: "completed",
        request: {
          prompt: "Insane Local LLM Performance",
          platform: "shorts",
        },
      };

      const tmpDir = mkdtempSync(join(tmpdir(), "swarmx-yt-test-"));
      const sampleFile = join(tmpDir, "sample.mp4");
      writeFileSync(sampleFile, "fake-video-bytes");

      try {
        const mockArtifacts: any = {
          outputPath: sampleFile,
          format: "mp4",
          durationSeconds: 30,
        };

        const result = await publisher.publish(mockJob, mockArtifacts);
        expect(result.platform).toBe("shorts");
        expect(result.status).toBe("pending_review");
        expect(result.requiresApproval).toBe(true);
        expect(result.failureReason).toContain("YouTube Data API requires OAuth credentials");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("Publishing Queue", () => {
    it("should enqueue a publish task and track in registry", async () => {
      const record = await enqueuePublishTask({
        jobId: "job-publish-test-01",
        platform: "shorts",
        filePath: "/tmp/sample-video.mp4",
        title: "Test Short Episode 1",
      });

      expect(record.id).toBeDefined();
      expect(record.status).toBe("queued");
      expect(record.request.platform).toBe("shorts");

      const retrieved = getPublishTask(record.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(record.id);
    });
  });
});
