import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { venueId: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.venueId !== ctx.params.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Include recently-RESOLVED requests so the "Completed" tab on the
  // staff queue has data. Cap recently-resolved to the last hour — older
  // history is for the manager dashboard, not the floor app.
  const oneHourAgo = new Date(Date.now() - 60 * 60_000);
  const requests = await db.request.findMany({
    where: {
      venueId: ctx.params.venueId,
      OR: [
        { status: { in: ["PENDING", "ACKNOWLEDGED", "ESCALATED"] } },
        { status: "RESOLVED", resolvedAt: { gte: oneHourAgo } },
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      table: { select: { label: true } },
      acknowledgedBy: { select: { id: true, name: true } },
    },
    take: 200,
  });

  return NextResponse.json({
    items: requests.map(r => ({
      id: r.id,
      tableId: r.tableId,
      tableLabel: r.table.label,
      type: r.type,
      note: r.note,
      status: r.status,
      idCheckRequired: r.idCheckRequired,
      createdAt: r.createdAt.toISOString(),
      acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      escalatedAt: r.escalatedAt?.toISOString() ?? null,
      resolutionAction: r.resolutionAction,
      acknowledgedBy: r.acknowledgedBy ? { id: r.acknowledgedBy.id, name: r.acknowledgedBy.name } : null,
    })),
  });
}
