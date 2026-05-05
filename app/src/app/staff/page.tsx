import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { StaffQueue } from "./queue";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login");

  const staff = await db.staffMember.findUnique({
    where: { id: session.staffId },
    include: { venue: { select: { id: true, name: true } } },
  });
  if (!staff) redirect("/staff/login?err=invalid");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">{staff.venue.name}</p>
          <h1 className="text-xl font-semibold text-slate-900">Live queue</h1>
          <p className="mt-1 text-xs text-slate-500">{staff.name}</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600"
          >
            Sign out
          </button>
        </form>
      </header>

      <StaffQueue venueId={staff.venue.id} staffId={staff.id} />
    </main>
  );
}
