import { randomBytes } from "node:crypto";
import { db } from "./db";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export type ResolvedSession = {
  sessionId: string;
  sessionToken: string;
  venueId: string;
  tableId: string;
  venueName: string;
  tableLabel: string;
};

/**
 * Resolves a guest landing on /v/[slug]/t/[tableId]?s=[token].
 * - Validates that the venue + table exist.
 * - REQUIRES the qrToken to match the table's qrToken — otherwise anyone who
 *   guesses `slug` + a table id/label could resolve to the active session and
 *   pull its sessionToken, hijacking the tab (submit requests, add line
 *   items, post feedback, create splits, complete payment).
 * - Reuses an existing un-expired GuestSession or creates a new one.
 *
 * Throws on invalid venue, invalid table, missing or wrong token.
 */
export async function resolveGuestSession(
  slug: string,
  tableIdOrLabel: string,
  qrToken: string | null
): Promise<ResolvedSession> {
  const venue = await db.venue.findUnique({ where: { slug } });
  if (!venue) throw new Error("VENUE_NOT_FOUND");

  // tableIdOrLabel can be a cuid (id) or a slugified label — try id first.
  let table = await db.table.findFirst({
    where: { venueId: venue.id, OR: [{ id: tableIdOrLabel }, { label: tableIdOrLabel }] },
  });
  if (!table) throw new Error("TABLE_NOT_FOUND");

  if (!qrToken || qrToken !== table.qrToken) {
    throw new Error("INVALID_TOKEN");
  }

  const now = new Date();

  const existing = await db.guestSession.findFirst({
    where: {
      venueId: venue.id,
      tableId: table.id,
      expiresAt: { gt: now },
      paidAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return {
      sessionId: existing.id,
      sessionToken: existing.sessionToken,
      venueId: venue.id,
      tableId: table.id,
      venueName: venue.name,
      tableLabel: table.label,
    };
  }

  const session = await db.guestSession.create({
    data: {
      venueId: venue.id,
      tableId: table.id,
      sessionToken: randomBytes(24).toString("hex"),
      expiresAt: new Date(now.getTime() + EIGHT_HOURS_MS),
    },
  });

  return {
    sessionId: session.id,
    sessionToken: session.sessionToken,
    venueId: venue.id,
    tableId: table.id,
    venueName: venue.name,
    tableLabel: table.label,
  };
}
