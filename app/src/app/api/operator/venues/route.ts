/**
 * GET /api/operator/venues?q=&orgId=&plan=&hasStripe=&suspended=&limit=&before=
 *
 * Cross-org venue list with rich filters for the founder's
 * /operator/venues page. Operator-only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync } from "@/lib/auth/operator";

const Q = z.object({
  q: z.string().max(100).optional(),
  orgId: z.string().max(64).optional(),
  plan: z.enum(["STARTER", "FLAT", "FOUNDING"]).optional(),
  hasStripe: z.enum(["true", "false"]).optional(),
  suspended: z.enum(["true", "false"]).optional(),
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

  // "Suspended" venue today = all three kill switches off. We don't
  // have a dedicated `Venue.suspendedAt` column yet — use the kill
  // switches as a proxy. Phase-2 will add an explicit column.
  const where: Prisma.VenueWhereInput = {};
  if (q.q) {
    where.OR = [
      { name: { contains: q.q, mode: Prisma.QueryMode.insensitive } },
      { slug: { contains: q.q, mode: Prisma.QueryMode.insensitive } },
    ];
  }
  if (q.orgId) where.orgId = q.orgId;
  if (q.plan) where.org = { plan: q.plan };
  if (q.hasStripe === "true") where.stripeAccountId = { not: null };
  if (q.hasStripe === "false") where.stripeAccountId = null;
  if (q.suspended === "true") {
    where.requestsEnabled = false;
    where.preorderEnabled = false;
    where.reservationsEnabled = false;
  } else if (q.suspended === "false") {
    where.OR = [
      ...(where.OR ?? []),
      { requestsEnabled: true }, { preorderEnabled: true }, { reservationsEnabled: true },
    ];
  }
  const venues = await db.venue.findMany({
    where,
    take: q.limit,
    orderBy: { createdAt: "desc" },
    include: {
      org: { select: { id: true, name: true, plan: true, subscriptionStatus: true } },
      _count: { select: { staff: true, tables: true, sessions: true, requests: true } },
    },
  });

  return NextResponse.json({
    items: venues.map(v => ({
      id: v.id,
      slug: v.slug,
      name: v.name,
      address: v.address,
      zipCode: v.zipCode,
      timezone: v.timezone,
      stripeAttached: !!v.stripeAccountId,
      stripeReady: v.stripeChargesEnabled,
      requestsEnabled: v.requestsEnabled,
      preorderEnabled: v.preorderEnabled,
      reservationsEnabled: v.reservationsEnabled,
      createdAt: v.createdAt.toISOString(),
      org: { id: v.org.id, name: v.org.name, plan: v.org.plan, subscriptionStatus: v.org.subscriptionStatus },
      counts: { staff: v._count.staff, tables: v._count.tables, sessions: v._count.sessions, requests: v._count.requests },
    })),
  });
}
