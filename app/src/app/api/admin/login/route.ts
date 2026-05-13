import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  loginWithPassword,
} from "@/lib/auth/admin-auth";
import { rateLimitAsync } from "@/lib/rate-limit";

/**
 * Password sign-in for the TabCall super-admin console.
 *
 * Rate-limit: 10/hour per email AND 30/hour per IP. Both via the shared
 * Upstash-backed limiter so the cap holds across Vercel cold starts.
 *
 * Response shape is identical for unknown-email, wrong-password, and
 * no-password-set so attackers can't probe which platform admins exist.
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
  return res;
}
