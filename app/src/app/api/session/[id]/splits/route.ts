import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseLineItems, totalsFor } from "@/lib/bill";
import { planFromOrg, meetsAtLeast } from "@/lib/plans";

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const PostBody = z.object({
  sessionToken: z.string().min(1),
  count: z.number().int().min(2).max(10),
  // Each split inherits the session-level tipPercent at creation time;
  // payers can still adjust their own tip when they tap pay.
  tipPercent: z.number().min(0).max(50).finite().default(0),
});

export async function POST(req: Request, ctx: { params: { id: string } }) {
  let parsed;
  try { parsed = PostBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const session = await db.guestSession.findUnique({
    where: { id: ctx.params.id },
    include: {
      venue: {
        select: {
          zipCode: true,
          org: { select: { subscriptionPriceId: true, subscriptionStatus: true } },
        },
      },
      splits: { select: { id: true, paidAt: true } },
    },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (!tokensEqual(session.sessionToken, parsed.sessionToken)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (!meetsAtLeast(planFromOrg(session.venue.org), "growth")) {
    // Bill split is a Growth feature. The guest UI should fall back to
    // single-card pay; 404 keeps the response indistinguishable.
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }
  if (session.paidAt) return NextResponse.json({ error: "ALREADY_PAID" }, { status: 410 });
  if (session.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 });
  }
  // If splits already exist that are paid, refuse to recreate. Unpaid splits
  // are fair game to reset.
  const anyPaid = session.splits.some(s => s.paidAt);
  if (anyPaid) return NextResponse.json({ error: "SPLITS_ALREADY_PAID" }, { status: 409 });

  const items = parseLineItems(session.lineItems);
  const totals = totalsFor(items, session.venue.zipCode ?? "", 0); // tax + subtotal, no tip
  const subtotalPlusTax = totals.subtotalCents + totals.taxCents;
  if (subtotalPlusTax <= 0) {
    return NextResponse.json({ error: "EMPTY_TAB" }, { status: 400 });
  }

  // Even split with the rounding remainder absorbed by the first split
  // (so pennies don't go missing).
  const base = Math.floor(subtotalPlusTax / parsed.count);
  const remainder = subtotalPlusTax - base * parsed.count;
  const amounts = Array.from({ length: parsed.count }, (_, i) => base + (i === 0 ? remainder : 0));

  await db.$transaction([
    db.billSplit.deleteMany({ where: { sessionId: session.id } }),
    ...amounts.map((amount, i) =>
      db.billSplit.create({
        data: {
          sessionId: session.id,
          label: `Person ${i + 1}`,
          amountCents: amount,
          tipPercent: parsed.tipPercent,
        },
      })
    ),
  ]);

  const splits = await db.billSplit.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    splits: splits.map(s => ({
      id: s.id,
      label: s.label,
      amountCents: s.amountCents,
      tipPercent: s.tipPercent,
      paidAt: s.paidAt?.toISOString() ?? null,
    })),
  });
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("sessionToken");

  const session = await db.guestSession.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, sessionToken: true },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (!tokenFromQuery || !tokensEqual(session.sessionToken, tokenFromQuery)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const splits = await db.billSplit.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    splits: splits.map(s => ({
      id: s.id,
      label: s.label,
      amountCents: s.amountCents,
      tipPercent: s.tipPercent,
      paidAt: s.paidAt?.toISOString() ?? null,
    })),
  });
}
