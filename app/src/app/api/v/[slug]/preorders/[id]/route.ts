import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitAsync } from "@/lib/rate-limit";

// Public guest read of a single pre-order (status check). Identifying via
// the pickup code keeps the endpoint usable from the confirmation screen
// without exposing arbitrary lookups by id alone.
export async function GET(req: Request, ctx: { params: { slug: string; id: string } }) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "PICKUP_CODE_REQUIRED" }, { status: 400 });

  // The pickup code is the only credential here, so the endpoint must not
  // be a free guessing oracle. Keyed on pre-order id: a guest refreshing
  // their own confirmation screen stays well inside this.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const gate = await rateLimitAsync(`preorder:read:${ctx.params.id}:${ip}`, {
    windowMs: 60_000,
    max: 20,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } },
    );
  }

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true, name: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const pre = await db.preOrder.findFirst({
    where: { id: ctx.params.id, venueId: venue.id, pickupCode: code },
  });
  if (!pre) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    id: pre.id,
    status: pre.status,
    pickupCode: pre.pickupCode,
    items: pre.items,
    subtotalCents: pre.subtotalCents,
    tipCents: pre.tipCents,
    totalCents: pre.totalCents,
    paidAt: pre.paidAt?.toISOString() ?? null,
    readyAt: pre.readyAt?.toISOString() ?? null,
    pickedUpAt: pre.pickedUpAt?.toISOString() ?? null,
    venueName: venue.name,
  });
}
