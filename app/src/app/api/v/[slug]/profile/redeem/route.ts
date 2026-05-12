import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateGuestVenuePlan } from "@/lib/plan-gate";
import { verifyProfileToken, PROFILE_COOKIE } from "@/lib/profile-cookie";
import { redeemPoints } from "@/lib/loyalty";

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const Body = z.object({
  sessionId: z.string().min(1),
  // Required: prevents a logged-in regular from applying their discount to
  // a stranger's open tab at the same venue. Session token proves
  // ownership the same way it does for every other guest mutation.
  sessionToken: z.string().min(1),
  points: z.number().int().min(1).max(100_000),
});

type LineItem = {
  id?: string;
  name: string;
  quantity: number;
  unitCents: number;
  isLoyaltyDiscount?: boolean;
};

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateGuestVenuePlan(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const token = cookies().get(PROFILE_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "NOT_IDENTIFIED" }, { status: 401 });
  const claims = await verifyProfileToken(token);
  if (!claims) return NextResponse.json({ error: "NOT_IDENTIFIED" }, { status: 401 });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const session = await db.guestSession.findUnique({
    where: { id: parsed.sessionId },
    select: { id: true, venueId: true, paidAt: true, lineItems: true, sessionToken: true },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (session.venueId !== gate.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (!tokensEqual(session.sessionToken, parsed.sessionToken)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (session.paidAt) return NextResponse.json({ error: "ALREADY_PAID" }, { status: 410 });

  // Apply redemption + append discount line item in a single transaction
  // so a partial failure can't leave a profile debited without the bill
  // reflecting the credit.
  const result = await db.$transaction(async tx => {
    const redeem = await redeemPoints(tx, claims.profileId, gate.venueId, parsed.points);
    if (!redeem.ok) return { ok: false as const, reason: redeem.reason };

    const items = (Array.isArray(session.lineItems) ? session.lineItems : []) as LineItem[];
    items.push({
      name: `Loyalty redemption (${parsed.points} pts)`,
      quantity: 1,
      unitCents: -redeem.discountCents,
      isLoyaltyDiscount: true,
    });

    await tx.guestSession.update({
      where: { id: session.id },
      data: {
        lineItems: items as unknown as never,
        guestProfileId: claims.profileId,
      },
    });

    return { ok: true as const, redeem };
  });

  if (!result.ok) {
    return NextResponse.json({ error: "REDEEM_FAILED", detail: result.reason }, { status: 400 });
  }
  return NextResponse.json({
    redeemed: result.redeem.redeemed,
    balance: result.redeem.balance,
    discountCents: result.redeem.discountCents,
  });
}
