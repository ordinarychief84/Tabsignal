import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { rateLimitAsync } from "@/lib/rate-limit";
import type { OrderStatus } from "@prisma/client";

const VALID_STATUSES = new Set<OrderStatus>([
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "SERVED",
  "CANCELLED",
]);

// Default lookback for the staff queue. Anything older than 30 days is
// archive territory and shouldn't bloat the in-flight list. A future
// export endpoint covers historical reporting needs.
const DEFAULT_WINDOW_DAYS = 30;

export async function GET(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "orders.manage");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  // Per-venue read cap. Audit Finding #14. The kitchen queue polls
  // frequently (every 2-5s) so 120/min is the lower bound that keeps
  // legitimate dashboards working while blocking runaway clients.
  const gateRl = await rateLimitAsync(`admin-get:orders:${gate.venueId}`, {
    windowMs: 60_000,
    max: 120,
  });
  if (!gateRl.ok) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const statuses = (statusParam ?? "")
    .split(",")
    .map(s => s.trim())
    .filter((s): s is OrderStatus => VALID_STATUSES.has(s as OrderStatus));

  const since = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const orders = await db.order.findMany({
    where: {
      venueId: gate.venueId,
      createdAt: { gte: since },
      ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
    },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      table: { select: { id: true, label: true } },
      bill: { select: { id: true, status: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({
    orders: orders.map(o => ({
      id: o.id,
      status: o.status,
      tableLabel: o.table?.label ?? null,
      tableId: o.tableId,
      subtotalCents: o.subtotalCents,
      taxCents: o.taxCents,
      serviceCents: o.serviceCents,
      tipCents: o.tipCents,
      totalCents: o.totalCents,
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      billId: o.bill?.id ?? null,
      billStatus: o.bill?.status ?? null,
      items: o.items.map(i => ({
        id: i.id,
        nameSnapshot: i.nameSnapshot,
        priceCents: i.priceCents,
        quantity: i.quantity,
        notes: i.notes,
        status: i.status,
      })),
    })),
  });
}
