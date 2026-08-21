import "server-only";

/**
 * Marketing consent.
 *
 * A phone number and permission to text it are two different things, and
 * conflating them is how venues end up on the wrong side of the TCPA. So:
 *
 *   - Leaving a number creates a GuestContact and nothing else.
 *   - Consent is a separate record, defaulting to PENDING, which is NOT
 *     marketable.
 *   - The exact wording shown at the moment of opting in is stored with
 *     the consent. If the wording changes, prior consent does not silently
 *     cover the new terms.
 *
 * `marketableContactIds` is the ONLY approved way to build a promotional
 * send list. Campaign code must not query GuestContact directly.
 */

import { db } from "@/lib/db";
import type { MarketingConsentStatus } from "@prisma/client";

/**
 * The current consent wording. Bump the version whenever the TEXT below
 * changes — the version is what proves which terms a guest agreed to, so
 * editing the copy without bumping it silently backdates the new wording
 * onto everyone who consented to the old one.
 */
export const CONSENT_TEXT_VERSION = "2026-08-21.v1";

export function consentText(venueName: string): string {
  return (
    `I agree to receive marketing text messages from ${venueName}. ` +
    `Message frequency may vary. Message and data rates may apply. ` +
    `Reply STOP to unsubscribe.`
  );
}

/** Where a consent decision came from, for the audit trail. */
export type ConsentSource = "post_visit_feedback" | "admin" | "import" | "guest_reply";

/**
 * Record a consent decision. Idempotent per (contact, venue): the current
 * decision is updated in place and always carries the version of the text
 * that produced it.
 *
 * `granted: false` is a real, recordable answer — "we asked and they said
 * no" is worth knowing, and is why PENDING and UNSUBSCRIBED are distinct.
 */
export async function recordConsent(opts: {
  guestContactId: string;
  venueId: string;
  granted: boolean;
  source: ConsentSource;
  textVersion?: string;
}): Promise<void> {
  const now = new Date();
  const status: MarketingConsentStatus = opts.granted ? "SUBSCRIBED" : "PENDING";
  const existing = await db.marketingConsent.findFirst({
    where: { guestContactId: opts.guestContactId, venueId: opts.venueId },
    select: { id: true },
  });

  const data = {
    status,
    consentTextVersion: opts.textVersion ?? CONSENT_TEXT_VERSION,
    consentSource: opts.source,
    consentedAt: opts.granted ? now : null,
    // Granting again after an opt-out clears the opt-out; declining does
    // not manufacture one, because never-said-yes is not the same as
    // asked-us-to-stop.
    ...(opts.granted ? { optedOutAt: null } : {}),
  };

  if (existing) {
    await db.marketingConsent.update({ where: { id: existing.id }, data });
    return;
  }
  await db.marketingConsent.create({
    data: { guestContactId: opts.guestContactId, venueId: opts.venueId, ...data },
  });
}

/**
 * Unsubscribe. Terminal by design: nothing in this codebase flips an
 * UNSUBSCRIBED row back to SUBSCRIBED except an explicit new opt-in from
 * the guest via recordConsent.
 */
export async function optOut(opts: {
  guestContactId: string;
  venueId: string;
}): Promise<void> {
  const now = new Date();
  const existing = await db.marketingConsent.findFirst({
    where: { guestContactId: opts.guestContactId, venueId: opts.venueId },
    select: { id: true },
  });
  if (!existing) {
    await db.marketingConsent.create({
      data: {
        guestContactId: opts.guestContactId,
        venueId: opts.venueId,
        status: "UNSUBSCRIBED",
        optedOutAt: now,
        consentSource: "guest_reply",
      },
    });
    return;
  }
  await db.marketingConsent.update({
    where: { id: existing.id },
    data: { status: "UNSUBSCRIBED", optedOutAt: now, consentedAt: null },
  });
}

/**
 * Contacts a venue may legally send PROMOTIONAL messages to.
 *
 * Everything routes through here on purpose. A campaign that built its own
 * recipient query would be one forgotten `where` away from texting people
 * who never agreed, so this is the single chokepoint and the campaign code
 * has no other way to get a list.
 */
export async function marketableContactIds(venueId: string): Promise<string[]> {
  const rows = await db.marketingConsent.findMany({
    where: {
      venueId,
      status: "SUBSCRIBED",
      // Belt and braces: SUBSCRIBED with an opt-out date shouldn't exist,
      // but if it ever does, the opt-out wins.
      optedOutAt: null,
    },
    select: { guestContactId: true },
  });
  return [...new Set(rows.map(r => r.guestContactId))];
}

/** Current status for one contact at one venue. Absent means PENDING. */
export async function consentStatusFor(
  guestContactId: string,
  venueId: string,
): Promise<MarketingConsentStatus> {
  const row = await db.marketingConsent.findFirst({
    where: { guestContactId, venueId },
    select: { status: true, optedOutAt: true },
  });
  if (!row) return "PENDING";
  if (row.optedOutAt) return "UNSUBSCRIBED";
  return row.status;
}
