import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { venueId: string } }) {
  const requests = await db.request.findMany({
    where: { venueId: ctx.params.venueId, status: { in: ["PENDING", "ACKNOWLEDGED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      table: { select: { label: true } },
      acknowledgedBy: { select: { id: true, name: true } },
    },
    take: 100,
  });

  return NextResponse.json({
    items: requests.map(r => ({
      id: r.id,
      tableId: r.tableId,
      tableLabel: r.table.label,
      type: r.type,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
      acknowledgedBy: r.acknowledgedBy ? { id: r.acknowledgedBy.id, name: r.acknowledgedBy.name } : null,
    })),
  });
}
