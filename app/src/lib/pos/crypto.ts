/**
 * AES-256-GCM credential encryption for `PosIntegration.encryptedCredentials`.
 *
 * Key derivation:
 *   The symmetric key is the SHA-256 of `NEXTAUTH_SECRET` mixed with a
 *   constant domain-separator string. Reusing `NEXTAUTH_SECRET` keeps the
 *   number of master secrets we ship in env to one — rotating NextAuth
 *   automatically rotates POS encryption — and SHA-256 makes the resulting
 *   key length-correct (32 bytes) regardless of the source secret's length.
 *   The domain-separator prevents the same key being used for any other
 *   purpose (cookie signing, etc.) — same secret material, different key.
 *
 * Wire format (single string for the DB column):
 *   "v1:<base64 iv>:<base64 authTag>:<base64 ciphertext>"
 *
 * Why GCM: authenticated encryption — tampering with the ciphertext fails
 * decryption rather than producing garbled plaintext that downstream code
 * happily forwards to a vendor API.
 *
 * Server-only. Importing this in a "use client" module is a security bug.
 */

import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length
const KEY_DOMAIN = "pos-credentials-v1";

function deriveKey(): Buffer {
  const secret = env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    // Should have been caught by env.ts; defensive check so we never
    // silently fall back to a weak key derived from "".
    throw new Error("NEXTAUTH_SECRET missing or too short — refusing to derive POS encryption key");
  }
  return createHash("sha256").update(`${KEY_DOMAIN}:${secret}`).digest();
}

export function encryptCredentials(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new TypeError("encryptCredentials expects a string");
  }
  const key = deriveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

export function decryptCredentials(ciphertext: string): string {
  if (typeof ciphertext !== "string" || !ciphertext) {
    throw new TypeError("decryptCredentials expects a non-empty string");
  }
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Invalid POS credential ciphertext (version/format mismatch)");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = deriveKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}
