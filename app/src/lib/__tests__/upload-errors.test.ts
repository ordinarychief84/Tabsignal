/**
 * What an owner is told when a photo won't upload.
 *
 * This exists because of a specific, findable failure. The upload
 * endpoint answers a storage misconfiguration with
 * STORAGE_NOT_CONFIGURED and the detail "Set SUPABASE_SERVICE_ROLE_KEY
 * in env." The editor showed that detail verbatim.
 *
 * So a restaurant owner clicking "Add a photo" on a cocktail saw a
 * developer's instruction about an environment variable they have no
 * access to — and reasonably concluded that TabCall cannot do drink
 * photos. The capability was there the whole time; the error message
 * hid it.
 *
 * The rule these tests hold: anything the OWNER can fix keeps its
 * detail, because "use a JPEG under 4 MB" is advice. Anything only WE
 * can fix becomes a sentence about what happens next, and never leaks
 * the diagnostic.
 */

import { describe, expect, test } from "bun:test";
import { uploadErrorMessage } from "@/lib/upload-errors";

describe("faults the owner can fix keep their advice", () => {
  test("a wrong file type says which types work", () => {
    const msg = uploadErrorMessage({ error: "UNSUPPORTED_TYPE" }, 400);
    expect(msg).toContain("JPG");
    expect(msg).toContain("PNG");
  });

  test("an oversized photo says the limit", () => {
    expect(uploadErrorMessage({ error: "TOO_LARGE" }, 400)).toContain("4 MB");
  });

  test("no file picked says so plainly", () => {
    expect(uploadErrorMessage({ error: "NO_FILE" }, 400).toLowerCase()).toContain("try again");
  });
});

describe("faults only we can fix never leak the diagnostic", () => {
  test("the env-var instruction never reaches the owner", () => {
    // The exact string that caused this.
    const msg = uploadErrorMessage(
      { error: "STORAGE_NOT_CONFIGURED", detail: "Set SUPABASE_SERVICE_ROLE_KEY in env." },
      503,
    );
    expect(msg).not.toContain("SUPABASE");
    expect(msg).not.toContain("env");
    expect(msg).not.toContain("SERVICE_ROLE");
  });

  test("it tells them what still works, so they don't stop entering the menu", () => {
    const msg = uploadErrorMessage({ error: "STORAGE_NOT_CONFIGURED" }, 503);
    expect(msg.toLowerCase()).toContain("everything else");
  });

  test("an unmapped 5xx is treated as ours", () => {
    const msg = uploadErrorMessage({ error: "SOMETHING_NEW", detail: "stack trace here" }, 500);
    expect(msg).not.toContain("stack trace");
    expect(msg.toLowerCase()).toContain("try again");
  });

  test("config-shaped detail is caught even under an unmapped code", () => {
    // Defence in depth: a new error code shouldn't be able to
    // reintroduce the original bug just by carrying the same detail.
    for (const detail of [
      "Missing SUPABASE_SERVICE_ROLE_KEY",
      "Set the API key in env",
      "invalid service_role token",
    ]) {
      const msg = uploadErrorMessage({ error: "UNKNOWN_CODE", detail }, 400);
      expect(msg).not.toContain("SUPABASE");
      expect(msg).not.toContain("API key");
      expect(msg).not.toContain("token");
    }
  });
});

describe("it always says something", () => {
  test("an empty or missing body still produces a sentence", () => {
    for (const body of [null, undefined, {}, { error: 123 }]) {
      const msg = uploadErrorMessage(body as never, 400);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toBe("undefined");
    }
  });

  test("nothing it can return is a bare code", () => {
    // "UNSUPPORTED_TYPE" on screen is as useless as the env instruction.
    for (const code of [
      "UNSUPPORTED_TYPE",
      "TOO_LARGE",
      "NO_FILE",
      "INVALID_FORM",
      "STORAGE_NOT_CONFIGURED",
      "UPLOAD_FAILED",
      "MADE_UP",
    ]) {
      const msg = uploadErrorMessage({ error: code }, 400);
      expect(msg).not.toBe(code);
      expect(msg).not.toMatch(/^[A-Z_]+$/);
      // Real sentences, for a person mid-task.
      expect(msg).toMatch(/[a-z]/);
    }
  });
});
