import "server-only";
import { db } from "@/lib/db";
// Re-exported so server callers keep one import; the implementation
// lives outside this module because client components need it too.
export { formatWait } from "@/lib/wait-format";
import { serviceThresholdsFrom } from "@/lib/service-sla";

/**
 * Everything the waiter console needs, in one server pass.
 *
 * A server opens this on a phone behind a bar with two bars of signal.
 * Four round trips to paint a screen is four chances to be looking at a
 * spinner while a table waits, so the page loads once and the live parts
 * update over the socket that is already open.
 *
 * WHAT IS DELIBERATELY NOT HERE: guest phone numbers, marketing consent,
 * campaign membership, guest profiles, notes, anything from a previous
 * visit. A server needs to know who is waiting, where, for what, and how
 * long. Everything else is somebody else's business, and a shared
 * service tablet is the worst possible place to keep it.
 */

export type TableState = "needs_attention" | "new_request" | "in_progress" | "clear";

export type WaiterTable = {
  id: string;
  label: string;
  zone: string | null;
  /** Whether this waiter is assigned to it. */
  mine: boolean;
  state: TableState;
  openRequests: number;
  /** Seconds the oldest open request has been waiting. Null when clear. */
  oldestWaitSeconds: number | null;
  /** How many items the table has shortlisted. Counts only, never who. */
  pickCount: number;
  /** A live guest session is open at this table. */
  occupied: boolean;
};

export type ShiftSummary = {
  /** Open requests at this waiter's tables. */
  activeRequests: number;
  /** Of those, how many nobody has claimed. */
  newRequests: number;
  /** Median seconds from routed to acknowledged, this shift. Null if none. */
  responseSeconds: number | null;
  /** Requests this waiter resolved since their shift started. */
  completedThisShift: number;
  /** Mean guest rating at this venue today, out of 5. Null when none. */
  rating: number | null;
  ratingCount: number;
};

/**
 * A guest's shortlist, for the table the waiter is standing at.
 *
 * Informational only. TabCall does not place orders — the venue's POS
 * still takes them — so this is a list to talk through, not a ticket.
 */
export type TablePick = { name: string; quantity: number };

/**
 * The floor, from this waiter's point of view.
 *
 * Returns their own tables first and the rest of the venue after, so a
 * console can show "mine" by default and still let someone covering a
 * section see the whole room. Nothing here is filtered by permission —
 * the caller has already established this is the waiter's own venue.
 */
