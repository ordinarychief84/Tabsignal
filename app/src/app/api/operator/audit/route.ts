/**
 * GET /api/operator/audit?limit=50&before=<iso>&action=staff.suspended&actor=<email>&orgId=<id>
 *
 * Cross-venue paginated audit feed for TabCall operators. Mirrors the
 * per-venue /api/admin/audit route but joins venue + org so a founder
 * can filter by org or follow up on a single actor across venues.
 *
 * Operator-only: gated by `isOperator()` (OPERATOR_EMAILS env).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync } from "@/lib/auth/operator";

const PAGE_MAX = 200;

const Q = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(100),
  before: z.string().datetime().optional(),
  action: z.string().max(80).optional(),
  actor: z.string().email().max(200).optional(),
  orgId: z.string().min(1).max(64).optional(),
});

export async function GET(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isPlatformStaffAsync(session))) {
    return NextResponse.json({ error: "FORBIDDEN", detail: "Operator allowlist only." }, { status: 403 });
  }

  const url = new URL(req.url);
  let q;
  try {
    q = Q.parse(Object.fromEntries(url.searchParams));
  } catch (e) {
    return NextResponse.json({ error: "INVALID_QUERY", detail: e instanceof Error ? e.message : "" }, { status: 400 });
  }

  const rows = await db.auditLog.findMany({
    where: {
      ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.actor ? { actorEmail: q.actor.toLowerCase() } : {}),
      ...(q.orgId ? { venue: { orgId: q.orgId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: q.limit,
    include: {
      venue: { select: { id: true, slug: true, name: true, orgId: true, org: { select: { id: true, name: true } } } },
    },
  });

  return NextResponse.json({
    items: rows.map(r => ({
      id: r.id,
      venueId: r.venueId,
      venueSlug: r.venue.slug,
      venueName: r.venue.name,
      orgId: r.venue.orgId,
      orgName: r.venue.org.name,
      actorEmail: r.actorEmail,
      actorRole: r.actorRole,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    })),
    nextBefore: rows.length === q.limit ? rows[rows.length - 1].createdAt.toISOString() : null,
  });
}
