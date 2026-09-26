import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VideoJobError } from "../src/types/video.js";
import { Queue } from "bullmq";

// Mock BullMQ before any import that pulls in video-queue (which imports Queue at module level)
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue(undefined),
    getJob: vi.fn().mockResolvedValue(null),
    changePriority: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn(),
}));

import { resetEnvForTesting } from "../src/lib/env.js";
import {
  _resetRegistryForTesting,
  setBullMQRuntimeEnabled,
  enqueue,
  getJob,
  listJobs,
  startJob,
  completeJob,
  failJob,
  cancelJob,
  dequeueNext,
  runningCount,
  queuedCount,
  hydrateVideoQueueFromDisk,
  setRetrySchedule,
} from "../src/services/video-queue.js";

let tempHome: string | undefined;

const nonRetryableError: VideoJobError = {
  code: "RENDER_FAILED",
  message: "render failed",
  retryable: false,
};
const retryableError: VideoJobError = {
  code: "TIMEOUT",
  message: "timed out",
  retryable: true,
};

beforeEach(() => {
  if (tempHome) rmSync(tempHome, { recursive: true, force: true });
  tempHome = mkdtempSync(join(tmpdir(), "swarmx-video-queue-test-"));
  process.env["SWARMX_HOME"] = tempHome;
  resetEnvForTesting();
  _resetRegistryForTesting();
  setBullMQRuntimeEnabled(false);
});

afterEach(() => {
  if (tempHome) {
    rmSync(tempHome, { recursive: true, force: true });
    tempHome = undefined;
  }
  delete process.env["SWARMX_HOME"];
  resetEnvForTesting();
});

describe("enqueue", () => {
  test("creates job with status=queued and overallProgress=0", () => {
    const job = enqueue({ prompt: "make a video" });
    expect(job.id).toBeTruthy();
    expect(job.status).toBe("queued");
    expect(job.overallProgress).toBe(0);
    expect(job.retryCount).toBe(0);
    expect(job.maxRetries).toBe(3);
    expect(job.request.prompt).toBe("make a video");
  });

  test("returns existing non-terminal job for same clientRequestId (idempotency)", () => {
    const req = { prompt: "test", clientRequestId: "req-abc" };
    const job1 = enqueue(req);
    const job2 = enqueue(req);
    expect(job2.id).toBe(job1.id);
  });

  test("creates new job after matching clientRequestId job reaches terminal state", () => {
    const req = { prompt: "test", clientRequestId: "req-xyz" };
    const job1 = enqueue(req);
    startJob(job1.id);
    completeJob(job1.id, undefined);
    // job1 is now completed (terminal) — next enqueue should create a new job
    const job2 = enqueue(req);
    expect(job2.id).not.toBe(job1.id);
    expect(job2.status).toBe("queued");
  });

  test("throws when the queue is full (MAX_QUEUE_SIZE active jobs)", () => {
    for (let i = 0; i < 20; i++) {
      enqueue({ prompt: `job ${i}` });
    }
    expect(() => enqueue({ prompt: "overflow" })).toThrow(/queue is full/i);
  });

  test("fails closed when BullMQ rejects the remote enqueue", async () => {
    setBullMQRuntimeEnabled(true);
    vi.mocked(Queue).mockImplementationOnce(() => ({
      add: vi.fn().mockRejectedValue(new Error("Upstash unavailable")),
      getJob: vi.fn().mockResolvedValue(null),
      changePriority: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }) as never);

    const job = enqueue({ prompt: "remote queue failure" });
    expect(job.status).toBe("queued");

    await Promise.resolve();
    await Promise.resolve();

    const failed = getJob(job.id);
    expect(failed?.status).toBe("failed");
    expect(failed?.error?.code).toBe("QUEUE_UNAVAILABLE");
    expect(failed?.error?.retryable).toBe(false);
  });
});

describe("getJob", () => {
  test("returns the job by id", () => {
    const job = enqueue({ prompt: "find me" });
    expect(getJob(job.id)).toBe(job);
  });

  test("returns undefined for unknown id", () => {
    expect(getJob("non-existent-id")).toBeUndefined();
  });
});

describe("durable state", () => {
  test("hydrates jobs from the local snapshot after registry reset", () => {
    const job = enqueue({ prompt: "persist me", clientRequestId: "persist-1" });
    _resetRegistryForTesting();
    const restored = hydrateVideoQueueFromDisk();
    expect(restored).toBe(1);
    expect(getJob(job.id)?.clientRequestId).toBe("persist-1");
  });
});

