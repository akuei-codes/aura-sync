// Symmetric encryption for Spotify tokens stored in DB.
// AES-256-GCM with key derived from SESSION_SECRET via SHA-256.
// Output format: base64(iv) + ":" + base64(ciphertext+authTag)

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be at least 32 characters. Generate with `openssl rand -hex 32`.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${Buffer.concat([enc, tag]).toString("base64")}`;
}

export function decrypt(payload: string): string {
  const [ivB64, dataB64] = payload.split(":");
  if (!ivB64 || !dataB64) throw new Error("Invalid ciphertext format");
  const iv = Buffer.from(ivB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const tag = data.subarray(data.length - 16);
  const enc = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
