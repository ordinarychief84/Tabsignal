import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import {
  gbpEnabled,
  gbpAccessToken,
  listGbpAccounts,
  listGbpLocations,
} from "@/domain/reviews/gbp";

/**
 * GET /api/admin/v/[slug]/gbp/locations — the location picker feed after
 * consent: every location across the connected Google account(s), so the
 * owner can bind their venue to the right listing.
 */
export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  if (!gbpEnabled()) {
    return NextResponse.json({ error: "GBP_NOT_CONFIGURED" }, { status: 503 });
  }
  const gate = await gateAdminRoute(ctx.params.slug, "free");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const conn = await db.gbpConnection.findUnique({ where: { venueId: gate.venueId } });
  if (!conn?.encryptedRefreshToken) {
    return NextResponse.json({ error: "NOT_CONNECTED" }, { status: 409 });
  }

  try {
    const accessToken = await gbpAccessToken(conn.encryptedRefreshToken);
    const accounts = await listGbpAccounts(accessToken);
    const out: { accountName: string; locationName: string; title: string }[] = [];
    // Cap account fan-out — an agency-managed Google login can hold
    // hundreds; three accounts covers every realistic owner login.
    for (const account of accounts.slice(0, 3)) {
      const locations = await listGbpLocations(accessToken, account.name);
      for (const loc of locations) {
        out.push({
          accountName: account.name,
          locationName: loc.name,
          title: loc.title ?? loc.name,
        });
      }
    }
    return NextResponse.json({ locations: out });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Google's API-access gate shows up here as 403s: surface a
    // distinct code so the settings card can explain the approval step.
    const status = message.includes("403") ? 502 : 500;
    return NextResponse.json({ error: "GBP_API_ERROR", detail: message }, { status });
  }
}
