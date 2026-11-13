import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decryptSecret, deriveEncryptionKey, encryptSecret } from "@/lib/crypto/secret-box";

const KEY = randomBytes(32).toString("base64url");
const CONTEXT = "ws_test:AI";

describe("secret box", () => {
  it("round-trips a secret and produces a versioned, non-plaintext payload", () => {
    const plaintext = JSON.stringify({ apiKey: "sk-live-super-secret", model: "gpt-4.1-mini" });

    const payload = encryptSecret(plaintext, CONTEXT, KEY);

    expect(payload.startsWith("v1.")).toBe(true);
    expect(payload).not.toContain("sk-live-super-secret");
    expect(payload).not.toContain("gpt-4.1-mini");

    const decrypted = decryptSecret(payload, CONTEXT, KEY);
    expect(decrypted).toEqual({ ok: true, value: plaintext });
  });

  it("uses a fresh IV so identical plaintext never repeats ciphertext", () => {
    const plaintext = "same-secret";
    expect(encryptSecret(plaintext, CONTEXT, KEY)).not.toBe(
      encryptSecret(plaintext, CONTEXT, KEY),
    );
  });

  it("rejects tampered ciphertext", () => {
    const payload = encryptSecret("tamper-me", CONTEXT, KEY);
    const parts = payload.split(".");
    const bytes = Buffer.from(parts[3], "base64url");
    bytes[0] ^= 0xff;
    parts[3] = bytes.toString("base64url");

    const result = decryptSecret(parts.join("."), CONTEXT, KEY);
    expect(result.ok).toBe(false);
  });

  it("rejects a payload sealed for a different workspace or provider", () => {
    const payload = encryptSecret("tenant-bound", CONTEXT, KEY);

    expect(decryptSecret(payload, "ws_other:AI", KEY).ok).toBe(false);
    expect(decryptSecret(payload, "ws_test:EMAIL", KEY).ok).toBe(false);
  });

  it("rejects a different encryption key", () => {
    const payload = encryptSecret("key-bound", CONTEXT, KEY);
    const otherKey = randomBytes(32).toString("base64url");

    expect(decryptSecret(payload, CONTEXT, otherKey).ok).toBe(false);
  });

  it("rejects a malformed or unsupported payload", () => {
    expect(decryptSecret("not-a-payload", CONTEXT, KEY)).toEqual({
      ok: false,
      reason: "MALFORMED",
    });
    expect(decryptSecret("v2.a.b.c", CONTEXT, KEY)).toEqual({
      ok: false,
      reason: "UNSUPPORTED",
    });
  });

  it("refuses short keys instead of stretching a weak value", () => {
    expect(() => deriveEncryptionKey("too-short")).toThrow(
      /at least 32 characters/,
    );
  });

  it("accepts base64url, hex, and long passphrase keys", () => {
    const hex = randomBytes(32).toString("hex");
    const passphrase = "this is a long operator passphrase for tests";

    for (const key of [KEY, hex, passphrase]) {
      const payload = encryptSecret("value", CONTEXT, key);
      expect(decryptSecret(payload, CONTEXT, key)).toEqual({
        ok: true,
        value: "value",
      });
    }
  });
});