describe("startJob", () => {
  test("transitions queued → running and sets startedAt", () => {
    const job = enqueue({ prompt: "run me" });
    const started = startJob(job.id);
    expect(started).not.toBeNull();
    expect(started?.status).toBe("running");
    expect(started?.startedAt).toBeDefined();
  });

  test("returns null when concurrency is saturated (SINGLE-VIDEO LOCK)", () => {
    const job1 = enqueue({ prompt: "first" });
    const job2 = enqueue({ prompt: "second" });
    startJob(job1.id); // running=1
    const result = startJob(job2.id); // running >= concurrency(1) → null
    expect(result).toBeNull();
    expect(getJob(job2.id)?.status).toBe("queued");
  });

  test("returns null for non-existent job id", () => {
    expect(startJob("no-such-id")).toBeNull();
  });

  test("clears stale retry errors when a queued retry starts", () => {
    const job = enqueue({ prompt: "retry cleanly" });
    startJob(job.id);
    const requeued = failJob(job.id, retryableError);
    expect(requeued.error?.code).toBe("TIMEOUT");

    const restarted = startJob(job.id);
    expect(restarted?.status).toBe("running");
    expect(restarted?.error).toBeUndefined();
  });
});

describe("completeJob", () => {
  test("transitions running → completed with overallProgress=100", () => {
    const job = enqueue({ prompt: "finish me" });
    startJob(job.id);
    const done = completeJob(job.id, undefined);
    expect(done.status).toBe("completed");
    expect(done.overallProgress).toBe(100);
    expect(done.completedAt).toBeDefined();
    expect(done.currentStage).toBeUndefined();
  });

  test("does not expose stale retry errors after successful completion", () => {
    const job = enqueue({ prompt: "finish after retry" });
    startJob(job.id);
    failJob(job.id, retryableError);
    startJob(job.id);

    const done = completeJob(job.id, undefined);

    expect(done.status).toBe("completed");
    expect(done.error).toBeUndefined();
  });
});

describe("failJob", () => {
  test("non-retryable error transitions to failed and stores error", () => {
    const job = enqueue({ prompt: "fail me" });
    startJob(job.id);
    const failed = failJob(job.id, nonRetryableError);
    expect(failed.status).toBe("failed");
    expect(failed.error?.code).toBe("RENDER_FAILED");
    expect(failed.errorLog?.at(-1)?.code).toBe("RENDER_FAILED");
  });

  test("retryable error when retryCount < MAX_RETRIES requeues the job", () => {
    const job = enqueue({ prompt: "retry me" });
    startJob(job.id);
    // retryCount=0, MAX_RETRIES=3 (default) → 0 < 3 → requeue
    const requeued = failJob(job.id, retryableError);
    expect(requeued.status).toBe("queued");
    expect(requeued.retryCount).toBe(1);
    expect(requeued.overallProgress).toBe(0);
    expect(requeued.errorLog?.length).toBe(1);
  });

  test("retryable error exhausts after the third default retry", () => {
    const job = enqueue({ prompt: "retry thrice" });
    startJob(job.id);
    expect(failJob(job.id, retryableError).status).toBe("queued");
    startJob(job.id);
    expect(failJob(job.id, retryableError).status).toBe("queued");
    startJob(job.id);
    expect(failJob(job.id, retryableError).status).toBe("queued");
    startJob(job.id);
    const exhausted = failJob(job.id, retryableError);
    expect(exhausted.status).toBe("failed");
    expect(exhausted.retryCount).toBe(3);
    expect(exhausted.errorLog?.length).toBe(4);
  });

  test("retry scheduling metadata can be set on queued retries", () => {
    const job = enqueue({ prompt: "schedule retry" });
    startJob(job.id);
    failJob(job.id, retryableError);

    const scheduled = setRetrySchedule(job.id, 12_500);
    expect(scheduled).not.toBeNull();
    expect(scheduled?.nextRetryDelayMs).toBe(12_500);
    expect(scheduled?.nextRetryAt).toBeDefined();
  });
});

