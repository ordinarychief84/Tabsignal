import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  loginWithPassword,
} from "@/lib/auth/admin-auth";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { rateLimitAsync } from "@/lib/rate-limit";

/**
 * Password sign-in for the TabCall super-admin console.
 *
 * Rate-limit: 10/hour per email AND 30/hour per IP. Both via the shared
 * Upstash-backed limiter so the cap holds across Vercel cold starts.
 *
 * Response shape is identical for unknown-email, wrong-password, and
 * no-password-set so attackers can't probe which platform admins exist.
 *
 * On success this also CLEARS the staff session cookie. The two cookies
 * are separate, and `getStaffSession()` reads the staff one first — so a
 * browser still holding a venue staff session would keep presenting that
 * identity even after a super admin signed in here. The visible symptom
 * was a sign-in that appeared to work and then landed on the staff live
 * queue: /operator resolved the staff session, found that email wasn't an
 * operator, and redirected to /staff. Signing in as the platform admin
 * means "I am the platform admin in this browser" — the other identity
 * goes, the same way any account switch works.
 */

const Body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const email = parsed.email.toLowerCase().trim();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const emailGate = await rateLimitAsync(`admin-login:email:${email}`, {
    windowMs: 60 * 60_000,
    max: 10,
  });
  const ipGate = await rateLimitAsync(`admin-login:ip:${ip}`, {
    windowMs: 60 * 60_000,
    max: 30,
  });
  if (!emailGate.ok || !ipGate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: emailGate.retryAfterMs ?? ipGate.retryAfterMs },
      { status: 429 },
    );
  }

  const result = await loginWithPassword(email, parsed.password);
  if (!result.ok) {
    // Same generic error regardless of reason — no enumeration.
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, email: result.email });
  res.cookies.set(ADMIN_SESSION_COOKIE, result.token, adminSessionCookieOptions());
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
