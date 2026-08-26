import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { FcmRegister } from "./fcm-register";
import { WaiterConsole } from "./console/waiter-console";
import { recentFeedback, shiftSummary, waiterTables } from "@/lib/waiter-console";
import { firstNameOf } from "@/lib/server-identity";

export const dynamic = "force-dynamic";

/**
 * The waiter console.
 *
 * Loaded in one server pass so a phone behind a bar paints once instead
 * of waterfalling four fetches. Everything live after that arrives on
 * the socket the queue already holds.
 */
export default async function StaffPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const staff = await db.staffMember.findUnique({
    where: { id: session.staffId },
    select: {
      id: true,
      name: true,
      displayName: true,
      section: true,
      shiftStatus: true,
      shiftStartedAt: true,
      venue: { select: { id: true, name: true, slug: true, timezone: true } },
      assignments: { select: { tableId: true } },
    },
  });
  if (!staff) redirect("/staff/login?err=invalid");

  const assignedTableIds = staff.assignments.map(a => a.tableId);
  // Legacy STAFF rows were venue creators before RBAC landed, so they
  // carry owner privileges — same mapping the onboarding route uses.
  const canManage = ["OWNER", "MANAGER", "STAFF"].includes(session.role);

  // One window for both the rating and the comments below it. When they
  // differed, the summary could read "no ratings yet" directly above
  // three guest comments — which makes the whole panel look broken.
  const since = staff.shiftStartedAt ?? new Date(Date.now() - 12 * 60 * 60_000);

  const [tables, summary, feedback] = await Promise.all([
    waiterTables({ venueId: staff.venue.id, staffId: staff.id }),
    shiftSummary({
      venueId: staff.venue.id,
      staffId: staff.id,
      assignedTableIds,
      shiftStartedAt: staff.shiftStartedAt,
    }),
    // Rating, comment and table only — see lib/waiter-console for what
    // is withheld from a service screen and why.
    recentFeedback({ venueId: staff.venue.id, limit: 3, since }),
  ]);

  return (
    <>
      <FcmRegister />
      <WaiterConsole
        venueId={staff.venue.id}
        venueSlug={staff.venue.slug}
        venueName={staff.venue.name}
        staffId={staff.id}
        // First name, from the floor name where they set one. "Good
        // afternoon, Maya Okafor" reads like a database greeting a record.
        staffName={firstNameOf(staff.displayName || staff.name)}
        section={staff.section}
        greeting={greetingFor(new Date(), staff.venue.timezone)}
        shiftStatus={staff.shiftStatus}
        shiftStartedAt={staff.shiftStartedAt?.toISOString() ?? null}
        assignedTableIds={assignedTableIds}
        initialTables={tables}
        initialSummary={summary}
        feedback={feedback}
        canManage={canManage}
        adminHref={`/admin/v/${staff.venue.slug}`}
      />
    </>
  );
}

/**
 * "Good evening" in the VENUE's timezone, not the device's. A server
 * whose phone is still on another timezone should not be greeted with
 * good morning at the start of a dinner shift.
 */
function greetingFor(now: Date, timezone: string): string {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: timezone,
      }).format(now),
    );
  } catch {
    hour = now.getHours();
  }
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