// The dashboard (video/page.tsx, VideoJobCard.tsx) classifies a job as
// "dead-letter" using exactly this predicate against the queue payload:
//   job.status === "failed" && job.maxRetries !== undefined
//     && job.retryCount >= job.maxRetries
// These tests lock that contract at the source (video-queue.ts), since both
// GET /api/video/jobs[/:id] and the video:failed SSE event forward this
// object (or its retryCount/maxRetries fields) to the UI unmodified.
describe("dead-letter UI contract (retryCount >= maxRetries)", () => {
  function exhaustRetries(jobId: string): void {
    for (let i = 0; i < 3; i++) {
      expect(failJob(jobId, retryableError).status).toBe("queued");
      startJob(jobId);
    }
  }

  test("retry-budget exhaustion satisfies the full dead-letter predicate", () => {
    const job = enqueue({ prompt: "exhaust retries" });
    startJob(job.id);
    exhaustRetries(job.id);

    const deadLetter = failJob(job.id, retryableError);

    expect(deadLetter.status).toBe("failed");
    expect(deadLetter.maxRetries).toBeDefined();
    expect(deadLetter.retryCount).toBeGreaterThanOrEqual(deadLetter.maxRetries!);
  });

  test("retryCount never overshoots maxRetries on the exhausting failure", () => {
    const job = enqueue({ prompt: "no overshoot" });
    startJob(job.id);
    exhaustRetries(job.id);

    const deadLetter = failJob(job.id, retryableError);
    expect(deadLetter.retryCount).toBe(deadLetter.maxRetries);
  });

  test("an immediate non-retryable failure is terminal but does NOT satisfy the dead-letter predicate", () => {
    // Locks the semantic distinction: "failed" alone does not mean
    // dead-letter. A hard failure that never entered the retry loop has
    // retryCount(0) < maxRetries, so the dashboard must not badge it as
    // retry-exhausted dead-letter even though it is a terminal failure.
    const job = enqueue({ prompt: "hard fail" });
    startJob(job.id);
    const failed = failJob(job.id, nonRetryableError);

    expect(failed.status).toBe("failed");
    expect(failed.maxRetries).toBeDefined();
    expect(failed.retryCount).toBeLessThan(failed.maxRetries!);
  });

  test("maxRetries is always defined on payloads the predicate's guard clause depends on", () => {
    const queuedJob = enqueue({ prompt: "guard queued" });
    expect(queuedJob.maxRetries).toBeDefined();

    startJob(queuedJob.id);
    const failed = failJob(queuedJob.id, nonRetryableError);
    expect(failed.maxRetries).toBeDefined();
  });

  test("a dead-letter job clears any pending retry schedule", () => {
    const job = enqueue({ prompt: "clear schedule" });
    startJob(job.id);
    failJob(job.id, retryableError);
    setRetrySchedule(job.id, 5_000);
    startJob(job.id);
    // First fail() already consumed one retry above; two more exhaust it.
    failJob(job.id, retryableError);
    startJob(job.id);
    failJob(job.id, retryableError);
    startJob(job.id);

    const deadLetter = failJob(job.id, retryableError);

    expect(deadLetter.status).toBe("failed");
    expect(deadLetter.nextRetryAt).toBeUndefined();
    expect(deadLetter.nextRetryDelayMs).toBeUndefined();
  });

  test("errorLog on a dead-letter job preserves history for the retry-history UI block", () => {
    const job = enqueue({ prompt: "history preserved" });
    startJob(job.id);
    exhaustRetries(job.id);

    const deadLetter = failJob(job.id, nonRetryableError);

    expect(deadLetter.errorLog).toBeDefined();
    expect(deadLetter.errorLog!.length).toBe(4);
    expect(deadLetter.errorLog!.at(-1)?.code).toBe("RENDER_FAILED");
    // VideoJobCard renders the last 3 entries, most-recent first.
    expect(deadLetter.errorLog!.slice(-3)).toHaveLength(3);
  });
});

describe("cancelJob", () => {
  test("cancels a queued job and returns true", () => {
    const job = enqueue({ prompt: "cancel me" });
    expect(cancelJob(job.id)).toBe(true);
    expect(getJob(job.id)?.status).toBe("cancelled");
  });

  test("returns false for a job already in terminal state", () => {
    const job = enqueue({ prompt: "already done" });
    startJob(job.id);
    completeJob(job.id, undefined);
    expect(cancelJob(job.id)).toBe(false);
    expect(getJob(job.id)?.status).toBe("completed");
  });
});

describe("listJobs", () => {
  test("returns all jobs in the registry", () => {
    enqueue({ prompt: "a" });
    enqueue({ prompt: "b" });
    const { jobs, total } = listJobs();
    expect(total).toBe(2);
    expect(jobs).toHaveLength(2);
  });

  test("filters by status when provided", () => {
    const job1 = enqueue({ prompt: "a" });
    enqueue({ prompt: "b" });
    startJob(job1.id); // job1 → running
    const { jobs: queued, total } = listJobs({ status: "queued" });
    expect(total).toBe(1);
    expect(queued[0]?.status).toBe("queued");
  });
});

describe("runningCount and queuedCount", () => {
  test("track job counts correctly across state transitions", () => {
    expect(runningCount()).toBe(0);
    expect(queuedCount()).toBe(0);

    const job = enqueue({ prompt: "count me" });
    expect(queuedCount()).toBe(1);
    expect(runningCount()).toBe(0);

    startJob(job.id);
    expect(queuedCount()).toBe(0);
    expect(runningCount()).toBe(1);

    completeJob(job.id, undefined);
    expect(queuedCount()).toBe(0);
    expect(runningCount()).toBe(0);
  });
});

describe("dequeueNext", () => {
  test("returns the queued job when running=0", () => {
    const job = enqueue({ prompt: "dequeue me" });
    const next = dequeueNext();
    expect(next?.id).toBe(job.id);
  });

  test("returns undefined when queue is empty", () => {
    expect(dequeueNext()).toBeUndefined();
  });

  test("returns undefined when concurrency is saturated", () => {
    const job1 = enqueue({ prompt: "running" });
    enqueue({ prompt: "waiting" });
    startJob(job1.id); // running=1
    expect(dequeueNext()).toBeUndefined();
  });
});
