import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { originGuard } from "@/lib/csrf";
import { gateAdminRoute } from "@/lib/plan-gate";
import { rateLimitAsync } from "@/lib/rate-limit";
import { aiRepliesEnabled, draftReviewReply } from "@/lib/ai/draft-review-reply";

/**
 * POST /api/admin/v/[slug]/google-reviews/[id]/draft — generate an
 * AI reply draft for one Google review. The draft is STORED on the row
 * (GoogleReview.aiDraft) so a manager can come back to it; nothing is
 * posted until they approve via the reply endpoint.
 */
export async function POST(req: Request, ctx: { params: { slug: string; id: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  if (!aiRepliesEnabled()) {
    return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
  }
  const gate = await gateAdminRoute(ctx.params.slug, "free", "venue.edit_settings");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  // Model calls cost money — cap per venue.
  const limit = await rateLimitAsync(`gbp:draft:${gate.venueId}`, { windowMs: 60 * 60_000, max: 30 });
  if (!limit.ok) {
    return NextResponse.json({ error: "RATE_LIMITED", retryAfterMs: limit.retryAfterMs }, { status: 429 });
  }

  const review = await db.googleReview.findUnique({ where: { id: ctx.params.id } });
  if (!review || review.venueId !== gate.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const venue = await db.venue.findUnique({
    where: { id: gate.venueId },
    select: { name: true },
  });

  try {
    const draft = await draftReviewReply({
      venueName: venue?.name ?? "our venue",
      starRating: review.starRating,
      comment: review.comment,
      reviewerName: review.reviewerName,
    });
    await db.googleReview.update({ where: { id: review.id }, data: { aiDraft: draft } });
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: "DRAFT_FAILED", detail: err instanceof Error ? err.message : "model error" },
      { status: 502 },
    );
  }
}