export async function waiterTables({
  venueId,
  staffId,
  now = new Date(),
}: {
  venueId: string;
  staffId: string;
  now?: Date;
}): Promise<WaiterTable[]> {
  // The venue's own promise. Was a module constant, which meant the map
  // could call a table late while the queue beside it still called it
  // fine.
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { enabledFeatures: true },
  });
  const thresholds = serviceThresholdsFrom(venue?.enabledFeatures);

  const [tables, openRequests, sessions, picks] = await Promise.all([
    db.table.findMany({
      where: { venueId },
      select: {
        id: true,
        label: true,
        zone: true,
        assignments: { select: { staffMemberId: true } },
      },
      orderBy: { label: "asc" },
    }),
    db.request.findMany({
      where: {
        venueId,
        status: { in: ["PENDING", "ACKNOWLEDGED", "ON_MY_WAY", "ESCALATED"] },
      },
      select: { tableId: true, status: true, createdAt: true },
    }),
    db.guestSession.findMany({
      where: { venueId, expiresAt: { gt: now }, paidAt: null },
      select: { tableId: true },
    }),
    db.wishlistItem.findMany({
      where: {
        wishlist: {
          venueId,
          status: "ACTIVE",
          guestSession: { expiresAt: { gt: now }, paidAt: null },
        },
      },
      select: { quantity: true, wishlist: { select: { tableId: true } } },
    }),
  ]);

  const byTable = new Map<string, { open: number; unclaimed: number; oldest: number }>();
  for (const r of openRequests) {
    const age = Math.floor((now.getTime() - r.createdAt.getTime()) / 1000);
    const cur = byTable.get(r.tableId) ?? { open: 0, unclaimed: 0, oldest: 0 };
    cur.open += 1;
    if (r.status === "PENDING" || r.status === "ESCALATED") cur.unclaimed += 1;
    cur.oldest = Math.max(cur.oldest, age);
    byTable.set(r.tableId, cur);
  }

  const occupied = new Set(sessions.map(s => s.tableId));
  const pickCounts = new Map<string, number>();
  for (const p of picks) {
    const tid = p.wishlist.tableId;
    if (!tid) continue;
    pickCounts.set(tid, (pickCounts.get(tid) ?? 0) + p.quantity);
  }

  const rows = tables.map(t => {
    const agg = byTable.get(t.id);
    const mine = t.assignments.some(a => a.staffMemberId === staffId);

    // Order matters. "Nobody has this and it's been a while" outranks
    // "nobody has this", which outranks "somebody is on it".
    let state: TableState = "clear";
    if (agg) {
      if (agg.oldest >= thresholds.attentionSeconds && agg.unclaimed > 0) {
        state = "needs_attention";
      } else if (agg.unclaimed > 0) {
        state = "new_request";
      } else {
        state = "in_progress";
      }
    }

    return {
      id: t.id,
      label: t.label,
      zone: t.zone,
      mine,
      state,
      openRequests: agg?.open ?? 0,
      oldestWaitSeconds: agg ? agg.oldest : null,
      pickCount: pickCounts.get(t.id) ?? 0,
      occupied: occupied.has(t.id),
    };
  });

  // Mine first, then the ones that need something, then by label. A
  // waiter scanning this is looking for their own trouble before anyone
  // else's.
  const RANK: Record<TableState, number> = {
    needs_attention: 0,
    new_request: 1,
    in_progress: 2,
    clear: 3,
  };
  return rows.sort(
    (a, b) =>
      Number(b.mine) - Number(a.mine) ||
      RANK[a.state] - RANK[b.state] ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

/**
 * The four numbers above the queue.
 *
 * Scoped to this waiter's own work, not the venue's, because a server
 * cannot act on the venue's average. The exception is the guest rating,
 * which is the room's and is labelled as such.
 *
 * Response time is a MEDIAN. One request left unacknowledged over a
 * break would drag a mean into uselessness, and the typical wait is what
 * somebody can actually act on.
 */
export async function shiftSummary({
  venueId,
  staffId,
  assignedTableIds,
  shiftStartedAt,
  now = new Date(),
}: {
  venueId: string;
  staffId: string;
  assignedTableIds: string[];
  /** Null when off shift — "today" is used instead. */
  shiftStartedAt: Date | null;
  now?: Date;
}): Promise<ShiftSummary> {
  // Off shift, "this shift" has no meaning, so fall back to the last 12
  // hours rather than showing zero and looking broken.
  const since = shiftStartedAt ?? new Date(now.getTime() - 12 * 60 * 60_000);
  const tableScope = assignedTableIds.length > 0 ? { in: assignedTableIds } : undefined;

  const [open, acked, completed, feedback] = await Promise.all([
    db.request.findMany({
      where: {
        venueId,
        status: { in: ["PENDING", "ACKNOWLEDGED", "ON_MY_WAY", "ESCALATED"] },
        ...(tableScope ? { tableId: tableScope } : {}),
      },
      select: { status: true },
    }),
    db.request.findMany({
      where: {
        venueId,
        acknowledgedById: staffId,
        acknowledgedAt: { gte: since, not: null },
        routedAt: { not: null },
      },
      select: { routedAt: true, acknowledgedAt: true },
      take: 500,
    }),
    db.request.count({
      where: {
        venueId,
        acknowledgedById: staffId,
        status: "RESOLVED",
        resolvedAt: { gte: since },
      },
    }),
    db.feedbackReport.findMany({
      where: { venueId, createdAt: { gte: since } },
      select: { rating: true },
      take: 500,
    }),
  ]);

  const waits = acked
    .map(r => (r.acknowledgedAt!.getTime() - r.routedAt!.getTime()) / 1000)
    .filter(s => s >= 0)
    .sort((a, b) => a - b);
  const responseSeconds =
    waits.length === 0
      ? null
      : Math.round(
          waits.length % 2
            ? waits[(waits.length - 1) / 2]!
            : (waits[waits.length / 2 - 1]! + waits[waits.length / 2]!) / 2,
        );

  const ratings = feedback.map(f => f.rating).filter((r): r is number => typeof r === "number");
  const rating =
    ratings.length === 0
      ? null
      : Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;

  return {
    activeRequests: open.length,
    newRequests: open.filter(r => r.status === "PENDING" || r.status === "ESCALATED").length,
    responseSeconds,
    completedThisShift: completed,
    rating,
    ratingCount: ratings.length,
  };
}

/**
 * What a table has shortlisted, for the waiter standing at it.
 *
 * Aggregated across every live session at the table and returned as
 * counts. Which guest saved what never leaves the database — a server
 * does not need it, and a table can see this screen.
 */
export async function tablePicks({
  venueId,
  tableId,
  now = new Date(),
}: {
  venueId: string;
  tableId: string;
  now?: Date;
}): Promise<TablePick[]> {
  const rows = await db.wishlistItem.findMany({
    where: {
      wishlist: {
        venueId,
        tableId,
        status: "ACTIVE",
        guestSession: { expiresAt: { gt: now }, paidAt: null },
      },
    },
    select: { quantity: true, menuItem: { select: { name: true } } },
  });

  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.menuItem.name, (totals.get(r.menuItem.name) ?? 0) + r.quantity);
  }
  return [...totals.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
}

/**
 * Recent guest feedback, trimmed to what a server may see.
 *
 * Rating, comment and table only. No name, no phone, no contact id, no
 * link back to a guest profile — a comment is about the visit, and
 * turning it into a dossier entry is a different product with different
 * consent.
 */
export type WaiterFeedback = {
  id: string;
  rating: number | null;
  comment: string | null;
  tableLabel: string | null;
  createdAt: string;
};

export async function recentFeedback({
  venueId,
  limit = 3,
  since,
}: {
  venueId: string;
  limit?: number;
  since?: Date;
}): Promise<WaiterFeedback[]> {
  const rows = await db.feedbackReport.findMany({
    where: { venueId, ...(since ? { createdAt: { gte: since } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      rating: true,
      note: true,
      createdAt: true,
      session: { select: { table: { select: { label: true } } } },
    },
  });

  return rows.map(r => ({
    id: r.id,
    rating: r.rating,
    comment: r.note,
    tableLabel: r.session?.table?.label ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

