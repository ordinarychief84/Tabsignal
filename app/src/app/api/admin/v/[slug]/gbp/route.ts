import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { originGuard } from "@/lib/csrf";
import { gateAdminRoute } from "@/lib/plan-gate";

/**
 * GET — connection state for the settings card (never the token).
 * DELETE — disconnect: wipe the encrypted refresh token, keep the
 * mirrored reviews (they're the venue's history either way).
 */
export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const conn = await db.gbpConnection.findUnique({
    where: { venueId: gate.venueId },
    select: {
      status: true,
      googleEmail: true,
      locationTitle: true,
      lastSyncAt: true,
      lastError: true,
    },
  });
  const reviewCount = await db.googleReview.count({ where: { venueId: gate.venueId } });
  return NextResponse.json({
    connection: conn
      ? {
          status: conn.status,
          googleEmail: conn.googleEmail,
          locationTitle: conn.locationTitle,
          lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
          lastError: conn.lastError,
        }
      : null,
    reviewCount,
  });
}

export async function DELETE(req: Request, ctx: { params: { slug: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const gate = await gateAdminRoute(ctx.params.slug, "free", "venue.edit_settings");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  await db.gbpConnection.updateMany({
    where: { venueId: gate.venueId },
    data: {
      status: "DISCONNECTED",
      encryptedRefreshToken: null,
      lastError: null,
    },
  });
  return NextResponse.json({ ok: true });
}
