/**
 * "Need a hand at 14."
 *
 * The narrowest thing that answers §32, and narrow on purpose: the brief
 * asks for operational communication and says in the same breath not to
 * build Slack inside TabCall. Those pull against each other, and the way
 * to satisfy both is to make composing impossible.
 *
 * So a ping has no body. It has a KIND, a table, and a sender. Three
 * kinds, because three genuinely different asks were named — a pair of
 * hands, a decision, a swap — and each produces a fixed sentence. A
 * server raises one in two taps and gets back to the floor. The moment
 * it grows a text field it becomes a thing people write, then a thing
 * people read, then a thing people miss a table over.
 *
 * It is also not a chat in the other direction: there is no reply, only
 * "I've got this", which is the only response that changes anything on
 * the floor.
 */

export type StaffPingKind = "NEED_HAND" | "NEED_MANAGER" | "NEED_COVER";

export const STAFF_PING_KINDS: StaffPingKind[] = [
  "NEED_HAND",
  "NEED_MANAGER",
  "NEED_COVER",
];

/** What the sender picks. Phrased as the thing they want, not a category. */
export const PING_ACTION_LABEL: Record<StaffPingKind, string> = {
  NEED_HAND: "Need a hand",
  NEED_MANAGER: "Need a manager",
  NEED_COVER: "Need cover",
};

/** The one line that helps whoever is choosing. */
export const PING_ACTION_HINT: Record<StaffPingKind, string> = {
  NEED_HAND: "Anyone free — carrying, clearing, a second pair of hands.",
  NEED_MANAGER: "A decision somebody else has to make.",
  NEED_COVER: "Asking someone to take the table.",
};

/**
 * The sentence everyone else reads.
 *
 * Built here rather than stored, so the wording can improve without a
 * migration and so a ping can never carry text somebody typed. The
 * sender's name is their FLOOR name — a ping can land on a shared
 * tablet, and a legal name has no business there.
 */
export function pingSentence({
  kind,
  fromName,
  tableLabel,
}: {
  kind: StaffPingKind;
  fromName: string;
  tableLabel: string | null;
}): string {
  const where = tableLabel ? ` at ${tableLabel}` : "";
  switch (kind) {
    case "NEED_HAND":
      return `${fromName} needs a hand${where}`;
    case "NEED_MANAGER":
      return `${fromName} needs a manager${where}`;
    case "NEED_COVER":
      return tableLabel
        ? `${fromName} needs someone to cover ${tableLabel}`
        : `${fromName} needs cover`;
  }
}

export function isStaffPingKind(value: unknown): value is StaffPingKind {
  return typeof value === "string" && (STAFF_PING_KINDS as string[]).includes(value);
}

/**
 * How long an unanswered ping stays on other people's screens.
 *
 * Pings expire rather than accumulating. A "need a hand" from forty
 * minutes ago is not a thing anybody is still going to answer, and a
 * list of stale asks is how a floor learns to ignore the list. Whoever
 * sent it has long since sorted it or asked again out loud.
 */
export const PING_VISIBLE_MS = 10 * 60_000;

/**
 * Who a ping should reach.
 *
 * A manager ask goes to managers and owners — sending "need a manager"
 * to the whole floor makes three servers look up and none of them able
 * to help. Everything else goes to everyone, because the whole point of
 * "need a hand" is that anyone free can take it.
 *
 * Falls back to the whole floor when a venue has no manager on. A ping
 * that reaches nobody is the same failure as a guest request that
 * reaches nobody.
 */
export function recipientsFor(
  kind: StaffPingKind,
  staff: { id: string; role: string }[],
  senderId: string,
): string[] {
  const others = staff.filter(s => s.id !== senderId);
  if (kind !== "NEED_MANAGER") return others.map(s => s.id);

  const managers = others.filter(s => s.role === "MANAGER" || s.role === "OWNER");
  return (managers.length > 0 ? managers : others).map(s => s.id);
}
