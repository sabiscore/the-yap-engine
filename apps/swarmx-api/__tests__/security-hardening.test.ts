import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadEnv, resetEnvForTesting } from "../src/lib/env.js";
import { isTerminalPtyAllowed } from "../src/plugins/websocket.js";

describe("Phase 1: Security Hardening", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetEnvForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvForTesting();
  });

  describe("Preview-branch safety guard (G-R / Sec P0)", () => {
    it("fails when running in preview environment and NEON_BRANCH is production", () => {
      process.env["VERCEL_ENV"] = "preview";
      process.env["NEON_BRANCH"] = "production";
      expect(() => loadEnv()).toThrow(/Preview deployment cannot target production Neon branch/);
    });

    it("passes when running in preview environment with a dedicated preview branch", () => {
      process.env["VERCEL_ENV"] = "preview";
      process.env["NEON_BRANCH"] = "preview-pr-42";
      const env = loadEnv();
      expect(env.NEON_BRANCH).toBe("preview-pr-42");
    });
  });

  describe("Terminal PTY disablement in production & non-loopback", () => {
    it("disallows terminal PTY in production", () => {
      process.env["NODE_ENV"] = "production";
      process.env["SWARMX_API_HOST"] = "127.0.0.1";
      delete process.env["VERCEL"];
      expect(isTerminalPtyAllowed()).toBe(false);
    });

    it("disallows terminal PTY on non-loopback binds even in development", () => {
      process.env["NODE_ENV"] = "development";
      process.env["SWARMX_API_HOST"] = "0.0.0.0";
      delete process.env["VERCEL"];
      expect(isTerminalPtyAllowed()).toBe(false);
    });

    it("allows terminal PTY in development on loopback", () => {
      process.env["NODE_ENV"] = "development";
      process.env["SWARMX_API_HOST"] = "127.0.0.1";
      delete process.env["VERCEL"];
      expect(isTerminalPtyAllowed()).toBe(true);
    });
  });

  describe("Audio mastering env defaults", () => {
    it("defaults SWARMX_AUDIO_TARGET_LUFS to -14", () => {
      delete process.env["SWARMX_AUDIO_TARGET_LUFS"];
      const env = loadEnv();
      expect(env.SWARMX_AUDIO_TARGET_LUFS).toBe(-14);
    });
  });
});
