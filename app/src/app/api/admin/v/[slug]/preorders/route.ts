import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const venue = await db.venue.findUnique({ where: { slug: ctx.params.slug }, select: { id: true } });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (venue.id !== session.venueId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // Active queue: anything paid but not picked up yet, plus the last
  // 20 picked-up orders for context. The PWA polls every 5s.
  const orders = await db.preOrder.findMany({
    where: {
      venueId: venue.id,
      paidAt: { not: null },
      OR: [
        { status: { in: ["PENDING", "READY"] } },
        { pickedUpAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { table: { select: { label: true } } },
    take: 100,
  });

  return NextResponse.json({
    orders: orders.map(o => ({
      id: o.id,
      status: o.status,
      pickupCode: o.pickupCode,
      items: o.items,
      totalCents: o.totalCents,
      tipCents: o.tipCents,
      guestName: o.guestName,
      tableLabel: o.table?.label ?? null,
      paidAt: o.paidAt?.toISOString() ?? null,
      readyAt: o.readyAt?.toISOString() ?? null,
      pickedUpAt: o.pickedUpAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    })),
  });
}
