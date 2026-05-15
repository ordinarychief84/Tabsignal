import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/admin-auth";
import { rateLimitAsync } from "@/lib/rate-limit";

/**
 * POST /api/admin/account/password
 *
 * Lets a signed-in super admin rotate their password.
 *
 * Security model:
 *   1. Caller must already have a valid admin session (getAdminSession).
 *   2. Caller must prove current-password ownership — protects against
 *      session-hijack scenarios where an attacker has the cookie but
 *      not the password.
 *   3. New password must differ from current. Reuse defeats the point.
 *   4. The PlatformAdmin row's passwordChangedAt is bumped — every
 *      existing admin JWT minted before this timestamp (including the
 *      caller's current one) is invalidated on next request.
 *   5. Cookie is cleared in the response so the caller MUST sign in
 *      again with the new password. Standard "all sessions invalidated"
 *      flow.
 *
 * Rate-limit: 5/hour per admin to slow current-password brute force
 * via stolen-cookie scenarios. IP gate too.
 */

const Body = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(128),
});

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    const detail = e instanceof z.ZodError
      ? e.errors.map(x => `${x.path.join(".") || "body"}: ${x.message}`).join("; ")
      : "";
    return NextResponse.json({ error: "INVALID_BODY", detail }, { status: 400 });
  }

  if (parsed.currentPassword === parsed.newPassword) {
    return NextResponse.json(
      { error: "SAME_PASSWORD", detail: "New password must differ from current." },
      { status: 400 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const adminGate = await rateLimitAsync(`admin-password:admin:${session.adminId}`, {
    windowMs: 60 * 60_000,
    max: 5,
  });
  const ipGate = await rateLimitAsync(`admin-password:ip:${ip}`, {
    windowMs: 60 * 60_000,
    max: 20,
  });
  if (!adminGate.ok || !ipGate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: adminGate.retryAfterMs ?? ipGate.retryAfterMs },
      { status: 429 },
    );
  }

  const admin = await db.platformAdmin.findUnique({
    where: { id: session.adminId },
    select: { id: true, passwordHash: true, suspendedAt: true },
  });
  if (!admin || admin.suspendedAt) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!admin.passwordHash) {
    return NextResponse.json({ error: "NO_PASSWORD_SET" }, { status: 400 });
  }

  const ok = await verifyPassword(parsed.currentPassword, admin.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: "INVALID_CURRENT_PASSWORD" },
      { status: 401 },
    );
  }

  let newHash: string;
  try {
    newHash = await hashPassword(parsed.newPassword);
  } catch (err) {
    return NextResponse.json(
      { error: "INVALID_NEW_PASSWORD", detail: err instanceof Error ? err.message : "" },
      { status: 400 },
    );
  }

  await db.platformAdmin.update({
    where: { id: admin.id },
    data: {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
    },
  });

  // Invalidate every existing admin JWT, including this caller's. The
  // page-side flow then bounces them to /admin/login to sign in with
  // the new password.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return res;
}
