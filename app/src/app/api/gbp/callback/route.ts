import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { appOrigin } from "@/lib/origin";
import {
  gbpEnabled,
  verifyGbpState,
  exchangeGbpCode,
  encryptRefreshToken,
} from "@/domain/reviews/gbp";

/**
 * GET /api/gbp/callback — Google redirects here after the venue owner
 * consents to Business Profile access. ONE registered redirect URI for
 * every venue: the signed state JWT carries the tenant.
 *
 * Defense: the browser completing the callback must hold the SAME staff
 * session that initiated the connect (state.staffId) — a leaked
 * callback URL is useless in anyone else's browser.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = appOrigin(req);
  const fail = (slug: string | null, code: string) =>
    NextResponse.redirect(
      `${origin}/admin/v/${slug ?? ""}/settings?gbp_error=${encodeURIComponent(code)}`,
    );

  if (!gbpEnabled()) return fail(null, "not_configured");

  const stateToken = url.searchParams.get("state") ?? "";
  const state = await verifyGbpState(stateToken);
  if (!state) return fail(null, "state");

  const session = await getStaffSession();
  if (!session || session.staffId !== state.staffId || session.venueId !== state.venueId) {
    return fail(state.slug, "session_mismatch");
  }

  const oauthError = url.searchParams.get("error");
  if (oauthError) return fail(state.slug, oauthError);

  const code = url.searchParams.get("code");
  if (!code) return fail(state.slug, "missing_code");

  try {
    const tokens = await exchangeGbpCode(origin, code);
    await db.gbpConnection.upsert({
      where: { venueId: state.venueId },
      create: {
        venueId: state.venueId,
        googleEmail: tokens.email,
        encryptedRefreshToken: encryptRefreshToken(tokens.refreshToken),
        status: "PENDING", // becomes CONNECTED once a location is bound
      },
      update: {
        googleEmail: tokens.email,
        encryptedRefreshToken: encryptRefreshToken(tokens.refreshToken),
        status: "PENDING",
        lastError: null,
      },
    });
  } catch (err) {
    console.error("[gbp/callback] exchange failed", {
      slug: state.slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return fail(state.slug, "exchange");
  }

  return NextResponse.redirect(`${origin}/admin/v/${state.slug}/settings?gbp=connected`);
}
