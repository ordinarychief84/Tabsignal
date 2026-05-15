import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";

/**
 * Constant-time string compare. Same shape as the helpers inlined in
 * /api/requests, /api/realtime/token, and /api/v/[slug]/bills/[billId]/splits.
 *
 * The qrToken lookup that uses this is already behind an indexed
 * `findFirst`, so the timing window is small — but a `!==` short-circuit
 * still leaks prefix-match microseconds and the audit flagged it
 * (Finding #7, SECURITY_AUDIT_2026_05_13.md).
 */
function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export type ResolvedSession = {
  sessionId: string;
  sessionToken: string;
  venueId: string;
  tableId: string;
  venueName: string;
  tableLabel: string;
  slug: string;
};

type VenueRef = { id: string; name: string; slug: string };
type TableRef = { id: string; label: string };

/**
 * Find a live GuestSession for (venue, table) or mint a new one. Shared
 * between the legacy `/v/[slug]/t/[tableId]` route and the flat
 * `/guest/[qrToken]` route — both end up here.
 */
async function findOrCreateLiveSession(
  venue: VenueRef,
  table: TableRef,
): Promise<ResolvedSession> {
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
      slug: venue.slug,
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
    slug: venue.slug,
  };
}

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
  const table = await db.table.findFirst({
    where: { venueId: venue.id, OR: [{ id: tableIdOrLabel }, { label: tableIdOrLabel }] },
  });
  if (!table) throw new Error("TABLE_NOT_FOUND");

  if (!qrToken || !tokensEqual(qrToken, table.qrToken)) {
    throw new Error("INVALID_TOKEN");
  }

  return findOrCreateLiveSession(
    { id: venue.id, name: venue.name, slug: venue.slug },
    { id: table.id, label: table.label },
  );
}

/**
 * Resolves a guest landing on the flat /guest/[qrToken] route. The token
 * itself identifies the table — no slug or table id in the URL.
 *
 * Throws "TABLE_NOT_FOUND" if the qrToken matches no table; throws
 * "VENUE_NOT_FOUND" if the table somehow lacks a venue (shouldn't happen
 * given the FK, but we belt-and-suspenders for the page's error handler).
 */
export async function resolveByQrToken(
  qrToken: string,
): Promise<ResolvedSession> {
  if (!qrToken) throw new Error("TABLE_NOT_FOUND");

  const table = await db.table.findUnique({
    where: { qrToken },
    include: {
      venue: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!table) throw new Error("TABLE_NOT_FOUND");
  if (!table.venue) throw new Error("VENUE_NOT_FOUND");

  return findOrCreateLiveSession(
    { id: table.venue.id, name: table.venue.name, slug: table.venue.slug },
    { id: table.id, label: table.label },
  );
}
