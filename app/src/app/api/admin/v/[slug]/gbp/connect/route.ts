import { NextResponse } from "next/server";
import { originGuard } from "@/lib/csrf";
import { getStaffSession } from "@/lib/auth/session";
import { gateAdminRoute } from "@/lib/plan-gate";
import { appOrigin } from "@/lib/origin";
import { gbpEnabled, gbpConnectUrl, signGbpState } from "@/domain/reviews/gbp";

/**
 * POST /api/admin/v/[slug]/gbp/connect — start the venue-level Google
 * Business Profile consent. Returns the Google URL the settings card
 * redirects to. Dormant (503) until GOOGLE_CLIENT_ID/SECRET exist.
 */
export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  if (!gbpEnabled()) {
    return NextResponse.json({ error: "GBP_NOT_CONFIGURED" }, { status: 503 });
  }

  const gate = await gateAdminRoute(ctx.params.slug, "free", "venue.edit_settings");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const state = await signGbpState({
    venueId: gate.venueId,
    slug: ctx.params.slug,
    staffId: session.staffId,
  });

  return NextResponse.json({ url: gbpConnectUrl(appOrigin(req), state) });
}
