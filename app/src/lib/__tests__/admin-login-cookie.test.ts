/**
 * POST /api/admin/login — what the response leaves in the cookie jar.
 *
 * The staff cookie and the admin cookie are separate, and
 * getStaffSession() reads the staff one FIRST. So signing in as a super
 * admin in a browser that still held a venue staff session set the admin
 * cookie, then went on presenting the staff identity: /operator resolved
 * that identity, decided it wasn't an operator, and redirected to /staff.
 * The sign-in reported success and landed nowhere near the console.
 *
 * Signing in here means "I am the platform admin in this browser", so the
 * response must also expire the staff cookie. Pinned because the failure
 * is invisible from the login endpoint's own status code.
 *
 * Only `loginWithPassword` is faked, and the rest of admin-auth is passed
 * through untouched. Mocking `@/lib/db` underneath it doesn't work here:
 * admin-auth captures its `db` import at module load, and bun's registry
 * is process-wide, so whether the mock lands depends on which suite loaded
 * admin-auth first — the test passed alone and 401'd in a full run.
 * Faking the one function at the boundary is order-independent, and what's
 * under test is the route's cookie handling, not bcrypt.
 *
 * The real rate limiter runs: without Upstash it falls back to in-memory,
 * and this file is far under the 10/hour cap.
 */

import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
// Captured before any mock is installed, so the restore below hands back
// the genuine module rather than a stub.
import * as realAdminAuth from "../auth/admin-auth";

const PASSWORD = "correct-horse-battery-staple";

beforeEach(() => {
  mock.module("@/lib/auth/admin-auth", () => ({
    ...realAdminAuth,
    loginWithPassword: async (email: string, password: string) =>
      email === "founder@tab-call.com" && password === PASSWORD
        ? {
            ok: true,
            adminId: "pa_1",
            email,
            token: "signed.admin.jwt",
          }
        : { ok: false, reason: "invalid" },
  }));
});

afterEach(() => { mock.restore(); });

// mock.restore() does NOT undo mock.module, and the registry is shared
// across files — hand the real module back so later suites aren't handed
// this file's stub.
afterAll(() => {
  mock.module("@/lib/auth/admin-auth", () => ({ ...realAdminAuth }));
});

function req(body: unknown) {
  return new Request("https://tab-call.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/login", () => {
  test("sets the admin cookie AND expires the staff cookie", async () => {
    const { POST } = await import("../../app/api/admin/login/route");
    const res = await POST(req({ email: "founder@tab-call.com", password: PASSWORD }));
    expect(res.status).toBe(200);

    const admin = res.cookies.get("tabsignal_admin_session");
    expect(admin?.value).toBeTruthy();

    // The staff cookie is cleared, not merely left alone — maxAge 0 is
    // what tells the browser to drop it.
    const staff = res.cookies.get("tabsignal_session");
    expect(staff).toBeTruthy();
    expect(staff?.value).toBe("");
    expect(staff?.maxAge).toBe(0);
    // Must match the path the staff cookie was set on, or the browser
    // keeps the original and nothing changes.
    expect(staff?.path).toBe("/");
  });

  test("a failed sign-in touches neither cookie", async () => {
    const { POST } = await import("../../app/api/admin/login/route");
    const res = await POST(req({ email: "founder@tab-call.com", password: "wrong-password-here" }));
    expect(res.status).toBe(401);
    expect(res.cookies.get("tabsignal_admin_session")).toBeUndefined();
    // Signing in wrong must not log you out of the session you already had.
    expect(res.cookies.get("tabsignal_session")).toBeUndefined();
  });

  test("an unknown email is refused with the same generic error", async () => {
    const { POST } = await import("../../app/api/admin/login/route");
    const res = await POST(req({ email: "nobody@example.com", password: PASSWORD }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("INVALID_CREDENTIALS");
  });
});
