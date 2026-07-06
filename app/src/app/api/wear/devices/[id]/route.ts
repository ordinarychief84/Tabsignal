import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";

/**
 * DELETE /api/wear/devices/[id] — revoke a paired watch (lost, sold,
 * left in a cab). Soft revoke: the row keeps its audit trail, the
 * device's bearer token dies on its next request, and push stops
 * immediately because the fan-out only reads unrevoked rows.
 */
export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const device = await db.wearDevice.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, staffId: true, revokedAt: true },
  });
  if (!device || device.staffId !== session.staffId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (device.revokedAt) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  await db.wearDevice.update({
    where: { id: device.id },
    data: { revokedAt: new Date(), fcmToken: null },
  });

  return NextResponse.json({ ok: true, alreadyRevoked: false });
}
