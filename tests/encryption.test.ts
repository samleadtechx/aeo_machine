import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto/encryption";

describe("secret encryption", () => {
  it("round trips values with AES-GCM", () => {
    const encrypted = encryptSecret("sftp-password")!;
    expect(encrypted).toMatch(/^aesgcm:v1:/);
    expect(decryptSecret(encrypted)).toBe("sftp-password");
  });

  it("masks values without exposing full content", () => {
    expect(maskSecret("abcdef")).toBe("****cdef");
  });
});
