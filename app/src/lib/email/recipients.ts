import { db } from "@/lib/db";

/**
 * Resolve the email-recipient list for a venue-level alert.
 *
 * Order of precedence:
 *   1. Venue.alertEmails — if set, this is the explicit override and takes
 *      sole authority. Manager configured this; respect it.
 *   2. All StaffMembers at the venue — backward-compatible fallback.
 *   3. OPERATOR_EMAILS env — last-resort safety net so we never email
 *      nothing when something important happens at a venue with no staff.
 *
 * Output is deduped + lowercased.
 */
export async function venueAlertRecipients(venueId: string): Promise<string[]> {
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { alertEmails: true },
  });

  const explicit = parseList(venue?.alertEmails);
  if (explicit.length > 0) return explicit;

  const staff = await db.staffMember.findMany({
    where: { venueId },
    select: { email: true },
  });
  const staffEmails = staff.map(s => s.email).filter(Boolean);
  if (staffEmails.length > 0) return dedupe(staffEmails);

  const ops = parseList(process.env.OPERATOR_EMAILS);
  return ops;
}

/**
 * Recipients for org-wide notices (broadcast, plan flip, etc.). Resolves
 * every venue's alert list under the org and unions them. Falls back to
 * OrgMember emails if no venues yet have alert lists.
 */
export async function orgAlertRecipients(orgId: string): Promise<string[]> {
  const venues = await db.venue.findMany({
    where: { orgId },
    select: { id: true, alertEmails: true },
  });

  const out = new Set<string>();
  for (const v of venues) {
    const explicit = parseList(v.alertEmails);
    if (explicit.length > 0) {
      explicit.forEach(e => out.add(e));
      continue;
    }
    const staff = await db.staffMember.findMany({
      where: { venueId: v.id },
      select: { email: true },
    });
    staff.forEach(s => { if (s.email) out.add(s.email.toLowerCase()); });
  }

  if (out.size > 0) return [...out];

  // Fall back to OrgMembers — the operator-facing roster.
  const members = await db.orgMember.findMany({
    where: { orgId },
    select: { email: true },
  });
  return dedupe(members.map(m => m.email));
}

function parseList(input: string | null | undefined): string[] {
  if (!input) return [];
  return dedupe(
    input
      .split(/[,;\s]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
  );
}

function dedupe(emails: string[]): string[] {
  return Array.from(new Set(emails.map(e => e.toLowerCase())));
}
