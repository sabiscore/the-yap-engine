import { describe, expect, it, afterEach } from "vitest";
import { encryptTikTokToken, decryptTikTokToken } from "../src/services/tiktok-crypto.js";

describe("TikTok token encryption", () => {
  const previous = process.env.SWARMX_TIKTOK_TOKEN_ENCRYPTION_KEY;
  afterEach(() => {
    if (previous === undefined) delete process.env.SWARMX_TIKTOK_TOKEN_ENCRYPTION_KEY;
    else process.env.SWARMX_TIKTOK_TOKEN_ENCRYPTION_KEY = previous;
  });

  it("encrypts and decrypts with a 32-byte key and does not retain plaintext", () => {
    process.env.SWARMX_TIKTOK_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const ciphertext = encryptTikTokToken("access-secret-value");
    expect(ciphertext).not.toContain("access-secret-value");
    expect(decryptTikTokToken(ciphertext)).toBe("access-secret-value");
  });
});
