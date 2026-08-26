/**
 * What a guest is allowed to be told about their own service request.
 *
 * The vocabulary here is the whole point. A request moves through three
 * states that mean genuinely different things, and the product has been
 * careful from the start not to collapse them:
 *
 *   PENDING       we passed it on — a screen somewhere is showing it
 *   ACKNOWLEDGED  a person pressed "Got it" — someone is actually coming
 *   RESOLVED      they came
 *
 * "Sarah is on her way" is only true in the second state. Saying it in
 * the first is a promise the product cannot keep, and a guest who
 * believes it waits longer before asking again — which makes the service
 * worse than if TabCall had said nothing.
 *
 * ESCALATED is deliberately NOT surfaced as its own guest-facing state.
 * It means the venue's internal clock ran out and the request was pushed
 * to a manager; from the guest's chair nothing has changed — still nobody
 * has come — so they keep seeing "notified" rather than a word that
 * announces the venue is struggling.
 */

export type GuestRequestStatus = "PENDING" | "ACKNOWLEDGED" | "RESOLVED" | "ESCALATED";

/** The three states a guest is shown, collapsed from the five stored. */
export type GuestServiceStage = "notified" | "coming" | "done";

export function stageFor(status: GuestRequestStatus): GuestServiceStage {
  if (status === "RESOLVED") return "done";
  if (status === "ACKNOWLEDGED") return "coming";
  // PENDING and ESCALATED both read as "notified" — see the note above.
  return "notified";
}

/**
 * The line the guest reads, with the server named wherever we have a name.
 *
 * `serverName` is null for a table with nobody assigned, and the wording
 * shifts to the team rather than inventing a person.
 */
export function statusHeadline(
  stage: GuestServiceStage,
  serverName: string | null,
): string {
  const who = serverName ?? "The team";
  switch (stage) {
    case "notified":
      return serverName ? `${who} has been notified` : "The team has been notified";
    case "coming":
      return serverName ? `${who} is on the way` : "Someone is on the way";
    case "done":
      return "All done";
  }
}

/**
 * Supporting line. Says what is true and, in the first state, what the
 * guest can expect next — so "notified" doesn't read as a dead end.
 */
export function statusDetail(
  stage: GuestServiceStage,
  serverName: string | null,
): string {
  switch (stage) {
    case "notified":
      return serverName
        ? `We've let ${serverName} know. You'll see this update the moment they pick it up.`
        : "We've let the floor know. You'll see this update the moment someone picks it up.";
    case "coming":
      return serverName
        ? `${serverName} has your request and is heading over.`
        : "Your request has been picked up and someone is heading over.";
    case "done":
      return "Hope that sorted it. Tap the service button any time.";
  }
}

/**
 * The human name of what was asked for, for the status card. Mirrors the
 * labels in the service sheet so a guest sees back the words they picked.
 */
export const REQUEST_TYPE_LABELS: Record<string, string> = {
  HELP: "A word with your server",
  REFILL: "Water / refill",
  ORDER: "Ready to order",
  BILL: "Ready for the check",
  CELEBRATION: "Celebrating something",
  DRINK: "A drink",
  CLEAN: "Clearing the table",
  SUPPLIES: "Napkins / cutlery",
};

export function requestTypeLabel(type: string): string {
  return REQUEST_TYPE_LABELS[type] ?? "Your request";
}

/**
 * How long a resolved request stays on screen before the card retires
 * itself. Long enough to be seen, short enough that it isn't still
 * sitting there when the guest next looks down.
 */
export const RESOLVED_VISIBLE_MS = 25_000;
