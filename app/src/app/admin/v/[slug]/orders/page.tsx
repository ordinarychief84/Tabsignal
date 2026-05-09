import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { venuePlanForVenueId } from "@/lib/plan-gate";
import { meetsAtLeast } from "@/lib/plans";
import { UpgradeRequired } from "../upgrade-required";
import { OrdersPanel } from "./orders-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — orders" };

export default async function OrdersPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/orders`);

  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!venue || venue.id !== session.venueId) return null;

  const plan = await venuePlanForVenueId(venue.id);
  if (!meetsAtLeast(plan, "growth")) {
    return (
      <>
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Pre-orders</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Order queue</h1>
        </header>
        <UpgradeRequired slug={params.slug} feature="Pre-order at QR" current={plan} required="growth" />
      </>
    );
  }

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Pre-orders</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Order queue</h1>
        <p className="mt-2 text-sm text-slate/60">
          Guests who scanned the &ldquo;order ahead&rdquo; QR. Mark ready when you&rsquo;ve made it,
          picked up when they grab it.
        </p>
      </header>

      <OrdersPanel slug={params.slug} />
    </>
  );
}
