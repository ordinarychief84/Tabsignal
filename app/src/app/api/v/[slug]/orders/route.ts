import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitAsync } from "@/lib/rate-limit";
import { events } from "@/lib/realtime";
import { sendPushToStaff } from "@/lib/fcm";
import { tabItems } from "@/domain/billing/tab";

/**
 * Guest ordering from the table.
 *
 * This is the piece that went missing when guest payments were removed:
 * the only way to order used to be the prepaid pre-order checkout, so
 * deleting it left the menu with nothing to do and the Orders screen with
 * nothing to show. Ordering never needed a card — it needs a kitchen.
 *
 * What happens on POST:
 *   1. The session token proves this guest owns this tab.
 *   2. Prices are resolved from the database. The client sends ids and
 *      quantities only; a client-supplied price would let anyone order a
 *      steak for a penny.
 *   3. An Order + OrderItems are created, and the same lines are appended
 *      to GuestSession.lineItems so the guest's running tab reflects it
 *      immediately — one write, two readers.
 *   4. Staff are told in real time, and pushed to if their PWA is closed.
 */

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const Body = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
        notes: z.string().max(140).optional(),
      }),
    )
    .min(1)
    .max(40),
});

// One order per 15s per session. A double-tapped "Send" must not put two
// rounds on the pass, and a guest correcting an order still gets through
// quickly.
const WINDOW_MS = 15_000;

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true, requestsEnabled: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Ownership BEFORE the rate-limit bucket, so someone who scrapes a
  // session id can't burn the real guest's allowance.
  const session = await db.guestSession.findUnique({
    where: { id: parsed.sessionId },
    select: {
      id: true, sessionToken: true, venueId: true, tableId: true,
      expiresAt: true, paidAt: true, lineItems: true,
    },
  });
  if (!session || session.venueId !== venue.id) {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }
  if (!tokensEqual(session.sessionToken, parsed.sessionToken)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 });
  }
  if (session.paidAt) {
    return NextResponse.json({ error: "SESSION_CLOSED" }, { status: 410 });
  }

  const limit = await rateLimitAsync(`order:${session.id}`, { windowMs: WINDOW_MS, max: 1 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: limit.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  // Server-side prices. Only active items at THIS venue are orderable —
  // an id from another venue's menu resolves to nothing and 400s.
  const ids = Array.from(new Set(parsed.items.map(i => i.menuItemId)));
  const menuItems = await db.menuItem.findMany({
    where: { id: { in: ids }, venueId: venue.id, isActive: true },
    select: { id: true, name: true, priceCents: true },
  });
  const byId = new Map(menuItems.map(m => [m.id, m] as const));
  if (parsed.items.some(i => !byId.has(i.menuItemId))) {
    return NextResponse.json(
      { error: "INVALID_ITEMS", detail: "Something on your order is no longer available." },
      { status: 400 },
    );
  }

  const lines = parsed.items.map(i => {
    const m = byId.get(i.menuItemId)!;
    return {
      menuItemId: m.id,
      nameSnapshot: m.name,
      priceCents: m.priceCents,
      quantity: i.quantity,
      notes: i.notes?.trim() || null,
    };
  });
  const subtotalCents = lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);

  const order = await db.$transaction(async tx => {
    const created = await tx.order.create({
      data: {
        venueId: venue.id,
        tableId: session.tableId,
        guestSessionId: session.id,
        status: "NEW",
        subtotalCents,
        // No tax, service or tip: TabCall doesn't charge the guest. The
        // venue adds those on its own terminal at settle time.
        totalCents: subtotalCents,
        items: { create: lines },
      },
      include: { items: true, table: { select: { label: true } } },
    });

    // Mirror onto the running tab so the guest's bill view and the staff
    // floor agree without either having to know about Orders.
    const existing = tabItems(session.lineItems);
    await tx.guestSession.update({
      where: { id: session.id },
      data: {
        lineItems: [
          ...existing,
          ...lines.map(l => ({ name: l.nameSnapshot, quantity: l.quantity, unitCents: l.priceCents })),
        ] as object[],
      },
    });

    return created;
  });

  const assignedStaffIds = session.tableId
    ? (
        await db.tableAssignment.findMany({
          where: { tableId: session.tableId },
          select: { staffMemberId: true },
        })
      ).map(a => a.staffMemberId)
    : [];

  const summary = {
    id: order.id,
    status: order.status,
    tableLabel: order.table?.label ?? null,
    totalCents: order.totalCents,
    itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
    items: order.items.map(i => ({
      nameSnapshot: i.nameSnapshot,
      quantity: i.quantity,
      notes: i.notes,
    })),
    createdAt: order.createdAt.toISOString(),
  };

  // Never let a notification failure lose an order that is already saved.
  void events.orderPlaced(venue.id, summary, assignedStaffIds);
  void (async () => {
    // Target the staff covering this table when it has an assignment, and
    // everyone active otherwise — same rule the request queue uses, so a
    // guest's order and their signal reach the same phones.
    const recipients = await db.staffMember.findMany({
      where: assignedStaffIds.length > 0
        ? { id: { in: assignedStaffIds }, fcmToken: { not: null } }
        : { venueId: venue.id, status: "ACTIVE", fcmToken: { not: null } },
      select: { fcmToken: true },
    });
    const tokens = recipients.map(r => r.fcmToken).filter((t): t is string => !!t);
    if (tokens.length === 0) return;
    await sendPushToStaff(tokens, {
      title: `New order · ${order.table?.label ?? "Table"}`,
      body: order.items.map(i => `${i.quantity}× ${i.nameSnapshot}`).join(", ").slice(0, 120),
      data: { orderId: order.id, tableLabel: order.table?.label ?? "" },
    });
  })().catch(() => {});

  return NextResponse.json(summary, { status: 201 });
}
