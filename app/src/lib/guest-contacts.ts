import "server-only";

/**
 * Guest contacts — a phone number one venue holds for one guest.
 *
 * Two rules this module exists to enforce:
 *
 *  1. Scope. A contact belongs to a venue, not to TabCall. The same number
 *     at two venues is two rows, two relationships, two consent decisions.
 *     Every read here takes a venueId and no caller can opt out of it.
 *
 *  2. Exposure. A phone number is the most sensitive thing this product
 *     stores about a guest, and floor staff have no reason to see one — a
 *     server needs to know table 12 wants water, not who is sitting there.
 *     `canSeeGuestPhone` is the gate, and `maskPhone` is what everyone
 *     else gets.
 */

import { db } from "@/lib/db";
import type { StaffRole } from "@prisma/client";

/**
 * Roles allowed to see a full guest phone number.
 *
 * Deliberately not the same list as "can see the guestbook": a manager can
 * open the Guestbook and work with visit counts and ratings without the
 * numbers being on screen. Only these roles get the digits.
 */
const PHONE_VISIBLE_ROLES: readonly StaffRole[] = ["OWNER", "MANAGER"];

export function canSeeGuestPhone(role: StaffRole | string): boolean {
  // Legacy STAFF rows pre-date RBAC and were venue creators — normalised
  // to OWNER everywhere else in the app, so normalise here too.
  const normalized = role === "STAFF" ? "OWNER" : role;
  return PHONE_VISIBLE_ROLES.includes(normalized as StaffRole);
}

/**
 * What a caller without phone permission sees. Keeps the last two digits
 * so a manager reading it aloud to an owner can confirm they mean the same
 * guest, which is the only legitimate reason to show any of it.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  return `•••• ${digits.slice(-2)}`;
}

/** E.164, which is what every messaging provider expects. */
const E164 = /^\+[1-9]\d{7,14}$/;

export function isValidPhone(phone: string): boolean {
  return E164.test(phone.trim());
}

/**
 * Best-effort normalisation of what a guest actually types on a phone
 * keypad: spaces, dashes, brackets, and a leading 0 or 00.
 *
 * `defaultCountryCode` comes from the venue, so a US venue's guest typing
 * a 10-digit local number gets +1 without being asked for a country they
 * are standing in. Returns null when the result still isn't E.164 rather
 * than guessing — a wrong number is worse than no number.
 */
export function normalizePhone(raw: string, defaultCountryCode = "1"): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const candidate = "+" + trimmed.slice(1).replace(/\D/g, "");
    return E164.test(candidate) ? candidate : null;
  }

  let digits = trimmed.replace(/\D/g, "");
  // International prefix typed as 00.
  if (digits.startsWith("00")) {
    const candidate = "+" + digits.slice(2);
    return E164.test(candidate) ? candidate : null;
  }
  // National trunk prefix.
  if (digits.startsWith("0")) digits = digits.slice(1);

  const candidate = `+${defaultCountryCode}${digits}`;
  return E164.test(candidate) ? candidate : null;
}

/**
 * Find or create the contact for a phone at a venue, and touch lastSeenAt.
 *
 * Creating a contact grants nothing on its own — consent is a separate
 * record that starts PENDING. See lib/consent.
 */
export async function upsertGuestContact(opts: {
  venueId: string;
  phone: string;
}): Promise<{ id: string; isNew: boolean }> {
  const existing = await db.guestContact.findUnique({
    where: { venueId_phone: { venueId: opts.venueId, phone: opts.phone } },
    select: { id: true },
  });
  if (existing) {
    await db.guestContact.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date() },
    });
    return { id: existing.id, isNew: false };
  }
  const created = await db.guestContact.create({
    data: { venueId: opts.venueId, phone: opts.phone },
    select: { id: true },
  });
  return { id: created.id, isNew: true };
}
