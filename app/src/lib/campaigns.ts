import "server-only";

/**
 * Campaigns.
 *
 * The management layer is real: campaigns persist, audiences resolve
 * against actual consent records, recipients are materialised, and a
 * send is idempotent. What is NOT real is delivery — TabCall has no SMS
 * provider configured. Only transactional email (Resend) is wired up, and
 * email is not what these campaigns are.
 *
 * So `dispatch` refuses to run without a provider and says exactly why.
 * Nothing in here marks a message as SENT that was never sent, and no
 * campaign shows a delivery figure it can't stand behind. A venue owner
 * reading "Sent 240" needs that to be 240 phones that buzzed.
 *
 * Wiring a provider means implementing `MessageSender` and passing it to
 * `dispatchCampaign`. Everything else already works.
 */

import { db } from "@/lib/db";
import { marketableContactIds } from "@/lib/consent";
import type { CampaignAudience } from "@prisma/client";

/** Days that count as a "recent" visit for the 30-day audience. */
const RECENT_DAYS = 30;

/**
 * Resolve an audience to contact ids.
 *
 * Every branch starts from `marketableContactIds`, which is the consent
 * chokepoint, and narrows from there. Nothing here queries GuestContact
 * directly — that would be one forgotten `where` away from texting people
 * who never agreed.
 */
export async function resolveAudience(
  venueId: string,
  audience: CampaignAudience,
): Promise<string[]> {
  const consented = await marketableContactIds(venueId);
  if (consented.length === 0) return [];

  if (audience === "ALL_SUBSCRIBED") return consented;

  if (audience === "VISITED_LAST_30_DAYS") {
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
    const rows = await db.guestVisit.findMany({
      where: {
        venueId,
        guestContactId: { in: consented },
        startedAt: { gte: since },
      },
      select: { guestContactId: true },
      distinct: ["guestContactId"],
    });
    return rows.map(r => r.guestContactId!).filter(Boolean);
  }

  // RETURNING_GUESTS — more than one recorded visit at THIS venue.
  const rows = await db.guestVisit.groupBy({
    by: ["guestContactId"],
    where: { venueId, guestContactId: { in: consented } },
    _count: { _all: true },
  });
  return rows
    .filter(r => r.guestContactId && r._count._all > 1)
    .map(r => r.guestContactId!);
}

export type AudiencePreview = {
  audience: CampaignAudience;
  /** How many people would receive this, right now. */
  count: number;
};

export async function previewAudience(
  venueId: string,
  audience: CampaignAudience,
): Promise<AudiencePreview> {
  const ids = await resolveAudience(venueId, audience);
  return { audience, count: ids.length };
}

/**
 * Materialise recipients for a campaign.
 *
 * Idempotent through the unique index on (campaignId, guestContactId):
 * running this twice cannot produce a duplicate send, and that guarantee
 * lives in the database rather than in a code path someone might change.
 *
 * Re-running also picks up nobody who has since unsubscribed, because the
 * audience is resolved fresh each time.
 */
export async function materialiseRecipients(campaignId: string): Promise<number> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, venueId: true, audienceType: true },
  });
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");

  const ids = await resolveAudience(campaign.venueId, campaign.audienceType);
  if (ids.length === 0) return 0;

  const result = await db.campaignRecipient.createMany({
    data: ids.map(guestContactId => ({ campaignId, guestContactId })),
    skipDuplicates: true,
  });
  return result.count;
}

/** What a real provider integration has to implement. */
export type MessageSender = {
  name: string;
  send(opts: { to: string; body: string }): Promise<{ ok: boolean; error?: string }>;
};

export type DispatchResult =
  | { ok: false; reason: "NO_PROVIDER"; detail: string; eligible: number }
  | { ok: true; attempted: number; delivered: number; failed: number };

/**
 * Send a campaign.
 *
 * With no provider this returns NO_PROVIDER and changes nothing — the
 * campaign stays where it was and the venue is told plainly that outbound
 * messaging isn't configured. It does still report how many people WOULD
 * be reached, because that number is real and useful.
 */
export async function dispatchCampaign(
  campaignId: string,
  sender: MessageSender | null,
): Promise<DispatchResult> {
  const eligible = await materialiseRecipients(campaignId);

  if (!sender) {
    return {
      ok: false,
      reason: "NO_PROVIDER",
      detail:
        "No SMS provider is configured, so nothing was sent. The campaign and its " +
        "audience are saved. Connect a provider to send.",
      eligible,
    };
  }

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, message: true },
  });
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");

  await db.campaign.update({
    where: { id: campaignId },
    data: { status: "SENDING" },
  });

  // PENDING only — a retry after a partial failure must not re-send to
  // anyone already delivered.
  const pending = await db.campaignRecipient.findMany({
    where: { campaignId, status: "PENDING" },
    select: { id: true, guestContact: { select: { phone: true } } },
  });

  let delivered = 0;
  let failed = 0;
  for (const recipient of pending) {
    const result = await sender.send({
      to: recipient.guestContact.phone,
      body: campaign.message,
    });
    if (result.ok) {
      delivered++;
      await db.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
    } else {
      failed++;
      await db.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "FAILED", failedAt: new Date(), failureReason: result.error ?? null },
      });
    }
  }

  await db.campaign.update({
    where: { id: campaignId },
    data: {
      status: failed > 0 && delivered === 0 ? "FAILED" : "SENT",
      sentAt: new Date(),
    },
  });

  return { ok: true, attempted: pending.length, delivered, failed };
}

/**
 * The configured provider, or null.
 *
 * Deliberately returns null today. When a provider is added, this is the
 * one place that changes and everything above starts working — no other
 * code needs to know which provider it is.
 */
export function configuredSender(): MessageSender | null {
  return null;
}

/** For the UI, so an owner knows why the send button is disabled. */
export function messagingConfigured(): boolean {
  return configuredSender() !== null;
}
