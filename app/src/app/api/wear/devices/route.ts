import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

/**
 * GET /api/wear/devices — the caller's paired watches, for the
 * "Watch" section of the staff console. Cookie-authenticated: a staff
 * member manages their own devices; managers revoke a departed
 * waiter's watches implicitly by suspending/removing the staff row
 * (getWearAuth refuses non-ACTIVE staff).
 */
export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const devices = await db.wearDevice.findMany({
    where: { staffId: session.staffId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      platform: true,
      lastSeenAt: true,
      createdAt: true,
      fcmToken: true,
    },
  });

  return NextResponse.json({
    devices: devices.map(d => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      pushEnabled: !!d.fcmToken,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      pairedAt: d.createdAt.toISOString(),
    })),
  });
}
