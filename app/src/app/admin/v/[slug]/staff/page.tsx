import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { assignableRoles } from "@/lib/auth/permissions";
import { PeoplePanel } from "./people-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — people" };

export default async function PeoplePage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/staff`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const [staff, tables] = await Promise.all([
    db.staffMember.findMany({
      where: { venueId: venue.id },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      include: {
        ackedRequests: { select: { id: true } },
        assignments: { select: { tableId: true } },
        invitedBy: { select: { name: true, email: true } },
      },
    }),
    db.table.findMany({
      where: { venueId: venue.id },
      orderBy: { label: "asc" },
      select: { id: true, label: true, zone: true },
    }),
  ]);

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Team</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">People</h1>
        <p className="mt-2 text-sm text-slate/60">
          Owners run the venue. Managers handle staff &amp; settings. Servers
          and Hosts work the floor. Viewers can read reports without changing
          anything. Suspending keeps history; removing wipes the row.
        </p>
      </header>

      <PeoplePanel
        currentEmail={session.email}
        currentRole={session.role}
        currentStaffId={session.staffId}
        assignableRoles={assignableRoles(session.role)}
        tables={tables}
        initial={staff.map(s => ({
          id: s.id,
          name: s.name,
          email: s.email,
          role: s.role,
          section: s.section,
          status: s.status,
          ackedCount: s.ackedRequests.length,
          lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
          invitedAt: s.createdAt.toISOString(),
          invitedBy: s.invitedBy ? { name: s.invitedBy.name, email: s.invitedBy.email } : null,
          tableIds: s.assignments.map(a => a.tableId),
        }))}
      />
    </>
  );
}
