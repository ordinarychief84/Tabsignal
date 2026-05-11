/**
 * GET /api/operator/orgs?q=&plan=&status=&limit=
 *
 * Cross-platform org list with filters for /operator/orgs page.
 * Operator-only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync } from "@/lib/auth/operator";

const Q = z.object({
  q: z.string().max(100).optional(),
  plan: z.enum(["STARTER", "FLAT", "FOUNDING"]).optional(),
  status: z.enum(["NONE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isPlatformStaffAsync(session))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const url = new URL(req.url);
  let q;
  try { q = Q.parse(Object.fromEntries(url.searchParams)); }
  catch (e) { return NextResponse.json({ error: "INVALID_QUERY", detail: e instanceof Error ? e.message : "" }, { status: 400 }); }

  const where: Prisma.OrganizationWhereInput = {};
  if (q.q) where.name = { contains: q.q, mode: Prisma.QueryMode.insensitive };
  if (q.plan) where.plan = q.plan;
  if (q.status) where.subscriptionStatus = q.status;
  const orgs = await db.organization.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: q.limit,
    include: {
      venues: { select: { id: true, slug: true, name: true } },
      _count: { select: { members: true } },
    },
  });

  return NextResponse.json({
    items: orgs.map(o => ({
      id: o.id,
      name: o.name,
      plan: o.plan,
      stripeCustomerId: o.stripeCustomerId,
      subscriptionStatus: o.subscriptionStatus,
      subscriptionPriceId: o.subscriptionPriceId,
      subscriptionPeriodEnd: o.subscriptionPeriodEnd?.toISOString() ?? null,
      trialEndsAt: o.trialEndsAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
      venueCount: o.venues.length,
      memberCount: o._count.members,
      venues: o.venues,
    })),
  });
}
