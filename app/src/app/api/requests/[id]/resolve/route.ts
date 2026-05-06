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

  // Idempotent resolve: if already RESOLVED, return the original timestamp
  // and skip the realtime emit. Otherwise compare-and-swap on non-resolved
  // status so a second tap can't overwrite resolvedAt.
  if (existing.status === "RESOLVED") {
    return NextResponse.json({
      id: existing.id,
      status: existing.status,
      resolvedAt: existing.resolvedAt?.toISOString() ?? null,
      alreadyResolved: true,
    });
  }

  const cas = await db.request.updateMany({
    where: { id: existing.id, status: { not: "RESOLVED" } },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  if (cas.count === 0) {
    const cur = await db.request.findUnique({ where: { id: existing.id } });
    return NextResponse.json({
      id: cur?.id,
      status: cur?.status,
      resolvedAt: cur?.resolvedAt?.toISOString() ?? null,
      alreadyResolved: true,
    });
  }

  const updated = await db.request.findUnique({ where: { id: existing.id } });
  if (!updated) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  void events.requestResolved(updated.venueId, {
    id: updated.id,
    status: updated.status,
    resolvedAt: updated.resolvedAt?.toISOString() ?? null,
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
