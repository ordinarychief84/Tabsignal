import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { originGuard } from "@/lib/csrf";
import { gateAdminRoute } from "@/lib/plan-gate";
import { gbpEnabled, syncVenueReviews } from "@/domain/reviews/gbp";

/**
 * POST /api/admin/v/[slug]/gbp/location — bind the venue to one GBP
 * location. Flips the connection to CONNECTED and kicks the first sync
 * in the background.
 */
const Body = z.object({
  accountName: z.string().regex(/^accounts\/[A-Za-z0-9_-]+$/),
  locationName: z.string().regex(/^locations\/[A-Za-z0-9_-]+$/),
  title: z.string().min(1).max(200),
});

export async function POST(req: Request, ctx: { params: { slug: string } }) {
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

  const conn = await db.gbpConnection.findUnique({ where: { venueId: gate.venueId } });
  if (!conn?.encryptedRefreshToken) {
    return NextResponse.json({ error: "NOT_CONNECTED" }, { status: 409 });
  }

  await db.gbpConnection.update({
    where: { venueId: gate.venueId },
    data: {
      gbpAccountName: parsed.accountName,
      gbpLocationName: parsed.locationName,
      locationTitle: parsed.title,
      status: "CONNECTED",
      lastError: null,
    },
  });

  // First sync in the background — the card polls lastSyncAt.
  void syncVenueReviews(gate.venueId);

  return NextResponse.json({ ok: true, locationTitle: parsed.title });
}
