import "server-only";

/**
 * Who the guest is told is looking after them.
 *
 * The point of the welcome is that a real person is coming — "Sarah" reads
 * differently from "a server". But a table's assigned staff row holds a
 * legal name, an email and a role, and none of that belongs on a
 * stranger's phone. So this returns a deliberately small shape and the
 * guest surfaces have no access to the underlying row.
 *
 * Every field is optional on purpose. Plenty of venues never assign
 * tables, and the guest experience has to read well with nothing but the
 * venue's own name — so "no server assigned" is a supported state, not a
 * degraded one.
 */

import { db } from "@/lib/db";

export type GuestFacingServer = {
  /** First name as used on the floor. Never the full legal name. */
  displayName: string;
  photoUrl: string | null;
  /** Resolved through the priority chain below. */
  welcomeMessage: string;
  /** Internal id — for routing requests, never rendered. */
  staffId: string;
};

/**
 * TabCall's fallback greeting. Used only when neither the server nor the
 * venue has written one, so a venue that never touches the setting still
 * gets something warm rather than an empty panel.
 */
export function defaultWelcome(serverName: string, venueName: string): string {
  return (
    `Hi, I'm ${serverName}. Welcome to ${venueName}. I'll be with you shortly. ` +
    `Feel free to explore tonight's menu and specials while I make my way over.`
  );
}

/**
 * Take the first name only. A venue that types "Sarah Okonkwo" into
 * displayName almost certainly doesn't mean to show a guest a surname, and
 * a server shouldn't have to know that to be safe.
 */
function firstNameOf(value: string): string {
  return value.trim().split(/\s+/)[0] ?? value.trim();
}

/**
 * Resolve the server for a table.
 *
 * Priority for the greeting, per spec:
 *   1. the server's own welcomeMessage
 *   2. the venue default
 *   3. TabCall's default
 *
 * A server is never required to write one; a venue owner can set the
 * default for everybody and override any individual message.
 */
export async function serverForTable(opts: {
  tableId: string;
  venueName: string;
  venueWelcomeMessage?: string | null;
}): Promise<GuestFacingServer | null> {
  const assignment = await db.tableAssignment.findFirst({
    where: {
      tableId: opts.tableId,
      // Suspended or departed staff must never be introduced to a guest as
      // the person on their way over.
      staff: { status: "ACTIVE" },
    },
    orderBy: { createdAt: "asc" },
    select: {
      staff: {
        select: {
          id: true,
          name: true,
          displayName: true,
          photoUrl: true,
          welcomeMessage: true,
        },
      },
    },
  });
  if (!assignment) return null;

  const staff = assignment.staff;
  const displayName = firstNameOf(staff.displayName?.trim() || staff.name);

  const welcomeMessage =
    staff.welcomeMessage?.trim() ||
    opts.venueWelcomeMessage?.trim() ||
    defaultWelcome(displayName, opts.venueName);

  return {
    displayName,
    photoUrl: staff.photoUrl ?? null,
    welcomeMessage,
    staffId: staff.id,
  };
}

/**
 * How to refer to service when there may or may not be a named person:
 * "Need Sarah?" vs "Need a server?".
 */
export function serviceCtaLabel(server: { displayName: string } | null): string {
  return server ? `Need ${server.displayName}?` : "Need a server?";
}

export function serviceSheetTitle(server: { displayName: string } | null): string {
  return server ? `How can ${server.displayName} help?` : "How can we help?";
}
