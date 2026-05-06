import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { LineItem as LineItemSchema, parseLineItems } from "@/lib/bill";
import { getStaffSession } from "@/lib/auth/session";

// Staff-only: only authenticated staff at the same venue as the session
// can mutate line items. This closes a bill-inflation vector where any
// session ID could be used to add fake items to another guest's tab.
//
// Staff-added items must be nonnegative — comps/discounts have their own
// dedicated path (the AI bad-rating email's "Comp this round" button).
const Body = z.object({
  items: z
    .array(
      LineItemSchema.extend({
        name: z.string().min(1).max(120),
        unitCents: z.number().int().nonnegative(),
      })
    )
    .min(1)
    .max(50),
  mode: z.enum(["append", "replace"]).default("append"),
});

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const staffSession = await getStaffSession();
  if (!staffSession) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "bad body" },
      { status: 400 }
    );
  }

  const session = await db.guestSession.findUnique({ where: { id: ctx.params.id } });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (session.venueId !== staffSession.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (session.paidAt) return NextResponse.json({ error: "ALREADY_PAID" }, { status: 410 });
  if (session.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 });
  }

  const existing = parseLineItems(session.lineItems);
  const next = parsed.mode === "replace" ? parsed.items : [...existing, ...parsed.items];

  const updated = await db.guestSession.update({
    where: { id: session.id },
    data: { lineItems: next },
  });

  return NextResponse.json({
    ok: true,
    sessionId: updated.id,
    items: parseLineItems(updated.lineItems),
  });
}

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const session = await db.guestSession.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, lineItems: true, paidAt: true, expiresAt: true },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({
    sessionId: session.id,
    paid: !!session.paidAt,
    expired: session.expiresAt.getTime() <= Date.now(),
    items: parseLineItems(session.lineItems),
  });
}
