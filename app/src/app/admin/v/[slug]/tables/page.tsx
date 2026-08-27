import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { TablesPanel } from "./tables-panel";
import { can } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · tables" };

export default async function TablesPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/tables`);

  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!venue || venue.id !== session.venueId) return null;

  const [tables, staff] = await Promise.all([
    db.table.findMany({
      where: { venueId: venue.id },
      orderBy: { label: "asc" },
      include: {
        _count: { select: { sessions: true, requests: true } },
        // Floor names only — this page is read over somebody's shoulder
        // in a back office, and `name` can be a legal name.
        assignments: {
          select: { staff: { select: { id: true, name: true, displayName: true } } },
        },
      },
    }),
    db.staffMember.findMany({
      where: { venueId: venue.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, displayName: true, role: true },
    }),
  ]);

  // Legacy STAFF rows were venue creators before RBAC landed.
  const role = session.role === "STAFF" ? "OWNER" : session.role;
  const canAssign = can(role, "staff.assign_tables");

  return (
    <>
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Floor</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Tables</h1>
          <p className="mt-2 text-sm text-slate/60">
            Add tables, say who covers them, and print their QR tents. A
            table with nobody assigned still works — requests just reach the
            whole floor instead of one person. Print codes from{" "}
            <Link href={`/admin/v/${params.slug}/qr-tents`} className="text-umber underline-offset-4 hover:underline">
              QR tents
            </Link>
            .
          </p>
        </div>
      </header>

      <TablesPanel
        slug={params.slug}
        canAssign={canAssign}
        staff={staff.map(s => ({
          id: s.id,
          name: s.displayName ?? s.name,
          role: s.role,
        }))}
        initial={tables.map(t => ({
          id: t.id,
          label: t.label,
          zone: t.zone,
          sessionCount: t._count.sessions,
          requestCount: t._count.requests,
          staff: t.assignments.map(a => ({
            id: a.staff.id,
            name: a.staff.displayName ?? a.staff.name,
          })),
        }))}
      />
    </>
  );
}
