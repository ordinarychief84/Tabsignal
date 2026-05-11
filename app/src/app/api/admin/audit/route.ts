/**
 * GET /api/admin/audit?limit=50&before=<iso>&action=staff.suspended&actor=<email>
 *
 * Paginated audit-log feed scoped to the caller's venue. Cursor is the
 * createdAt of the *oldest* row in the previous page (passed back as
 * `before`) — straightforward for an append-only table.
 *
 * Permissioned via the `audit.view` matrix entry (Owner / Manager /
 * Viewer / Platform).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

const PAGE_MAX = 100;

const Q = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(50),
  before: z.string().datetime().optional(),
  action: z.string().max(80).optional(),
  actor: z.string().email().max(200).optional(),
});

export async function GET(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!can(session.role, "audit.view")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
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
      venueId: session.venueId,
      ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.actor ? { actorEmail: q.actor.toLowerCase() } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: q.limit,
    select: {
      id: true,
      actorEmail: true,
      actorRole: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    items: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
    nextBefore: rows.length === q.limit ? rows[rows.length - 1].createdAt.toISOString() : null,
  });
}
