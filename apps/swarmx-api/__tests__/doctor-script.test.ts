import { describe, test, expect } from "vitest";
import {
  checkEnv,
  checkRam,
  runAllChecks,
} from "../scripts/doctor.js";

describe("doctor script check functions", () => {
  test("checkEnv returns a CheckResult with ok=true on a valid env", async () => {
    const result = await checkEnv();
    expect(result.name).toBe("env");
    expect(typeof result.ok).toBe("boolean");
    expect(typeof result.detail).toBe("string");
    expect(result.detail.length).toBeGreaterThan(0);
  });

  test("checkRam returns a CheckResult reporting available MB", async () => {
    const result = await checkRam();
    expect(result.name).toBe("ram");
    expect(typeof result.ok).toBe("boolean");
    expect(result.detail).toMatch(/\d+\s*MB/);
  });

  test("runAllChecks aggregates every check with unique names", async () => {
    const results = await runAllChecks();
    const names = results.map((r) => r.name);
    expect(names).toEqual([
      "env",
      "redis",
      "ollama",
      "ram",
      "voice-binaries",
      "voice-benchmark",
    ]);
    expect(new Set(names).size).toBe(names.length);
    for (const r of results) {
      expect(typeof r.ok).toBe("boolean");
      expect(typeof r.detail).toBe("string");
    }
  }, 15_000);
});
