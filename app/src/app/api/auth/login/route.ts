import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { loginStaffWithPassword } from "@/lib/auth/staff-password";
import { signSessionToken } from "@/lib/auth/token";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { rateLimitAsync } from "@/lib/rate-limit";
import { isPlatformStaffAsync } from "@/lib/auth/operator";
import { safeNext } from "@/lib/auth/redirect";

/**
 * POST /api/auth/login
 *
 * Email + password sign-in for StaffMember rows — the way into a venue
 * account. /api/auth/start still exists, but only to confirm an email
 * address or carry a staff invite; it is not a way to sign in.
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
  // Where the caller was headed before being bounced here. Passed through
  // safeNext, which rejects protocol-relative hosts and javascript:/data:
  // schemes — an open redirect on the sign-in endpoint would hand any
  // phisher a tab-call.com link that lands on their page WITH the user
  // freshly authenticated.
  next: z.string().max(512).optional(),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    // Surface Zod field paths so a stuck client can fix the bad field
    // and ops can root-cause "all logins 400ing" incidents from logs.
    const detail = err instanceof z.ZodError
      ? err.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ")
      : "unparsable JSON";
    return NextResponse.json({ error: "INVALID_BODY", detail }, { status: 400 });
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

  // Where to land. An explicit `next` wins; otherwise operators go to the
  // platform console and everyone else to the floor — the same choice
  // /api/auth/callback makes, so both ways in agree. Deciding it here
  // rather than in the form means the client never has to know who is an
  // operator.
  const operator = await isPlatformStaffAsync({
    kind: "session",
    staffId: result.staff.id,
    venueId: result.staff.venueId,
    email: result.staff.email,
    role: result.staff.role as "OWNER" | "MANAGER" | "SERVER" | "HOST" | "VIEWER" | "STAFF",
  });
  const next = safeNext(parsed.next, operator ? "/operator" : "/staff");

  const res = NextResponse.json({ ok: true, email: result.staff.email, next });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
