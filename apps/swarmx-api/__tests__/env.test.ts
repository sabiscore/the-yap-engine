import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadEnv, resetEnvForTesting } from "../src/lib/env.js";

describe("env.ts port parsing (Gate A5)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetEnvForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvForTesting();
  });

  it("defaults to 3001 when SWARMX_API_PORT is unset", () => {
    delete process.env["SWARMX_API_PORT"];
    delete process.env["PORT"];
    const env = loadEnv();
    expect(env.SWARMX_API_PORT).toBe(3001);
  });

  it("resolves quoted template \"${PORT:-3001}\" when PORT is unset", () => {
    process.env["SWARMX_API_PORT"] = '"${PORT:-3001}"';
    delete process.env["PORT"];
    const env = loadEnv();
    expect(env.SWARMX_API_PORT).toBe(3001);
  });

  it("resolves unquoted template ${PORT:-3001} when PORT is unset", () => {
    process.env["SWARMX_API_PORT"] = "${PORT:-3001}";
    delete process.env["PORT"];
    const env = loadEnv();
    expect(env.SWARMX_API_PORT).toBe(3001);
  });

  it("resolves quoted template \"${PORT:-3001}\" to PORT value when PORT is set", () => {
    process.env["SWARMX_API_PORT"] = '"${PORT:-3001}"';
    process.env["PORT"] = "8080";
    const env = loadEnv();
    expect(env.SWARMX_API_PORT).toBe(8080);
  });

  it("resolves custom fallback port from template ${PORT:-4200}", () => {
    process.env["SWARMX_API_PORT"] = "${PORT:-4200}";
    delete process.env["PORT"];
    const env = loadEnv();
    expect(env.SWARMX_API_PORT).toBe(4200);
  });

  it("parses numeric string port correctly", () => {
    process.env["SWARMX_API_PORT"] = "5050";
    const env = loadEnv();
    expect(env.SWARMX_API_PORT).toBe(5050);
  });

  it("fallbacks to 3001 when SWARMX_API_PORT is empty or invalid string", () => {
    process.env["SWARMX_API_PORT"] = "";
    delete process.env["PORT"];
    const env = loadEnv();
    expect(env.SWARMX_API_PORT).toBe(3001);
  });
});
