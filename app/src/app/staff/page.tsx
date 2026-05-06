import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { StaffQueue } from "./queue";
import { LiveClock } from "./live-clock";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const staff = await db.staffMember.findUnique({
    where: { id: session.staffId },
    include: {
      venue: { select: { id: true, name: true } },
      assignments: { include: { table: { select: { id: true, label: true } } } },
    },
  });
  if (!staff) redirect("/staff/login?err=invalid");
  const assignedTableIds = staff.assignments.map(a => a.table.id);
  const assignedTableLabels = staff.assignments.map(a => a.table.label);

  return (
    <main className="min-h-screen bg-slate text-oat">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-slate/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] uppercase tracking-[0.18em] text-oat/40">
              {staff.venue.name}
            </p>
            <p className="text-sm font-medium text-oat">Live queue</p>
          </div>
          <LiveClock />
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-medium text-oat/70 hover:text-oat"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="mx-auto max-w-md px-4 py-5">
        <StaffQueue
          venueId={staff.venue.id}
          staffId={staff.id}
          assignedTableIds={assignedTableIds}
        />
        <p className="mt-8 text-center text-[10px] tracking-[0.16em] text-oat/30">
          {staff.name}
          {assignedTableLabels.length > 0
            ? ` · covers ${assignedTableLabels.join(", ")}`
            : ""}
        </p>
      </section>
    </main>
  );
}
