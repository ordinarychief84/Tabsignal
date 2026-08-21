import "server-only";

/**
 * The Guestbook: who a venue has met, and what happened.
 *
 * The phone rule is enforced here, not in the page. A view that decides
 * for itself whether to render a number is a view that can get it wrong,
 * and there are several views. So this returns rows where the phone is
 * ALREADY either the real number or a mask, based on the caller's role —
 * an unauthorised caller never receives the digits at all, which means a
 * template bug can't leak them either.
 */

import { db } from "@/lib/db";
import { canSeeGuestPhone, maskPhone } from "@/lib/guest-contacts";
import { consentStatusFor } from "@/lib/consent";
import type { StaffRole, MarketingConsentStatus } from "@prisma/client";

export type GuestbookRow = {
  id: string;
  /** Real digits only for roles that may see them; otherwise masked. */
  phone: string;
  phoneVisible: boolean;
  visits: number;
  lastVisitAt: string | null;
  firstSeenAt: string;
  latestRating: number | null;
  marketing: MarketingConsentStatus;
};

export async function listGuests(opts: {
  venueId: string;
  role: StaffRole | string;
  search?: string;
  take?: number;
}): Promise<GuestbookRow[]> {
  const showPhone = canSeeGuestPhone(opts.role);
  const take = Math.min(opts.take ?? 100, 200);

  const contacts = await db.guestContact.findMany({
    // venueId is not optional and not caller-controlled beyond this call:
    // one venue's guestbook can never contain another's.
    where: {
      venueId: opts.venueId,
      ...(opts.search?.trim()
        ? { phone: { contains: opts.search.replace(/\D/g, "") } }
        : {}),
    },
    orderBy: { lastSeenAt: "desc" },
    take,
    select: {
      id: true,
      phone: true,
      firstSeenAt: true,
      lastSeenAt: true,
      _count: { select: { visits: true } },
      visits: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { startedAt: true, rating: true },
      },
      feedback: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { rating: true },
      },
      consents: {
        where: { venueId: opts.venueId },
        select: { status: true, optedOutAt: true },
        take: 1,
      },
    },
  });

  return contacts.map(c => {
    const consent = c.consents[0];
    const marketing: MarketingConsentStatus = !consent
      ? "PENDING"
      : consent.optedOutAt
        ? "UNSUBSCRIBED"
        : consent.status;
    return {
      id: c.id,
      phone: showPhone ? c.phone : maskPhone(c.phone),
      phoneVisible: showPhone,
      visits: c._count.visits,
      lastVisitAt: c.visits[0]?.startedAt.toISOString() ?? c.lastSeenAt.toISOString(),
      firstSeenAt: c.firstSeenAt.toISOString(),
      latestRating: c.visits[0]?.rating ?? c.feedback[0]?.rating ?? null,
      marketing,
    };
  });
}

export type GuestProfileView = {
  id: string;
  phone: string;
  phoneVisible: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  totalVisits: number;
  marketing: MarketingConsentStatus;
  consentTextVersion: string | null;
  consentedAt: string | null;
  feedback: {
    id: string;
    rating: number;
    sentiment: string | null;
    note: string | null;
    tags: string[];
    createdAt: string;
  }[];
  campaigns: { name: string; status: string; sentAt: string | null }[];
};

/**
 * One guest's history at one venue.
 *
 * Returns null when the contact belongs to a different venue — the caller
 * gets the same answer as for a contact that doesn't exist, so the id
 * can't be used to probe another venue's guest list.
 */
export async function guestProfile(opts: {
  venueId: string;
  contactId: string;
  role: StaffRole | string;
}): Promise<GuestProfileView | null> {
  const showPhone = canSeeGuestPhone(opts.role);

  const contact = await db.guestContact.findFirst({
    where: { id: opts.contactId, venueId: opts.venueId },
    select: {
      id: true,
      phone: true,
      firstSeenAt: true,
      lastSeenAt: true,
      _count: { select: { visits: true } },
      feedback: {
        where: { venueId: opts.venueId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, rating: true, sentiment: true, note: true, createdAt: true,
          tags: { select: { tag: true } },
        },
      },
      consents: {
        where: { venueId: opts.venueId },
        select: { status: true, optedOutAt: true, consentTextVersion: true, consentedAt: true },
        take: 1,
      },
      campaignRecipients: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          status: true,
          deliveredAt: true,
          campaign: { select: { name: true, venueId: true, sentAt: true } },
        },
      },
    },
  });
  if (!contact) return null;

  const consent = contact.consents[0];
  const marketing: MarketingConsentStatus = !consent
    ? "PENDING"
    : consent.optedOutAt
      ? "UNSUBSCRIBED"
      : consent.status;

  return {
    id: contact.id,
    phone: showPhone ? contact.phone : maskPhone(contact.phone),
    phoneVisible: showPhone,
    firstSeenAt: contact.firstSeenAt.toISOString(),
    lastSeenAt: contact.lastSeenAt.toISOString(),
    totalVisits: contact._count.visits,
    marketing,
    consentTextVersion: consent?.consentTextVersion ?? null,
    consentedAt: consent?.consentedAt?.toISOString() ?? null,
    feedback: contact.feedback.map(f => ({
      id: f.id,
      rating: f.rating,
      sentiment: f.sentiment,
      note: f.note,
      tags: f.tags.map(t => t.tag),
      createdAt: f.createdAt.toISOString(),
    })),
    campaigns: contact.campaignRecipients
      // A contact is venue-scoped, so its campaigns are too — but filter
      // anyway rather than trusting the join.
      .filter(r => r.campaign.venueId === opts.venueId)
      .map(r => ({
        name: r.campaign.name,
        status: r.status,
        sentAt: r.deliveredAt?.toISOString() ?? r.campaign.sentAt?.toISOString() ?? null,
      })),
  };
}

/** Headline numbers for the Guestbook page. */
export async function guestbookStats(venueId: string) {
  const [contacts, subscribed, returning] = await Promise.all([
    db.guestContact.count({ where: { venueId } }),
    db.marketingConsent.count({ where: { venueId, status: "SUBSCRIBED", optedOutAt: null } }),
    db.guestVisit.groupBy({
      by: ["guestContactId"],
      where: { venueId, guestContactId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  return {
    contacts,
    subscribed,
    returning: returning.filter(r => r._count._all > 1).length,
  };
}

export { consentStatusFor };
