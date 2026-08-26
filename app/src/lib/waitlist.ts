import "server-only";

/**
 * Waitlist maths.
 *
 * Lifted out of lib/reservations when reservations were removed — the
 * waitlist is a different job (a queue at the door, not a booking weeks
 * out) and shouldn't have died with it. This was the only piece it
 * borrowed.
 */

export function quoteWait(positionsAhead: number, partySize: number): number {
  const base = positionsAhead * 15;
  const adj = partySize >= 5 ? 10 : 0;
  return Math.max(5, base + adj);
}
