import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { rateLimitAsync } from "@/lib/rate-limit";
import type { BillStatus } from "@prisma/client";

const VALID_STATUSES = new Set<BillStatus>([
  "OPEN",
  "PARTIAL",
  "PAID",
  "REFUNDED",
  "CANCELLED",
]);

const DEFAULT_WINDOW_DAYS = 30;

export async function GET(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "bills.view");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  // Per-venue cap so a compromised staff account can't hammer the DB
  // via this endpoint. 120/min is generous — a dashboard polling at
  // 1s intervals stays well under. Audit Finding #14.
  const gateRl = await rateLimitAsync(`admin-get:bills:${gate.venueId}`, {
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
    .filter((s): s is BillStatus => VALID_STATUSES.has(s as BillStatus));

  const since = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const bills = await db.bill.findMany({
    where: {
      venueId: gate.venueId,
      createdAt: { gte: since },
      ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
    },
    include: {
      table: { select: { id: true, label: true } },
      items: { orderBy: { createdAt: "asc" } },
      splits: {
        orderBy: { createdAt: "asc" },
        include: { splitItems: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({
    bills: bills.map(b => ({
      id: b.id,
      status: b.status,
      tableLabel: b.table?.label ?? null,
      tableId: b.tableId,
      orderId: b.orderId,
      subtotalCents: b.subtotalCents,
      taxCents: b.taxCents,
      serviceCents: b.serviceCents,
      tipTotalCents: b.tipTotalCents,
      totalCents: b.totalCents,
      amountPaidCents: b.amountPaidCents,
      amountDueCents: b.amountDueCents,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      itemCount: b.items.length,
      splitCount: b.splits.length,
      items: b.items.map(i => ({
        id: i.id,
        nameSnapshot: i.nameSnapshot,
        priceCents: i.priceCents,
        quantity: i.quantity,
        status: i.status,
        paidBySplitId: i.paidBySplitId,
      })),
      splits: b.splits.map(s => ({
        id: s.id,
        status: s.status,
        subtotalCents: s.subtotalCents,
        taxCents: s.taxCents,
        tipCents: s.tipCents,
        totalCents: s.totalCents,
        paidAt: s.paidAt?.toISOString() ?? null,
        billItemIds: s.splitItems.map(si => si.billItemId),
      })),
    })),
  });
}
