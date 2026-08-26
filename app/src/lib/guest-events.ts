/**
 * The vocabulary of things a guest does.
 *
 * One closed list, shared by the client that raises events and the
 * analytics that read them. Closed on purpose: a free-text event name
 * means two spellings of the same thing six months apart, and a metric
 * that quietly halves.
 *
 * WHAT MAY NOT GO IN AN EVENT
 * ---------------------------
 * No names, no phone numbers, no device ids, no IPs, no free text. The
 * schema already makes most of that impossible — there is nowhere to put
 * it — and this module keeps it that way by giving every event exactly
 * three optional dimensions: which venue, which session, and which menu
 * item or promotion it was about.
 *
 * A phone number that reached an analytics table would be a privacy
 * incident that no amount of later deletion undoes, so the guarantee is
 * structural rather than a rule someone has to remember.
 */

export const GUEST_EVENTS = [
  // Arrival
  "guest_qr_scanned",
  "welcome_viewed",
  "menu_explored",
  // Discovery
  "menu_item_viewed",
  "mood_prompt_used",
  "special_viewed",
  "special_revealed",
  "chef_pick_started",
  "chef_pick_completed",
  "pairing_shown",
  "pairing_saved",
  // Picks
  "pick_saved",
  "pick_removed",
  "picks_shared_with_server",
  "table_picks_viewed",
  // Service
  "service_requested",
  "service_acknowledged",
  "service_completed",
  "ready_to_order_requested",
  "check_requested",
  // Feedback and relationship
  "feedback_started",
  "feedback_completed",
  "manager_recovery_requested",
  "phone_capture_viewed",
  "phone_provided",
  "marketing_opt_in",
  "return_visit_detected",
  "event_viewed",
] as const;

export type GuestEventType = (typeof GUEST_EVENTS)[number];

const KNOWN = new Set<string>(GUEST_EVENTS);

export function isGuestEvent(value: unknown): value is GuestEventType {
  return typeof value === "string" && KNOWN.has(value);
}

/**
 * One event, as it arrives from a guest's phone.
 *
 * `menuItemId` and `promotionId` are ids the client already holds from
 * the page it was served. They are validated against this venue's own
 * menu on the way in — an id from another venue is dropped rather than
 * stored, so a tampered payload can't write rows that pollute someone
 * else's numbers.
 */
export type IncomingGuestEvent = {
  type: GuestEventType;
  menuItemId?: string | null;
  promotionId?: string | null;
};

/** How many events one request may carry. Batches, not floods. */
export const MAX_EVENTS_PER_BATCH = 20;

/**
 * Strip a batch down to what may actually be stored.
 *
 * Unknown event names are dropped rather than rejected: a phone running
 * a cached older build shouldn't have its whole batch fail because one
 * name has since been retired. Everything else about the payload is
 * discarded — only the three fields below survive, whatever else was
 * sent.
 */
export function sanitizeBatch(raw: unknown): IncomingGuestEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: IncomingGuestEvent[] = [];
  for (const entry of raw.slice(0, MAX_EVENTS_PER_BATCH)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (!isGuestEvent(e.type)) continue;
    out.push({
      type: e.type,
      menuItemId: typeof e.menuItemId === "string" ? e.menuItemId : null,
      promotionId: typeof e.promotionId === "string" ? e.promotionId : null,
    });
  }
  return out;
}

/**
 * Events that describe menu discovery, for the "did guests actually look
 * at the menu" rate. Scanning and leaving is a different visit from
 * scanning and reading, and a venue can act on the difference.
 */
export const DISCOVERY_EVENTS: GuestEventType[] = [
  "menu_explored",
  "menu_item_viewed",
  "mood_prompt_used",
];

/** Events that mean a guest engaged with something the venue is pushing. */
export const SPECIAL_EVENTS: GuestEventType[] = [
  "special_viewed",
  "special_revealed",
  "chef_pick_started",
  "chef_pick_completed",
];

/**
 * How a venue-facing number should be worded.
 *
 * TabCall cannot see a bill, so it can never say a suggestion earned
 * anything. "Most saved after a suggestion" is a true statement about
 * saves; "£420 of upsell revenue" would be a number nobody here can
 * compute. Kept next to the event list so the honest phrasing is where
 * anyone adding a metric will trip over it.
 */
export const REVENUE_SAFE_LABELS = {
  savedAfterSuggestion: "Most saved after a suggestion",
  itemsInfluenced: "Items guests looked at through TabCall",
} as const;
