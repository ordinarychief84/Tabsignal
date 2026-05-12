/**
 * Origin / Sec-Fetch-Site enforcement tests. These guard the CSRF
 * helper from regressions — any change to the fail-open vs fail-closed
 * decisions must update these expectations deliberately.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { checkSameOrigin, originGuard, _resetOriginAllowlistForTest } from "../csrf";

// Build a minimal Request stub with header lookup matching the global Request shape.
function reqWith(headers: Record<string, string>): Request {
  const h = new Headers();
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  return new Request("http://localhost:3000/api/test", { method: "POST", headers: h });
}

describe("checkSameOrigin", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://tabcall.example";
    process.env.ALLOWED_ORIGINS = "";
    _resetOriginAllowlistForTest();
  });
  afterEach(() => {
    (process.env as Record<string, string>).NODE_ENV = "test";
    _resetOriginAllowlistForTest();
  });

  test("Sec-Fetch-Site: same-origin → ok", () => {
    expect(checkSameOrigin(reqWith({ "sec-fetch-site": "same-origin" })).ok).toBe(true);
  });

  test("Sec-Fetch-Site: cross-site → rejected", () => {
    const res = checkSameOrigin(reqWith({ "sec-fetch-site": "cross-site" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("BAD_ORIGIN");
  });

  test("Sec-Fetch-Site: none (address bar) → ok", () => {
    expect(checkSameOrigin(reqWith({ "sec-fetch-site": "none" })).ok).toBe(true);
  });

  test("Falls back to Origin header when Sec-Fetch-Site missing", () => {
    expect(checkSameOrigin(reqWith({ origin: "https://tabcall.example" })).ok).toBe(true);
    expect(checkSameOrigin(reqWith({ origin: "https://evil.test" })).ok).toBe(false);
  });

  test("No Origin / Sec-Fetch-Site → MISSING_ORIGIN", () => {
    const res = checkSameOrigin(reqWith({}));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("MISSING_ORIGIN");
  });

  // The allowlist is computed lazily and reset between tests via
  // _resetOriginAllowlistForTest, so APP_URL and ALLOWED_ORIGINS set in
  // beforeEach are honoured per-case.
});

describe("originGuard", () => {
  test("Returns null on same-origin (caller may continue)", () => {
    expect(originGuard(reqWith({ "sec-fetch-site": "same-origin" }))).toBeNull();
  });

  test("Returns 403 on cross-site", () => {
    const r = originGuard(reqWith({ "sec-fetch-site": "cross-site" }));
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
    expect(r!.error).toBe("CSRF_BLOCKED");
  });

  test("MISSING_ORIGIN in dev → fail-open (null)", () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(originGuard(reqWith({}))).toBeNull();
  });

  test("MISSING_ORIGIN in prod → fail-closed (403)", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    const r = originGuard(reqWith({}));
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
  });
});
