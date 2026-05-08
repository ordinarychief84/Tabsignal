import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { LineItem as LineItemSchema, parseLineItems } from "@/lib/bill";
import { getStaffSession } from "@/lib/auth/session";

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

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

export async function GET(req: Request, ctx: { params: { id: string } }) {
  // Either staff at the session's venue OR the guest with a valid sessionToken
  // can read items. Without one of those, refuse — anyone with a session id
  // could otherwise enumerate bills (privacy + ordering-pattern leakage).
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("sessionToken");
  const staffSession = await getStaffSession();

  const session = await db.guestSession.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, lineItems: true, paidAt: true, expiresAt: true, sessionToken: true, venueId: true },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });

  const isStaffAtVenue = !!staffSession && staffSession.venueId === session.venueId;
  const isGuestWithToken = !!tokenFromQuery && tokensEqual(session.sessionToken, tokenFromQuery);
  if (!isStaffAtVenue && !isGuestWithToken) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  return NextResponse.json({
    sessionId: session.id,
    paid: !!session.paidAt,
    expired: session.expiresAt.getTime() <= Date.now(),
    items: parseLineItems(session.lineItems),
  });
}
