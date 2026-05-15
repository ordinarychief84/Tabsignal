import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { loginStaffWithPassword } from "@/lib/auth/staff-password";
import { signSessionToken } from "@/lib/auth/token";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { rateLimitAsync } from "@/lib/rate-limit";

/**
 * POST /api/auth/login
 *
 * Email + password sign-in for StaffMember rows. Magic-link via
 * /api/auth/start remains the default and continues to work
 * unchanged for accounts that haven't set a password.
 *
 * Same generic INVALID_CREDENTIALS error for unknown-email, wrong-
 * password, and no-password-set so callers can't probe registration
 * state. Unverified-email surfaces explicitly so the UI can offer
 * "resend verification link."
 *
 * Rate-limit: 10/hr per email, 30/hr per IP. Same shape as the
 * PlatformAdmin login route.
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

  const emailGate = await rateLimitAsync(`staff-login:email:${email}`, {
    windowMs: 60 * 60_000,
    max: 10,
  });
  const ipGate = await rateLimitAsync(`staff-login:ip:${ip}`, {
    windowMs: 60 * 60_000,
    max: 30,
  });
  if (!emailGate.ok || !ipGate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: emailGate.retryAfterMs ?? ipGate.retryAfterMs },
      { status: 429 },
    );
  }

  const result = await loginStaffWithPassword(email, parsed.password);
  if (!result.ok) {
    // Surface UNVERIFIED specifically so the UI can offer a one-click
    // "resend verification link". Every other failure mode collapses
    // to INVALID_CREDENTIALS to avoid enumeration.
    if (result.reason === "unverified") {
      return NextResponse.json({ error: "EMAIL_UNVERIFIED" }, { status: 401 });
    }
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  // Mint the same session JWT the magic-link callback issues so every
  // downstream gate works without branching. lastSeenAt bump is
  // best-effort.
  const token = await signSessionToken({
    kind: "session",
    staffId: result.staff.id,
    venueId: result.staff.venueId,
    email: result.staff.email,
    role: result.staff.role as "OWNER" | "MANAGER" | "SERVER" | "HOST" | "VIEWER" | "STAFF",
  });
  await db.staffMember
    .update({ where: { id: result.staff.id }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);

  const res = NextResponse.json({ ok: true, email: result.staff.email });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
