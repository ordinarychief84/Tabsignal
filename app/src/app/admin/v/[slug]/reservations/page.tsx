import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { venuePlanForVenueId } from "@/lib/plan-gate";
import { meetsAtLeast } from "@/lib/plans";
import { UpgradeRequired } from "../upgrade-required";
import { ReservationsPanel } from "./reservations-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — reservations" };

export default async function ReservationsPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { date?: string };
}) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/reservations`);

  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!venue || venue.id !== session.venueId) return null;

  const plan = await venuePlanForVenueId(venue.id);
  if (!meetsAtLeast(plan, "pro")) {
    return (
      <>
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Bookings</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Reservations</h1>
        </header>
        <UpgradeRequired slug={params.slug} feature="Reservations" current={plan} required="pro" />
      </>
    );
  }

  const dateParam = searchParams.date ?? new Date().toISOString().slice(0, 10);

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Bookings</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Reservations</h1>
        <p className="mt-2 text-sm text-slate/60">
          Mark guests as arrived, seated, or no-show. Cancel from the row menu.
        </p>
      </header>

      <ReservationsPanel slug={params.slug} initialDate={dateParam} />
    </>
  );
}
