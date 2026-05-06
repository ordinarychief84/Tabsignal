import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { StaffPanel } from "./staff-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — staff" };

export default async function StaffAdminPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/staff`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const staff = await db.staffMember.findMany({
    where: { venueId: venue.id },
    orderBy: { createdAt: "asc" },
    include: { ackedRequests: { select: { id: true } } },
  });

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Team</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Staff</h1>
        <p className="mt-2 text-sm text-slate/60">
          Add a server, bartender, or manager. They sign in by emailing themselves a link.
        </p>
      </header>

      <StaffPanel
        currentEmail={session.email}
        initial={staff.map(s => ({
          id: s.id,
          name: s.name,
          email: s.email,
          role: s.role,
          ackedCount: s.ackedRequests.length,
          createdAt: s.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
