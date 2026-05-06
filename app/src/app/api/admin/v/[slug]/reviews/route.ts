import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
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

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db.feedbackReport.findMany({
    where: { venueId: venue.id, rating: { lte: 3 }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    include: { session: { include: { table: { select: { label: true } } } } },
    take: 200,
  });

  return NextResponse.json({
    items: rows.map(r => ({
      id: r.id,
      rating: r.rating,
      note: r.note,
      aiCategory: r.aiCategory,
      aiSuggestion: r.aiSuggestion,
      aiServerName: r.aiServerName,
      seenByMgr: r.seenByMgr,
      createdAt: r.createdAt.toISOString(),
      tableLabel: r.session.table.label,
    })),
  });
}
