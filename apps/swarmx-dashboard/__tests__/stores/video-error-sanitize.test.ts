/**
 * Regression tests for sanitizeApiError — ensures known API error codes are
 * mapped to operator-safe messages and that raw stack traces / internal paths
 * are never surfaced to users.
 */

import { describe, expect, it } from "vitest";

// sanitizeApiError and ApiError are exported for testing only.
import { sanitizeApiError, ApiError } from "@/stores/video";

describe("sanitizeApiError", () => {
  it("maps rate_limited to a Too Many Submissions message with hourly context", () => {
    const err = new ApiError(429, "Rate limited", "rate_limited");
    const msg = sanitizeApiError(err);
    expect(msg).toContain("Too Many Submissions");
    expect(msg).toContain("1 hour");
    expect(msg).not.toContain("Rate limited");
  });

  it("maps generic 429 (unknown code) to a Too Many Submissions message", () => {
    const err = new ApiError(429, "Too many requests", null);
    const msg = sanitizeApiError(err);
    expect(msg).toContain("Too Many Submissions");
  });

  it("maps insufficient_ram_for_video to an Admission Denied RAM message", () => {
    const err = new ApiError(503, "Insufficient RAM", "insufficient_ram_for_video");
    const msg = sanitizeApiError(err);
    expect(msg).toContain("Admission Denied");
    expect(msg).toContain("RAM");
    expect(msg).not.toContain("503");
    expect(msg).not.toContain("Insufficient RAM");
  });

  it("maps admission_denied to an Admission Denied generic message", () => {
    const err = new ApiError(422, "Admission denied", "admission_denied");
    const msg = sanitizeApiError(err);
    expect(msg).toContain("Admission Denied");
    expect(msg).not.toContain("422");
  });

  it("maps queue_full to an Admission Denied queue message", () => {
    const err = new ApiError(503, "Queue is full", "queue_full");
    const msg = sanitizeApiError(err);
    expect(msg).toContain("Admission Denied");
    expect(msg).toContain("queue");
    expect(msg).not.toContain("Queue is full");
  });

  it("maps ffmpeg_unavailable to a Missing: ffmpeg message with install command", () => {
    const err = new ApiError(503, "ffmpeg not found", "ffmpeg_unavailable");
    const msg = sanitizeApiError(err);
    expect(msg).toContain("Missing: ffmpeg");
    expect(msg).toContain("apt install");
  });

  it("maps ffprobe_unavailable to a Missing: ffprobe message with install command", () => {
    const err = new ApiError(503, "ffprobe not found", "ffprobe_unavailable");
    const msg = sanitizeApiError(err);
    expect(msg).toContain("Missing: ffprobe");
    expect(msg).toContain("apt install");
  });

  it("maps voice_provider_unavailable to provider guidance without exposing internals", () => {
    const err = new ApiError(503, "voice provider not found", "voice_provider_unavailable");
    const msg = sanitizeApiError(err);
    expect(msg).toContain("Voice Provider Unavailable");
    expect(msg).toContain("Kokoro");
    expect(msg).toContain("Piper");
    expect(msg).toContain("espeak-ng");
  });

  it("maps unauthorized to a token guidance message", () => {
    const err = new ApiError(401, "Unauthorized", "unauthorized");
    const msg = sanitizeApiError(err);
    expect(msg.toLowerCase()).toContain("token");
    expect(msg).toContain("SWARMX_VIDEO_API_TOKEN");
    expect(msg).not.toContain(`NEXT_PUBLIC_${"SWARMX_VIDEO_API_TOKEN"}`);
  });

  it("maps generic 503 to a service-unavailable message", () => {
    const err = new ApiError(503, "Service unavailable", "some_unknown_code");
    const msg = sanitizeApiError(err);
    expect(msg).toContain("temporarily unavailable");
  });

  it("maps upstream_unreachable or 502 to a calm unreachable message", () => {
    const err1 = new ApiError(502, "Bad Gateway", "upstream_unreachable");
    expect(sanitizeApiError(err1)).toContain("3001");
    const err2 = new ApiError(502, "Bad Gateway", null);
    expect(sanitizeApiError(err2)).toContain("3001");
  });

  it("maps upstream_timeout or 504 to a calm timeout message", () => {
    const err1 = new ApiError(504, "Gateway Timeout", "upstream_timeout");
    expect(sanitizeApiError(err1)).toContain("timed out");
    const err2 = new ApiError(504, "Gateway Timeout", null);
    expect(sanitizeApiError(err2)).toContain("timed out");
  });

  it("never surfaces internal path strings from the error message", () => {
    const err = new ApiError(500, "API /api/video/jobs → 500: /home/scar/Documents/SwarmXQ/src/foo.ts:42", null);
    const msg = sanitizeApiError(err);
    expect(msg).not.toContain("/home");
    expect(msg).not.toContain(".ts:");
  });

  it("maps fetch TypeError to a connection message", () => {
    const err = new TypeError("Failed to fetch");
    const msg = sanitizeApiError(err);
    expect(msg).toContain("3001");
  });

  it("uses the fallback for unknown non-ApiError exceptions", () => {
    const msg = sanitizeApiError(new Error("something mysterious"), "Custom fallback");
    expect(msg).toBe("Custom fallback");
  });

  it("uses the default fallback when called with null", () => {
    const msg = sanitizeApiError(null);
    expect(msg).toContain("Check that the API");
  });
});
