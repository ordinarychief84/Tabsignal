import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

async function gateVenue(slug: string) {
  const session = await getStaffSession();
  if (!session) return { ok: false as const, status: 401, body: { error: "UNAUTHORIZED" } };
  const venue = await db.venue.findUnique({ where: { slug }, select: { id: true } });
  if (!venue) return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  if (venue.id !== session.venueId) return { ok: false as const, status: 403, body: { error: "FORBIDDEN" } };
  return { ok: true as const, venueId: venue.id };
}

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateVenue(ctx.params.slug);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const pools = await db.tipPool.findMany({
    where: { venueId: gate.venueId },
    orderBy: { startedAt: "desc" },
    take: 30,
    include: {
      shares: {
        include: {
          // staffMember relation isn't on TipPoolShare directly (no FK in
          // schema since deletion semantics differ); resolve names below.
        },
      },
    },
  });

  // Resolve staff names in one batch.
  const staffIds = Array.from(new Set(pools.flatMap(p => p.shares.map(s => s.staffMemberId))));
  const staff = staffIds.length === 0
    ? []
    : await db.staffMember.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true },
      });
  const nameById = new Map(staff.map(s => [s.id, s.name]));

  return NextResponse.json({
    pools: pools.map(p => ({
      id: p.id,
      period: p.period,
      startedAt: p.startedAt.toISOString(),
      endedAt: p.endedAt?.toISOString() ?? null,
      closedAt: p.closedAt?.toISOString() ?? null,
      totalTipsCents: p.totalTipsCents,
      shares: p.shares.map(s => ({
        id: s.id,
        staffMemberId: s.staffMemberId,
        staffName: nameById.get(s.staffMemberId) ?? "(unknown)",
        shareWeight: s.shareWeight,
        payoutCents: s.payoutCents,
        paidOutAt: s.paidOutAt?.toISOString() ?? null,
      })),
    })),
  });
}

const PostBody = z.object({
  period: z.enum(["SHIFT", "DAY", "WEEK"]).default("SHIFT"),
});

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateVenue(ctx.params.slug);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = PostBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const open = await db.tipPool.findFirst({
    where: { venueId: gate.venueId, closedAt: null },
  });
  if (open) return NextResponse.json({ error: "POOL_ALREADY_OPEN", id: open.id }, { status: 409 });

  const created = await db.tipPool.create({
    data: { venueId: gate.venueId, period: parsed.period, startedAt: new Date() },
  });
  return NextResponse.json({ id: created.id });
}
