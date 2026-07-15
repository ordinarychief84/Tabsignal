import { NextResponse } from "next/server";
import { originGuard } from "@/lib/csrf";
import { gateAdminRoute } from "@/lib/plan-gate";
import { rateLimitAsync } from "@/lib/rate-limit";
import { gbpEnabled, syncVenueReviews } from "@/domain/reviews/gbp";

/**
 * POST /api/admin/v/[slug]/gbp/sync — manual "sync now" from the
 * settings card. The nightly cron does the steady-state work; this is
 * for "I just replied on Google, show it here".
 */
export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  if (!gbpEnabled()) {
    return NextResponse.json({ error: "GBP_NOT_CONFIGURED" }, { status: 503 });
  }
  const gate = await gateAdminRoute(ctx.params.slug, "free", "venue.edit_settings");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  // GBP quotas are stingy — cap manual syncs well below them.
  const limit = await rateLimitAsync(`gbp:sync:${gate.venueId}`, { windowMs: 60 * 60_000, max: 6 });
  if (!limit.ok) {
    return NextResponse.json({ error: "RATE_LIMITED", retryAfterMs: limit.retryAfterMs }, { status: 429 });
  }

  const result = await syncVenueReviews(gate.venueId);
  if ("error" in result) {
    return NextResponse.json({ error: "SYNC_FAILED", detail: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, synced: result.synced });
}
