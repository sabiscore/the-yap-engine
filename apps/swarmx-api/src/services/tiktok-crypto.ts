import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { loadEnv } from "../lib/env.js";

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function encryptionKey(): Buffer {
  const encoded = process.env["SWARMX_TIKTOK_TOKEN_ENCRYPTION_KEY"]?.trim() ?? "";
  if (!encoded) {
    throw new Error("SWARMX_TIKTOK_TOKEN_ENCRYPTION_KEY is required for durable TikTok tokens");
  }

  let key: Buffer;
  try {
    key = Buffer.from(encoded, "base64");
  } catch {
    throw new Error("SWARMX_TIKTOK_TOKEN_ENCRYPTION_KEY must be base64-encoded");
  }

  if (key.length !== KEY_BYTES) {
    throw new Error("SWARMX_TIKTOK_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }

  return key;
}

export function encryptTikTokToken(token: string): string {
  if (!token) throw new Error("Cannot encrypt an empty TikTok token");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptTikTokToken(payload: string): string {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = payload.split(".");
  if (version !== VERSION || !ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new Error("Invalid TikTok token ciphertext format");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivEncoded, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("TikTok token decryption failed");
  }
}

export function assertTikTokTokenEncryptionConfigured(): void {
  if (loadEnv().NODE_ENV === "production") {
    void encryptionKey();
  }
}
