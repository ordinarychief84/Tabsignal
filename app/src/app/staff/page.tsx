import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { StaffQueue } from "./queue";
import { LiveClock } from "./live-clock";
import { FcmRegister } from "./fcm-register";
import { OpenTabs } from "./open-tabs";
import { ShiftControl } from "./shift-control";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const staff = await db.staffMember.findUnique({
    where: { id: session.staffId },
    include: {
      venue: { select: { id: true, name: true, slug: true } },
      assignments: { include: { table: { select: { id: true, label: true } } } },
    },
  });
  if (!staff) redirect("/staff/login?err=invalid");
  const assignedTableIds = staff.assignments.map(a => a.table.id);
  // Legacy STAFF rows were venue creators before RBAC landed, so they carry
  // owner privileges — same mapping the onboarding route uses.
  const canManage = ["OWNER", "MANAGER", "STAFF"].includes(session.role);
  const assignedTableLabels = staff.assignments.map(a => a.table.label);

  return (
    <main className="min-h-screen bg-oat text-slate">
      {/* Two rows on purpose. Venue name, clock, Watch and Sign out were
          previously competing for one 375px line, which truncated the venue
          name and wrapped "Sign out" onto two lines inside its own button.
          Identity on top, actions underneath, each with room to breathe. */}
      <header className="sticky top-0 z-10 border-b border-umber-soft/30 bg-oat/85 backdrop-blur">
        <div className="mx-auto max-w-md px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[10px] uppercase tracking-[0.18em] text-umber">
                {staff.venue.name}
              </p>
              <p className="text-sm font-medium text-slate">Live queue</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* Where they are right now, next to the time. Requests route
                  around this — see lib/shift for why availability is a
                  preference rather than a gate. */}
              <ShiftControl
                initial={staff.shiftStatus}
                initialStartedAt={staff.shiftStartedAt?.toISOString() ?? null}
              />
              <LiveClock />
            </div>
          </div>

          <nav aria-label="Staff" className="mt-2.5 flex items-center gap-1.5 overflow-x-auto">
            {/* Managers and owners land here after sign-in like everyone else,
                and previously had no route to their own dashboard — they had
                to type the URL. */}
            {canManage ? (
              <Link
                href={`/admin/v/${staff.venue.slug}`}
                className="shrink-0 whitespace-nowrap rounded-lg border border-slate/20 bg-slate px-3 py-1.5 text-[11px] font-medium text-oat hover:bg-slate/90"
              >
                Dashboard
              </Link>
            ) : null}
            <Link
              href="/staff/watch"
              className="shrink-0 whitespace-nowrap rounded-lg border border-umber-soft/40 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate"
            >
              ⌚ Watch
            </Link>
            <Link
              href="/staff/account/password"
              className="shrink-0 whitespace-nowrap rounded-lg border border-umber-soft/40 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate"
            >
              Password
            </Link>
            <form action="/api/auth/logout" method="post" className="ml-auto shrink-0">
              <button
                type="submit"
                className="whitespace-nowrap rounded-lg border border-umber-soft/40 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      <FcmRegister />

      <section className="mx-auto max-w-md px-4 py-5">
        <StaffQueue
          venueId={staff.venue.id}
          venueSlug={staff.venue.slug}
          staffId={staff.id}
          assignedTableIds={assignedTableIds}
        />

        {/* Below the queue on purpose — see the note in open-tabs.tsx for
            why this isn't a fifth tab inside it. Renders nothing when no
            table has anything on its tab. */}
        <OpenTabs venueId={staff.venue.id} assignedTableIds={assignedTableIds} />
        <p className="mt-8 text-center text-[10px] tracking-[0.16em] text-slate/40">
          {staff.name}
          {assignedTableLabels.length > 0
            ? ` · covers ${assignedTableLabels.join(", ")}`
            : ""}
        </p>
      </section>
    </main>
  );
}
