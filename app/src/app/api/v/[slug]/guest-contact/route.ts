import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitAsync } from "@/lib/rate-limit";
import { isValidPhone, normalizePhone, upsertGuestContact } from "@/lib/guest-contacts";
import { recordConsent, CONSENT_TEXT_VERSION } from "@/lib/consent";
import { guestExperienceFrom } from "@/lib/guest-experience";

/**
 * Optional phone capture at the end of a visit.
 *
 * Two things happen here and they are deliberately separate:
 *
 *   1. the venue gets a way to reach the guest (GuestContact)
 *   2. the guest may, or may not, agree to marketing (MarketingConsent)
 *
 * Sending a number is not agreeing to be marketed to. `marketingConsent`
 * defaults to false and the client checkbox starts unticked; the consent
 * row is written either way so "we asked and they declined" is a fact the
 * venue can prove, not an absence they have to interpret.
 *
 * The exact wording version shown to the guest is stored with the
 * decision. If the copy changes, old consent does not silently cover the
 * new terms.
 *
 * Nothing here is required. A guest who skips this reaches the same thank
 * you screen, and their feedback — already submitted — stays anonymous.
 */

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const Body = z.object({
  sessionToken: z.string().min(1),
  phone: z.string().min(4).max(32),
  // Unticked by default on the client, and false by default here. Consent
  // has to be an action someone took.
  marketingConsent: z.boolean().default(false),
});

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true, name: true, country: true, enabledFeatures: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const config = guestExperienceFrom(venue.enabledFeatures);
  if (!config.phoneCapture) {
    return NextResponse.json({ error: "DISABLED" }, { status: 403 });
  }

  // The session token proves this guest is actually at this venue's table.
  // Without it, the endpoint would take any number for any venue.
  const claimed = await db.guestSession.findUnique({
    where: { sessionToken: parsed.sessionToken },
    select: { id: true, sessionToken: true, tableId: true, venueId: true, expiresAt: true },
  });
  if (!claimed || claimed.venueId !== venue.id) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (!tokensEqual(parsed.sessionToken, claimed.sessionToken)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (claimed.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 });
  }

  // After the token check, so knowing a session id can't burn a stranger's
  // budget. Tight: this endpoint writes PII.
  const gate = await rateLimitAsync(`guest-contact:${claimed.id}`, {
    windowMs: 60 * 60_000,
    max: 5,
  });
  if (!gate.ok) {
    return NextResponse.json({ error: "RATE_LIMITED", retryAfterMs: gate.retryAfterMs }, { status: 429 });
  }

  // Normalise against the VENUE's country, not a hardcoded +1 — a venue
  // outside the US must not have its guests' numbers silently mangled.
  const phone = normalizePhone(parsed.phone, dialCodeFor(venue.country));
  if (!phone || !isValidPhone(phone)) {
    return NextResponse.json(
      { error: "INVALID_PHONE", detail: "That doesn't look like a phone number." },
      { status: 400 },
    );
  }

  const contact = await upsertGuestContact({ venueId: venue.id, phone });

  // Written for BOTH answers. A decline is a recorded decision (PENDING),
  // not an empty row — the venue can show it asked and was told no.
  if (config.marketingConsent) {
    await recordConsent({
      guestContactId: contact.id,
      venueId: venue.id,
      granted: parsed.marketingConsent,
      source: "post_visit_feedback",
      textVersion: CONSENT_TEXT_VERSION,
    });
  }

  // Link the visit and any feedback already left, so the guestbook can
  // show a history. Best-effort: the contact is saved either way.
  await db.guestVisit
    .upsert({
      where: { guestSessionId: claimed.id },
      create: {
        venueId: venue.id,
        tableId: claimed.tableId,
        guestSessionId: claimed.id,
        guestContactId: contact.id,
      },
      update: { guestContactId: contact.id },
    })
    .catch(() => undefined);
  await db.feedbackReport
    .updateMany({ where: { sessionId: claimed.id }, data: { guestContactId: contact.id } })
    .catch(() => undefined);

  // Never echo the number back. The response says it worked, nothing more.
  return NextResponse.json({ ok: true, subscribed: parsed.marketingConsent });
}

/**
 * Dial code for the venue's country. Covers the markets TabCall actually
 * operates in; anything else falls back to +1 only because the venue's own
 * country was never set, and the E.164 check still rejects a bad result.
 */
function dialCodeFor(country: string | null): string {
  switch ((country ?? "").toUpperCase()) {
    case "GB": return "44";
    case "IE": return "353";
    case "CA": return "1";
    case "AU": return "61";
    case "NZ": return "64";
    case "NG": return "234";
    case "ZA": return "27";
    case "DE": return "49";
    case "FR": return "33";
    case "ES": return "34";
    case "IT": return "39";
    case "NL": return "31";
    default:   return "1";
  }
}
