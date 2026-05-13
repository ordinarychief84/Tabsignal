import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_TAKE = 50;
const MAX_TAKE = 100;

export async function GET(req: Request, ctx: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (venue.id !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get("days") ?? DEFAULT_DAYS);
  const days = Number.isFinite(daysRaw)
    ? Math.min(Math.max(Math.trunc(daysRaw), 1), MAX_DAYS)
    : DEFAULT_DAYS;
  const takeRaw = Number(url.searchParams.get("take") ?? DEFAULT_TAKE);
  const take = Number.isFinite(takeRaw)
    ? Math.min(Math.max(Math.trunc(takeRaw), 1), MAX_TAKE)
    : DEFAULT_TAKE;
  const cursor = url.searchParams.get("cursor");
  // Optional filter: only flagged reviews. `?flagged=true` narrows the
  // list to manager-flagged rows regardless of rating or date window.
  const onlyFlagged = url.searchParams.get("flagged") === "true";

  // Keyset pagination on (createdAt desc, id desc) — fetch take+1 to know
  // whether there's another page without an extra count() query.
  const rows = await db.feedbackReport.findMany({
    where: {
      venueId: venue.id,
      // Flagged filter overrides the rating gate — a 4★ review can be
      // flagged (e.g. for misuse / spam) and should still appear under
      // the Flagged filter.
      ...(onlyFlagged ? { flagged: true } : { rating: { lte: 3 } }),
      createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { session: { include: { table: { select: { label: true } } } } },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.id : null;

  return NextResponse.json({
    items: items.map(r => ({
      id: r.id,
      rating: r.rating,
      note: r.note,
      aiCategory: r.aiCategory,
      aiSuggestion: r.aiSuggestion,
      aiServerName: r.aiServerName,
      seenByMgr: r.seenByMgr,
      flagged: r.flagged,
      flaggedAt: r.flaggedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      tableLabel: r.session.table.label,
    })),
    nextCursor,
  });
}
