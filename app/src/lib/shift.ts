/**
 * Where a server is right now, and what that means for routing.
 *
 * The rule that shapes everything here: A REQUEST MUST NEVER GO SILENT.
 *
 * It is tempting to make availability a hard filter — skip anyone on
 * break, route only to people on shift. That fails badly in the case
 * that matters most: a table whose only assigned server steps outside
 * for two minutes. A hard filter routes that guest's request to nobody,
 * and nobody is the one outcome the product exists to prevent.
 *
 * So availability is a PREFERENCE, not a gate. Staff on shift are tried
 * first; staff on a break still receive the request when there is nobody
 * else; staff off shift are skipped only while someone else can take it.
 * If the alternative is silence, everyone gets it.
 *
 * The distinction between BREAK and MEAL_BREAK is for the manager
 * reading the floor, not for the router — both mean "away, but still the
 * fallback for their own tables".
 */

export type ShiftStatus = "ON_SHIFT" | "BREAK" | "MEAL_BREAK" | "OFF_SHIFT";

export const SHIFT_STATUSES: ShiftStatus[] = [
  "ON_SHIFT",
  "BREAK",
  "MEAL_BREAK",
  "OFF_SHIFT",
];

export const SHIFT_LABELS: Record<ShiftStatus, string> = {
  ON_SHIFT: "On shift",
  BREAK: "On a break",
  MEAL_BREAK: "On meal break",
  OFF_SHIFT: "Off shift",
};

/** Short form for the header chip, where space is tight. */
export const SHIFT_SHORT: Record<ShiftStatus, string> = {
  ON_SHIFT: "On shift",
  BREAK: "Break",
  MEAL_BREAK: "Meal",
  OFF_SHIFT: "Off",
};

/**
 * What each state means for the person choosing it. Written for a server
 * glancing at a menu mid-service, so each line says what will actually
 * happen to their requests.
 */
export const SHIFT_HINTS: Record<ShiftStatus, string> = {
  ON_SHIFT: "Requests at your tables come to you first.",
  BREAK: "Requests at your tables go to others first. They still reach you if nobody else can.",
  MEAL_BREAK: "Requests route the same as a break. The floor just knows you're eating.",
  OFF_SHIFT: "You stop receiving requests, unless nobody else covers the table.",
};

/** Taking requests as first choice. */
export function isAvailable(status: ShiftStatus): boolean {
  return status === "ON_SHIFT";
}

/** Away, but still the fallback for their own tables. */
export function isAway(status: ShiftStatus): boolean {
  return status === "BREAK" || status === "MEAL_BREAK";
}

type Routable = { id: string; shiftStatus: ShiftStatus };

/**
 * Who should be told about a request, given who is assigned to the table
 * and who is around.
 *
 * Returns the ids to notify, and whether this is a fallback — the caller
 * uses that to decide whether the request also deserves a wider alert,
 * because "the only person who can take this is on their break" is worth
 * a manager knowing.
 *
 * Order of preference:
 *   1. assigned AND on shift          — the normal case
 *   2. assigned AND away              — better than nobody
 *   3. anyone else on shift at the venue
 *   4. everyone assigned, whatever their state
 *
 * Step 4 exists because silence is the worst outcome. If a venue has one
 * server, they went off shift without ending service, and a guest asks
 * for water, that request still has to land somewhere.
 */
export function routeTo(
  assigned: Routable[],
  othersAtVenue: Routable[],
): { staffIds: string[]; fallback: boolean } {
  const assignedOn = assigned.filter(s => isAvailable(s.shiftStatus));
  if (assignedOn.length > 0) {
    return { staffIds: assignedOn.map(s => s.id), fallback: false };
  }

  const assignedAway = assigned.filter(s => isAway(s.shiftStatus));
  if (assignedAway.length > 0) {
    return { staffIds: assignedAway.map(s => s.id), fallback: true };
  }

  const floorOn = othersAtVenue.filter(s => isAvailable(s.shiftStatus));
  if (floorOn.length > 0) {
    return { staffIds: floorOn.map(s => s.id), fallback: true };
  }

  // Nobody is on shift anywhere. Tell whoever is assigned regardless of
  // their state, and fall back to the whole venue if the table has no
  // assignment at all. A request with no recipient is the one thing this
  // function may never return.
  const everyone = assigned.length > 0 ? assigned : othersAtVenue;
  return { staffIds: everyone.map(s => s.id), fallback: true };
}

/**
 * Whether going off shift needs a warning first.
 *
 * Not a block — a server is allowed to leave, and a product that refuses
 * would just get lied to. But walking away from live requests should be
 * a deliberate act, so the UI confirms and names what is open.
 */
export function offShiftWarning({
  openRequests,
  assignedTables,
  otherStaffOnShift,
}: {
  /** Open requests currently claimed by, or assigned to, this person. */
  openRequests: number;
  assignedTables: number;
  otherStaffOnShift: number;
}): string | null {
  if (openRequests > 0) {
    return openRequests === 1
      ? "You have 1 request still open. Hand it off or finish it first."
      : `You have ${openRequests} requests still open. Hand them off or finish them first.`;
  }
  if (assignedTables > 0 && otherStaffOnShift === 0) {
    return assignedTables === 1
      ? "You're the only one on shift, and 1 table is still yours. Requests there will still reach you."
      : `You're the only one on shift, and ${assignedTables} tables are still yours. Requests there will still reach you.`;
  }
  return null;
}
