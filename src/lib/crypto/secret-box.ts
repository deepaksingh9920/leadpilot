import "server-only";

import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for provider credentials at rest.
 *
 * The key comes from `INTEGRATION_ENCRYPTION_KEY` and is never stored in the
 * database. Every ciphertext is bound to its tenant and provider with
 * authenticated additional data, so copying a row to another workspace (or
 * renaming its provider) makes decryption fail instead of silently working.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const SALT = "leadpilot.integration-credentials.v1";
const MIN_PASSPHRASE_LENGTH = 32;

const derivedKeys = new Map<string, Buffer>();

export function isEncryptionKeyConfigured(raw: string | undefined | null): boolean {
  return typeof raw === "string" && raw.trim().length >= MIN_PASSPHRASE_LENGTH;
}

/**
 * Accepts a 32-byte base64url key, a 64-character hex key, or a passphrase of
 * at least 32 characters. Passphrases are stretched with scrypt so an
 * operator-supplied sentence is still usable without becoming a weak key.
 */
export function deriveEncryptionKey(raw: string): Buffer {
  const value = raw.trim();
  if (value.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      `INTEGRATION_ENCRYPTION_KEY must be at least ${MIN_PASSPHRASE_LENGTH} characters.`,
    );
  }

  const cached = derivedKeys.get(value);
  if (cached) return cached;

  let key: Buffer;
  if (/^[A-Za-z0-9_-]{43}$/.test(value)) {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length === KEY_BYTES) {
      key = decoded;
    } else {
      key = scryptSync(value, SALT, KEY_BYTES);
    }
  } else if (/^[a-fA-F0-9]{64}$/.test(value)) {
    key = Buffer.from(value, "hex");
  } else {
    key = scryptSync(value, SALT, KEY_BYTES);
  }

  derivedKeys.set(value, key);
  return key;
}

export function encryptSecret(plaintext: string, context: string, rawKey: string): string {
  const key = deriveEncryptionKey(rawKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export type DecryptResult =
  | { ok: true; value: string }
  | { ok: false; reason: "MALFORMED" | "UNSUPPORTED" | "AUTHENTICATION_FAILED" };

export function decryptSecret(
  payload: string,
  context: string,
  rawKey: string,
): DecryptResult {
  const parts = payload.split(".");
  if (parts.length !== 4) {
    return { ok: false, reason: "MALFORMED" };
  }
  if (parts[0] !== VERSION) {
    return { ok: false, reason: "UNSUPPORTED" };
  }

  try {
    const key = deriveEncryptionKey(rawKey);
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    if (iv.length !== IV_BYTES || tag.length !== 16) {
      return { ok: false, reason: "MALFORMED" };
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return { ok: true, value: plaintext.toString("utf8") };
  } catch {
    // GCM authentication failures and malformed base64 both land here. Do not
    // distinguish them to the caller beyond a generic failure.
    return { ok: false, reason: "AUTHENTICATION_FAILED" };
  }
}
