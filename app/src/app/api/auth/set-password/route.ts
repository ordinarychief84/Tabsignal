import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { hashStaffPassword, verifyStaffPassword } from "@/lib/auth/staff-password";
import { rateLimitAsync } from "@/lib/rate-limit";

/**
 * POST /api/auth/set-password
 *
 * First-time password setup OR rotation for a signed-in staff member.
 *
 *  - First-time: row.passwordHash is null → no currentPassword required.
 *  - Rotation: row.passwordHash is set → currentPassword required and
 *    must match.
 *
 * Bumps passwordChangedAt so any existing session JWT minted before
 * this change is invalidated on the next request (sessionsValidAfter
 * pattern, which getStaffSession already checks).
 *
 * Rate-limit: 5/hr per staff for the rotation path (slows brute force
 * via stolen-cookie scenarios). 20/hr per IP.
 */

const Body = z.object({
  currentPassword: z.string().min(1).max(200).optional(),
  newPassword: z.string().min(12).max(128),
});

export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    const detail = e instanceof z.ZodError
      ? e.errors.map(x => `${x.path.join(".") || "body"}: ${x.message}`).join("; ")
      : "";
    return NextResponse.json({ error: "INVALID_BODY", detail }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const staffGate = await rateLimitAsync(`staff-set-pw:staff:${session.staffId}`, {
    windowMs: 60 * 60_000,
    max: 5,
  });
  const ipGate = await rateLimitAsync(`staff-set-pw:ip:${ip}`, {
    windowMs: 60 * 60_000,
    max: 20,
  });
  if (!staffGate.ok || !ipGate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: staffGate.retryAfterMs ?? ipGate.retryAfterMs },
      { status: 429 },
    );
  }

  const staff = await db.staffMember.findUnique({
    where: { id: session.staffId },
    select: { id: true, passwordHash: true, status: true },
  });
  if (!staff || staff.status === "SUSPENDED") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Rotation path requires the existing password.
  if (staff.passwordHash) {
    if (!parsed.currentPassword) {
      return NextResponse.json(
        { error: "CURRENT_PASSWORD_REQUIRED" },
        { status: 400 },
      );
    }
    const ok = await verifyStaffPassword(parsed.currentPassword, staff.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "INVALID_CURRENT_PASSWORD" },
        { status: 401 },
      );
    }
    if (parsed.currentPassword === parsed.newPassword) {
      return NextResponse.json(
        { error: "SAME_PASSWORD" },
        { status: 400 },
      );
    }
  }

  let newHash: string;
  try {
    newHash = await hashStaffPassword(parsed.newPassword);
  } catch (err) {
    return NextResponse.json(
      { error: "INVALID_NEW_PASSWORD", detail: err instanceof Error ? err.message : "" },
      { status: 400 },
    );
  }

  await db.staffMember.update({
    where: { id: staff.id },
    data: {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
      // Bump sessionsValidAfter so every cookie minted before this
      // rotation is invalidated, including the caller's current session.
      sessionsValidAfter: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
