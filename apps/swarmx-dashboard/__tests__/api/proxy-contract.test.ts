import { describe, expect, it } from "vitest";
import { isAllowedPath, isLoopbackUrl } from "@/app/api/[...path]/route";

describe("dashboard proxy contract", () => {
  it("allows only dashboard API namespaces", () => {
    expect(isAllowedPath("/api/video/jobs")).toBe(true);
    expect(isAllowedPath("/api/system/health")).toBe(true);
    expect(isAllowedPath("/api/admin/secrets")).toBe(false);
    expect(isAllowedPath("/api/../../etc/passwd")).toBe(false);
  });

  it("recognises loopback upstreams", () => {
    expect(isLoopbackUrl("http://127.0.0.1:3001")).toBe(true);
    expect(isLoopbackUrl("http://localhost:3001")).toBe(true);
    expect(isLoopbackUrl("https://api.example.com")).toBe(false);
  });
});
