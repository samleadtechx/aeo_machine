import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { devFallbackEnv } from "@/lib/env";

const PREFIX = "aesgcm:v1:";

function encryptionKey() {
  const encoded = devFallbackEnv(
    "APP_ENCRYPTION_KEY",
    "QmtB2HlrYFna8IclAZjGOT5t6FxxM2qYVR4sW9fdkg8="
  );
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be base64 for exactly 32 bytes");
  }
  return key;
}

export function encryptSecret(value: string | null | undefined) {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) {
    throw new Error("Unsupported encrypted secret format");
  }
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function maskSecret(value: string | null | undefined) {
  if (!value) return "";
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

export function encryptJson(value: unknown) {
  return encryptSecret(JSON.stringify(value ?? {}));
}

export function decryptJson<T>(value: string | null | undefined, fallback: T): T {
  const decrypted = decryptSecret(value);
  if (!decrypted) return fallback;
  return JSON.parse(decrypted) as T;
}
