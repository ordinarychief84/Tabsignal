import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";

async function gatePool(slug: string, poolId: string) {
  const gate = await gateAdminRoute(slug, "growth", "tip_pools.manage");
  if (!gate.ok) return gate;
  const venue = await db.venue.findUnique({ where: { id: gate.venueId }, select: { id: true } });
  if (!venue) return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  const pool = await db.tipPool.findUnique({ where: { id: poolId } });
  if (!pool || pool.venueId !== venue.id) {
    return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  }
  return { ok: true as const, venue, pool };
}

const ShareSchema = z.object({
  staffMemberId: z.string().min(1),
  shareWeight: z.number().positive().max(100).default(1),
});

const PatchBody = z.object({
  // Either "shares" (assign weights) or "close" (close the pool and
  // distribute) or both. Can be called multiple times before close.
  shares: z.array(ShareSchema).optional(),
  close: z.boolean().optional(),
  // Total tips to distribute, in cents.
  //
  // This used to be summed from TabCall-collected tips. TabCall no longer
  // takes payment from guests, so there are no tips of ours to sum — the
  // venue takes them on its own terminal or in cash. The manager now
  // enters the figure they actually took, which is the only number that
  // was ever going to be right after the change.
  totalTipsCents: z.number().int().min(0).max(10_000_000).optional(),
});

export async function PATCH(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gatePool(ctx.params.slug, ctx.params.id);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = PatchBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  if (gate.pool.closedAt) {
    return NextResponse.json({ error: "POOL_CLOSED" }, { status: 410 });
  }

  // Replace shares wholesale to make weight edits idempotent.
  if (parsed.shares) {
    const ids = parsed.shares.map(s => s.staffMemberId);
    const validStaff = await db.staffMember.findMany({
      where: { id: { in: ids }, venueId: gate.venue.id },
      select: { id: true },
    });
    if (validStaff.length !== new Set(ids).size) {
      return NextResponse.json({ error: "INVALID_STAFF" }, { status: 400 });
    }
    await db.$transaction([
      db.tipPoolShare.deleteMany({ where: { poolId: gate.pool.id } }),
      ...parsed.shares.map(s =>
        db.tipPoolShare.create({
          data: {
            poolId: gate.pool.id,
            staffMemberId: s.staffMemberId,
            shareWeight: s.shareWeight,
          },
        })
      ),
    ]);
  }

  if (parsed.close) {
    if (parsed.totalTipsCents === undefined) {
      return NextResponse.json(
        {
          error: "TOTAL_TIPS_REQUIRED",
          detail: "Enter the total tips to distribute — TabCall doesn't collect them.",
        },
        { status: 400 },
      );
    }
    const totalTipsCents = parsed.totalTipsCents;

    // Distribute proportionally by weight.
    const shares = await db.tipPoolShare.findMany({ where: { poolId: gate.pool.id } });
    const weightTotal = shares.reduce((s, x) => s + x.shareWeight, 0);
    const updates = shares.map(s => {
      const payout = weightTotal > 0
        ? Math.round((totalTipsCents * s.shareWeight) / weightTotal)
        : 0;
      return db.tipPoolShare.update({
        where: { id: s.id },
        data: { payoutCents: payout },
      });
    });

    await db.$transaction([
      ...updates,
      db.tipPool.update({
        where: { id: gate.pool.id },
        data: {
          totalTipsCents,
          endedAt: new Date(),
          closedAt: new Date(),
        },
      }),
    ]);
  }

  return NextResponse.json({ ok: true });
}
