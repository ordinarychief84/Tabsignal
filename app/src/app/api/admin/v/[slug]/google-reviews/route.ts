import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";

/**
 * GET /api/admin/v/[slug]/google-reviews — the mirrored Google reviews
 * for the inbox's Google tab. Cursor-paginated, newest Google-side
 * first, optional unreplied-only filter (the actionable slice).
 */
const Q = z.object({
  cursor: z.string().optional(),
  unreplied: z.enum(["true", "false"]).optional(),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const url = new URL(req.url);
  let q;
  try { q = Q.parse(Object.fromEntries(url.searchParams)); }
  catch (e) {
    return NextResponse.json(
      { error: "INVALID_QUERY", detail: e instanceof Error ? e.message : "" },
      { status: 400 },
    );
  }

  const rows = await db.googleReview.findMany({
    where: {
      venueId: gate.venueId,
      ...(q.unreplied === "true" ? { repliedAt: null } : {}),
    },
    orderBy: [{ gbpCreatedAt: "desc" }, { id: "desc" }],
    take: q.take + 1,
    ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
  });

  const hasMore = rows.length > q.take;
  const items = hasMore ? rows.slice(0, q.take) : rows;

  return NextResponse.json({
    items: items.map(r => ({
      id: r.id,
      starRating: r.starRating,
      comment: r.comment,
      reviewerName: r.reviewerName,
      gbpCreatedAt: r.gbpCreatedAt.toISOString(),
      replyText: r.replyText,
      repliedAt: r.repliedAt?.toISOString() ?? null,
      replySource: r.replySource,
      aiDraft: r.aiDraft,
      seenByMgr: r.seenByMgr,
    })),
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
  });
}
