import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { TipsPanel } from "./tips-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — tips" };

export default async function TipsPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/tips`);

  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!venue || venue.id !== session.venueId) return null;

  const staff = await db.staffMember.findMany({
    where: { venueId: venue.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Pooling</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Tip pool</h1>
        <p className="mt-2 text-sm text-slate/60">
          Open a pool for the shift, set who&rsquo;s working and their weight, then close
          to compute payouts. Cash settles outside this app — we just do the math.
        </p>
      </header>

      <TipsPanel slug={params.slug} staff={staff} />
    </>
  );
}
