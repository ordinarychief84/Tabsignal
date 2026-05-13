import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import type { OrderStatus } from "@prisma/client";

const Body = z.object({
  status: z.enum(["ACCEPTED", "PREPARING", "READY", "SERVED", "CANCELLED"]),
});

// State machine. Forward flow is NEW → ACCEPTED → PREPARING → READY → SERVED.
// CANCELLED is reachable from any non-terminal state (NEW/ACCEPTED/PREPARING/
// READY) but not from SERVED — once it hit the table it's a refund problem,
// not a cancel.
const TRANSITIONS: Record<OrderStatus, Set<OrderStatus>> = {
  NEW:       new Set<OrderStatus>(["ACCEPTED", "CANCELLED"]),
  ACCEPTED:  new Set<OrderStatus>(["PREPARING", "CANCELLED"]),
  PREPARING: new Set<OrderStatus>(["READY", "CANCELLED"]),
  READY:     new Set<OrderStatus>(["SERVED", "CANCELLED"]),
  SERVED:    new Set<OrderStatus>(), // terminal
  CANCELLED: new Set<OrderStatus>(), // terminal
};

export async function PATCH(
  req: Request,
  ctx: { params: { slug: string; id: string } },
) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "orders.manage");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const order = await db.order.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, venueId: true, status: true },
  });
  if (!order || order.venueId !== gate.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const allowed = TRANSITIONS[order.status];
  if (!allowed.has(parsed.status)) {
    return NextResponse.json(
      { error: "INVALID_TRANSITION", detail: `Cannot move ${order.status} → ${parsed.status}` },
      { status: 409 }
    );
  }

  // Cascade to items: on a global flip we keep the line items in sync so the
  // staff KDS-style view doesn't show stale per-line statuses. Per-item
  // overrides will come later (a server marking one drink READY while the
  // rest of the ticket is PREPARING); for now we cascade on the umbrella.
  await db.$transaction([
    db.order.update({
      where: { id: order.id },
      data: { status: parsed.status },
    }),
    db.orderItem.updateMany({
      where: { orderId: order.id },
      data: { status: parsed.status },
    }),
  ]);

  return NextResponse.json({ ok: true, status: parsed.status });
}
