import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { planFromOrg, meetsAtLeast } from "@/lib/plans";
import { listSplits, resetEvenSplits } from "@/domain/billing/splits";

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
          org: { select: { subscriptionPriceId: true, subscriptionStatus: true, trialEndsAt: true } },
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
  // Even-split math + paid-split refusal live in domain/billing/splits.
  const result = await resetEvenSplits(session, parsed.count, parsed.tipPercent);
  if (!result.ok) {
    const status = result.error === "SPLITS_ALREADY_PAID" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ splits: result.splits });
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

  return NextResponse.json({ splits: await listSplits(session.id) });
}
