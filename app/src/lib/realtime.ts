/**
 * Server-side helper for emitting Socket.io events from Next.js routes.
 *
 * Calls into the Fastify backend (api/) at /internal/emit, which then fans
 * out to the appropriate Socket.io room. Fire-and-forget by default —
 * failures log a warning but never block the API response. The user-facing
 * action (DB write, payment confirmation) is the source of truth; the
 * realtime push is just a nudge.
 *
 * Rooms:
 *   venue:{venueId}     — all staff PWAs at the venue
 *   guest:{sessionId}   — the active guest browser
 *   staff:{staffId}     — a single staff member's PWA (private room for
 *                         per-staff routing, e.g. "Maya's tables only")
 */

const URL_BASE = process.env.FASTIFY_INTERNAL_URL ?? "http://localhost:4000";
const SECRET = process.env.INTERNAL_API_SECRET ?? "";

export type RoomKind = "venue" | "guest" | "staff";

export type EmitArgs = {
  kind: RoomKind;
  id: string;
  event: string;
  payload?: unknown;
};

const TIMEOUT_MS = 1500;

export async function emit({ kind, id, event, payload }: EmitArgs): Promise<void> {
  if (!SECRET) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[realtime] INTERNAL_API_SECRET unset — skipping emit", { event });
    }
    return;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${URL_BASE}/internal/emit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": SECRET,
      },
      body: JSON.stringify({ roomKind: kind, roomId: id, event, payload }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[realtime] emit ${event} → HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[realtime] emit ${event} failed:`, (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

/** Convenience helpers — keep event names in one place. */
export const events = {
  newRequest: (venueId: string, request: unknown, assignedStaffIds: string[] = []) =>
    Promise.all([
      emit({ kind: "venue", id: venueId, event: "new_request", payload: { request } }),
      // Per-staff "ping" room — staff PWA can choose to highlight if it's
      // covering the table where the request landed.
      ...assignedStaffIds.map(sid =>
        emit({ kind: "staff", id: sid, event: "new_request_for_you", payload: { request } })
      ),
    ]).then(() => undefined),

  requestAcknowledged: (venueId: string, sessionId: string, request: unknown) =>
    Promise.all([
      emit({ kind: "venue", id: venueId, event: "request_acknowledged", payload: { request } }),
      emit({ kind: "guest", id: sessionId, event: "request_acknowledged", payload: { request } }),
    ]).then(() => undefined),

  requestResolved: (venueId: string, request: unknown) =>
    emit({ kind: "venue", id: venueId, event: "request_resolved", payload: { request } }),

  paymentConfirmed: (venueId: string, sessionId: string, summary: unknown) =>
    Promise.all([
      emit({ kind: "venue", id: venueId, event: "payment_confirmed", payload: summary }),
      emit({ kind: "guest", id: sessionId, event: "payment_confirmed", payload: summary }),
    ]).then(() => undefined),

  preOrderPaid: (venueId: string, order: unknown) =>
    emit({ kind: "venue", id: venueId, event: "preorder_paid", payload: { order } }),

  // Tier 3e: a paired regular has just sat down. Fans out to every
  // staff PWA at the venue + the per-staff rooms for assigned tables.
  regularArrived: (
    venueId: string,
    sessionId: string,
    tableId: string | null,
    preview: unknown,
    assignedStaffIds: string[] = []
  ) =>
    Promise.all([
      emit({
        kind: "venue",
        id: venueId,
        event: "regular_arrived",
        payload: { sessionId, tableId, preview },
      }),
      ...assignedStaffIds.map(sid =>
        emit({
          kind: "staff",
          id: sid,
          event: "regular_arrived_for_you",
          payload: { sessionId, tableId, preview },
        })
      ),
    ]).then(() => undefined),
};
