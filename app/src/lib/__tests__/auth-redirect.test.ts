/**
 * Tests for the redirect helpers used by /api/auth/callback (and reused
 * by any future post-auth landing logic). These cover the open-redirect
 * surface: every accepted shape, every rejected shape, plus the dev /
 * forwarded-host origin resolution.
 */

import { describe, expect, test } from "bun:test";
import { originFromRequest, safeNext } from "../auth/redirect";

describe("safeNext", () => {
  test("returns defaultDest when next is missing", () => {
    expect(safeNext(undefined)).toBe("/staff");
    expect(safeNext(null)).toBe("/staff");
    expect(safeNext("")).toBe("/staff");
  });

  test("returns defaultDest when next is not a string (defensive)", () => {
    // `as unknown` lets us probe the runtime guard. Tokens are decoded JSON
    // and Zod doesn't gate them, so a malformed token could carry a number
    // or boolean in `next`.
    expect(safeNext(123 as unknown as string)).toBe("/staff");
    expect(safeNext(true as unknown as string)).toBe("/staff");
  });

  test("accepts same-origin paths", () => {
    expect(safeNext("/admin/v/foo")).toBe("/admin/v/foo");
    expect(safeNext("/admin/v/foo/onboarding")).toBe("/admin/v/foo/onboarding");
    expect(safeNext("/operator")).toBe("/operator");
    expect(safeNext("/staff?tab=delayed")).toBe("/staff?tab=delayed");
    expect(safeNext("/admin/v/x#section")).toBe("/admin/v/x#section");
  });

  test("rejects absolute URLs", () => {
    expect(safeNext("https://evil.com/")).toBe("/staff");
    expect(safeNext("http://evil.com/admin")).toBe("/staff");
  });

  test("rejects protocol-relative URLs", () => {
    expect(safeNext("//evil.com/admin")).toBe("/staff");
    expect(safeNext("//evil.com")).toBe("/staff");
  });

  test("rejects backslash-host injection", () => {
    // Modern browsers treat `/\` as a protocol-relative path separator.
    expect(safeNext("/\\evil.com")).toBe("/staff");
    expect(safeNext("/\\\\evil.com/path")).toBe("/staff");
  });

  test("rejects javascript: and data: schemes (defensive)", () => {
    expect(safeNext("/javascript:alert(1)")).toBe("/staff");
    expect(safeNext("/JAVASCRIPT:alert(1)")).toBe("/staff");
    expect(safeNext("/data:text/html,<script>")).toBe("/staff");
  });

  test("rejects paths without a leading slash", () => {
    expect(safeNext("admin")).toBe("/staff");
    expect(safeNext("evil.com")).toBe("/staff");
  });

  test("honours custom defaultDest for operators", () => {
    expect(safeNext(undefined, "/operator")).toBe("/operator");
    expect(safeNext("//evil.com", "/operator")).toBe("/operator");
    expect(safeNext("/admin/v/foo", "/operator")).toBe("/admin/v/foo");
  });
});

describe("originFromRequest", () => {
  function req(headers: Record<string, string>): Request {
    return new Request("http://0.0.0.0:3000/api/auth/callback?token=x", {
      headers,
    });
  }

  test("trusts x-forwarded-host + x-forwarded-proto", () => {
    const r = req({
      "x-forwarded-host": "tab-call.com",
      "x-forwarded-proto": "https",
    });
    expect(originFromRequest(r)).toBe("https://tab-call.com");
  });

  test("falls back to Host header when forwarded headers absent", () => {
    const r = req({ host: "tab-call.com" });
    // Production-shape host (non-localhost, non-IP-prefixed) defaults to https
    expect(originFromRequest(r)).toBe("https://tab-call.com");
  });

  test("defaults to http for localhost", () => {
    const r = req({ host: "localhost:3000" });
    expect(originFromRequest(r)).toBe("http://localhost:3000");
  });

  test("defaults to http for IP-prefixed hosts (dev / 0.0.0.0)", () => {
    const r = req({ host: "0.0.0.0:3000" });
    expect(originFromRequest(r)).toBe("http://0.0.0.0:3000");
    const r2 = req({ host: "192.168.1.10:3000" });
    expect(originFromRequest(r2)).toBe("http://192.168.1.10:3000");
  });

  test("x-forwarded-host wins over host", () => {
    const r = req({
      "x-forwarded-host": "tab-call.com",
      host: "internal.vercel.app",
      "x-forwarded-proto": "https",
    });
    expect(originFromRequest(r)).toBe("https://tab-call.com");
  });

  test("falls back to APP_URL env when no host headers present", () => {
    const prev = process.env.APP_URL;
    process.env.APP_URL = "https://staging.tab-call.com";
    try {
      const r = new Request("http://0.0.0.0:3000/api/auth/callback");
      expect(originFromRequest(r)).toBe("https://staging.tab-call.com");
    } finally {
      if (prev === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prev;
    }
  });

  test("falls back to localhost when neither host headers nor APP_URL present", () => {
    const prev = process.env.APP_URL;
    delete process.env.APP_URL;
    try {
      const r = new Request("http://0.0.0.0:3000/api/auth/callback");
      expect(originFromRequest(r)).toBe("http://localhost:3000");
    } finally {
      if (prev !== undefined) process.env.APP_URL = prev;
    }
  });
});
