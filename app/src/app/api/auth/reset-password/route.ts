import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitAsync } from "@/lib/rate-limit";
import { consumeResetToken } from "@/lib/auth/password-reset";
import { hashStaffPassword } from "@/lib/auth/staff-password";

/**
 * POST /api/auth/reset-password
 *
 * Public, unauthenticated endpoint (the token IS the credential).
 * Accepts a reset token + new password; verifies + consumes the token
 * atomically, hashes the new password with bcrypt(12), and bumps
 * `sessionsValidAfter` so any cached JWT on the user's other devices
 * is rejected immediately. Doesn't mint a new session — the user
 * signs in via /login afterwards (standard "you changed your password,
 * please log back in" UX).
 *
 * Password rules match the signup form: min 12 chars. Same rule as
 * /api/auth/set-password.
 */

const Body = z.object({
  token: z.string().min(1).max(200),
  // Cap MUST match hashStaffPassword's MAX_PASSWORD_LENGTH (128). When this
  // allowed up to 200, a 129–200 char password passed Zod but then threw
  // inside hashStaffPassword below (which isn't wrapped in try/catch),
  // surfacing as an opaque 500 instead of a clean 400. Keep the two in lockstep.
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128, "Password must be at most 128 characters"),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    const detail = err instanceof z.ZodError
      ? err.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ")
      : "unparsable JSON";
    return NextResponse.json({ error: "INVALID_BODY", detail }, { status: 400 });
  }

  // Throttle to block guessing. Tokens are 256-bit random so guessing
  // is infeasible, but a misbehaving client retrying a stale token
  // should be cut off cleanly.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const gate = await rateLimitAsync(`pwreset-consume:ip:${ip}`, {
    windowMs: 60 * 60_000,
    max: 30,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: gate.retryAfterMs },
      { status: 429 },
    );
  }

  const consumed = await consumeResetToken(parsed.token);
  if (!consumed.ok) {
    // Map all three failure modes (invalid / expired / used) to the
    // same generic 400 — the form just shows "this link doesn't work,
    // ask for a new one". Surfacing "used" specifically would leak
    // whether the URL was someone else's.
    return NextResponse.json(
      { error: "INVALID_OR_EXPIRED_TOKEN" },
      { status: 400 },
    );
  }

  const passwordHash = await hashStaffPassword(parsed.password);
  const now = new Date();

  // Look up whether emailVerifiedAt is null so we only stamp it on
  // first reset (don't overwrite the original verification date).
  const existing = await db.staffMember.findUnique({
    where: { id: consumed.staffId },
    select: { emailVerifiedAt: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "INVALID_OR_EXPIRED_TOKEN" }, { status: 400 });
  }
  // Defensive: a SUSPENDED/DELETED user shouldn't be able to reset
  // back into the system. The forgot-password handler already blocks
  // these at issue time, but check again at consume time in case the
  // status changed between issuance and use.
  if (existing.status !== "ACTIVE") {
    return NextResponse.json({ error: "INVALID_OR_EXPIRED_TOKEN" }, { status: 400 });
  }

  await db.staffMember.update({
    where: { id: consumed.staffId },
    data: {
      passwordHash,
      passwordChangedAt: now,
      // Invalidate every JWT minted before now. The user must log back
      // in on every device they were signed into.
      sessionsValidAfter: now,
      // First-time reset doubles as email verification — they proved
      // ownership by receiving the reset email. Don't overwrite an
      // existing verification stamp.
      ...(existing.emailVerifiedAt ? {} : { emailVerifiedAt: now }),
    },
  });

  return NextResponse.json({ ok: true });
}
