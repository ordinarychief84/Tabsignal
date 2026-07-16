import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { originGuard } from "@/lib/csrf";
import { gateAdminRoute } from "@/lib/plan-gate";
import { gbpEnabled, gbpAccessToken, putGbpReply } from "@/domain/reviews/gbp";

/**
 * POST /api/admin/v/[slug]/google-reviews/[id]/reply — the manager
 * approved a reply (AI-drafted or hand-written): post it to Google and
 * record it locally. The TEXT THE MANAGER SENT is what gets posted —
 * the AI draft is a starting point, never the authority.
 */
const Body = z.object({
  text: z.string().trim().min(1).max(4000),
});

export async function POST(req: Request, ctx: { params: { slug: string; id: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  if (!gbpEnabled()) {
    return NextResponse.json({ error: "GBP_NOT_CONFIGURED" }, { status: 503 });
  }
  const gate = await gateAdminRoute(ctx.params.slug, "free", "venue.edit_settings");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" },
      { status: 400 },
    );
  }

  const review = await db.googleReview.findUnique({ where: { id: ctx.params.id } });
  if (!review || review.venueId !== gate.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const conn = await db.gbpConnection.findUnique({ where: { venueId: gate.venueId } });
  if (!conn?.encryptedRefreshToken || conn.status === "DISCONNECTED") {
    return NextResponse.json({ error: "NOT_CONNECTED" }, { status: 409 });
  }

  try {
    const accessToken = await gbpAccessToken(conn.encryptedRefreshToken);
    await putGbpReply(accessToken, review.gbpReviewName, parsed.text);
  } catch (err) {
    // Review stays unreplied locally — the truth is what's on Google.
    return NextResponse.json(
      { error: "GBP_REPLY_FAILED", detail: err instanceof Error ? err.message : "api error" },
      { status: 502 },
    );
  }

  const updated = await db.googleReview.update({
    where: { id: review.id },
    data: {
      replyText: parsed.text,
      repliedAt: new Date(),
      replySource: "tabcall",
      aiDraft: null, // consumed
      seenByMgr: true,
    },
  });

  return NextResponse.json({
    ok: true,
    repliedAt: updated.repliedAt?.toISOString() ?? null,
  });
}
