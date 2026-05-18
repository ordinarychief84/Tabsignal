/**
 * Multi-call detection for the staff queue.
 *
 * "Multi-call" = two or more DISTINCT tables that the signed-in waiter
 * is assigned to have at least one OPEN request (PENDING or ESCALATED).
 * The cue exists to break the waiter out of single-table tunnel vision
 * when the floor is busy: a Drink at Table 4 and a Bill at Table 12
 * landing within the same minute should feel different from one of
 * either alone.
 *
 * Pure function — no DOM, no clocks beyond the caller-supplied `now`.
 * Easily testable. Wired into `app/staff/queue.tsx` for the banner +
 * audio cue.
 */

export type MultiCallItem = {
  id: string;
  tableId?: string | null;
  tableLabel: string;
  type: string;
  status: "PENDING" | "ACKNOWLEDGED" | "RESOLVED" | "ESCALATED";
  createdAt: string;
};

export type MultiCallTable = {
  tableId: string;
  tableLabel: string;
  /** Oldest open request from this table — the one that "triggered"
   *  the table's bell. Used for the row UI + scroll-to-focus target. */
  oldestRequestId: string;
  oldestRequestType: string;
  oldestAgeMs: number;
  /** Number of open requests stacked on this single table. Most floors
   *  see 1; a single guest spamming the call button could push it up. */
  openCount: number;
};

export type MultiCallState = {
  /** Distinct assigned tables that currently have at least one open
   *  (PENDING / ESCALATED) request. Sorted oldest-first so the most
   *  urgent table reads at the top of the alert. */
  tables: MultiCallTable[];
  /** Convenience: tables.length. The banner only renders when this
   *  is >= 2 — single-table calls don't qualify as "multi". */
  count: number;
};

/**
 * Decide which open requests are "calling for the waiter's attention":
 * either still PENDING (no one acknowledged) or ESCALATED (past the
 * 3-minute timer and re-routed). ACKNOWLEDGED ones are off the
 * urgent list — someone is actively handling them.
 */
function isOpen(status: MultiCallItem["status"]): boolean {
  return status === "PENDING" || status === "ESCALATED";
}

export function computeMultiCall(
  items: MultiCallItem[],
  assignedTableIds: ReadonlySet<string>,
  now: number = Date.now(),
): MultiCallState {
  // Group by tableId, considering only items the waiter is responsible
  // for AND are still open. Skip rows without a tableId — those are
  // venue-wide alerts that don't belong in this cue.
  const byTable = new Map<string, MultiCallItem[]>();
  for (const it of items) {
    if (!it.tableId) continue;
    if (!assignedTableIds.has(it.tableId)) continue;
    if (!isOpen(it.status)) continue;
    const bucket = byTable.get(it.tableId) ?? [];
    bucket.push(it);
    byTable.set(it.tableId, bucket);
  }

  const tables: MultiCallTable[] = [];
  for (const [tableId, group] of byTable) {
    // Pick the oldest open request from the table — that's the one
    // the waiter most urgently needs to handle.
    const oldest = group.reduce(
      (acc, cur) => (new Date(cur.createdAt).getTime() < new Date(acc.createdAt).getTime() ? cur : acc),
      group[0],
    );
    tables.push({
      tableId,
      tableLabel: oldest.tableLabel,
      oldestRequestId: oldest.id,
      oldestRequestType: oldest.type,
      oldestAgeMs: Math.max(0, now - new Date(oldest.createdAt).getTime()),
      openCount: group.length,
    });
  }

  // Sort by age descending (oldest first).
  tables.sort((a, b) => b.oldestAgeMs - a.oldestAgeMs);

  return { tables, count: tables.length };
}

/** Format a millisecond duration as "Xm Ys" with no leading zeros. */
export function formatAge(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
