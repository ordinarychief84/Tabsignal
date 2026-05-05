import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events } from "@/lib/realtime";
import { getStaffSession } from "@/lib/auth/session";

export async function PATCH(_req: Request, ctx: { params: { id: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const existing = await db.request.findUnique({ where: { id: ctx.params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (existing.venueId !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const updated = await db.request.update({
    where: { id: existing.id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  void events.requestResolved(updated.venueId, {
    id: updated.id,
    status: updated.status,
    resolvedAt: updated.resolvedAt?.toISOString() ?? null,
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
