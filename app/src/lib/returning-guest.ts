import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { PROFILE_COOKIE, verifyProfileToken } from "@/lib/profile-cookie";

/**
 * Is this someone who has been here before?
 *
 * HOW THEY ARE RECOGNISED, and how they are not.
 *
 * The only signal used is the profile cookie, which is issued after a
 * guest entered their phone number and verified a one-time code. That is
 * an identity the guest deliberately handed over and can throw away by
 * clearing their browser.
 *
 * No device fingerprinting. No IP matching. No probabilistic "this looks
 * like the same phone" heuristics. Those recognise people who never
 * agreed to be recognised, and getting one wrong means greeting a
 * stranger by another guest's history in front of their table.
 *
 * WHAT COUNTS AS A VISIT is a previous scan at THIS venue while carrying
 * that identity. Per-venue by construction: being a regular at one
 * restaurant tells another restaurant in the same group nothing, and
 * quietly sharing it across an org would be a privacy decision nobody
 * asked for.
 *
 * WHAT NEVER LEAVES THIS FUNCTION: the phone number, the profile id, and
 * anything about previous visits beyond how many. Staff see none of it —
 * a server should not be shown what a guest said about them last time.
 */

export type ReturningGuest = {
  /** Scans at this venue before the current one. Always >= 1. */
  previousVisits: number;
  /** Their first name, if they told the venue one. Never a surname. */
  firstName: string | null;
};

export async function returningGuestFor({
  venueId,
  sessionId,
}: {
  venueId: string;
  /** Excluded from the count — this visit isn't a previous one. */
  sessionId: string;
}): Promise<ReturningGuest | null> {
  const token = cookies().get(PROFILE_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyProfileToken(token);
  if (!claims?.profileId) return null;

  // The cookie is signed, but a profile can be deleted after one was
  // issued — resolve it rather than trusting the claim to still mean
  // something.
  const profile = await db.guestProfile.findUnique({
    where: { id: claims.profileId },
    select: { id: true, displayName: true },
  });
  if (!profile) return null;

  const previousVisits = await db.guestSession.count({
    where: {
      venueId,
      guestProfileId: profile.id,
      id: { not: sessionId },
    },
  });
  if (previousVisits <= 0) return null;

  return { previousVisits, firstName: firstNameOf(profile.displayName) };
}

/**
 * First name only.
 *
 * "Welcome back, Alexandra Okonkwo" reads like a database. It's also
 * more of someone's identity than needs to be on a screen a whole table
 * can see.
 */
function firstNameOf(name: string | null): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0];
  if (!first || first.length > 24) return null;
  return first;
}

/**
 * The greeting itself.
 *
 * Warm, short, and says nothing about what they did last time. A guest
 * being told "welcome back, you had the ribeye" is being told the
 * restaurant keeps notes on them, which is a different product and a
 * conversation they haven't been asked to have.
 */
export function welcomeBackLine(guest: ReturningGuest, venueName: string): string {
  return guest.firstName
    ? `Welcome back, ${guest.firstName}`
    : `Welcome back to ${venueName}`;
}
