import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getStaffSession } from "@/lib/auth/session";

/**
 * Stripe Connect Express onboarding link generator.
 *
 * Today the settings page reads "Email TabCall — we'll attach your
 * Stripe Express account on a 5-minute call." That phrase exists
 * because there was no endpoint to mint an onboarding link. This
 * route closes that gap so the manager can self-serve.
 *
 * Idempotent: if the venue already has `stripeAccountId`, we mint a
 * fresh AccountLink against the existing account (Stripe scopes
 * onboarding completeness to the account, not the link). If not,
 * we create the Express account first.
 *
 * Auth: any staff at the venue. Bartenders shouldn't be doing this
 * but the schema doesn't yet distinguish manager vs staff — see
 * audit P1 #16. Tracked separately.
 */
function originFromRequest(req: Request): string {
  const fwdProto = req.headers.get("x-forwarded-proto");
  const fwdHost = req.headers.get("x-forwarded-host");
  const host = fwdHost ?? req.headers.get("host");
  if (host) {
    const proto = fwdProto ?? (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  return process.env.APP_URL ?? "http://localhost:3000";
}

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const venue = await db.venue.findUnique({ where: { slug: ctx.params.slug } });
  if (!venue) return NextResponse.json({ error: "VENUE_NOT_FOUND" }, { status: 404 });
  if (venue.id !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const origin = originFromRequest(req);
  const refresh_url = `${origin}/admin/v/${venue.slug}/settings?stripe=refresh`;
  const return_url = `${origin}/admin/v/${venue.slug}/settings?stripe=return`;

  let accountId = venue.stripeAccountId;
  try {
    if (!accountId) {
      // Express keeps onboarding lightweight (no full Stripe Dashboard
      // for the venue). card_payments + transfers are the minimum
      // capabilities for Connect destination-charges with an
      // application_fee_amount.
      const acct = await stripe().accounts.create({
        type: "express",
        country: "US",
        email: session.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "company",
        metadata: {
          tabcall_venue_id: venue.id,
          tabcall_venue_slug: venue.slug,
        },
      });
      accountId = acct.id;
      await db.venue.update({
        where: { id: venue.id },
        data: { stripeAccountId: accountId },
      });
    }

    const link = await stripe().accountLinks.create({
      account: accountId,
      refresh_url,
      return_url,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: link.url });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "stripe error";
    console.error("[stripe.connect] failed:", detail);
    return NextResponse.json(
      { error: "STRIPE_ERROR", detail },
      { status: 502 }
    );
  }
}
