import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { TablesPanel } from "./tables-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · tables" };

export default async function TablesPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/tables`);

  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!venue || venue.id !== session.venueId) return null;

  const tables = await db.table.findMany({
    where: { venueId: venue.id },
    orderBy: { label: "asc" },
    include: { _count: { select: { sessions: true, requests: true, preOrders: true } } },
  });

  return (
    <>
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Floor</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Tables</h1>
          <p className="mt-2 text-sm text-slate/60">
            Add, rename, or remove tables. Each table has its own QR tent. Print
            them from{" "}
            <Link href={`/admin/v/${params.slug}/qr-tents`} className="text-umber underline-offset-4 hover:underline">
              QR tents
            </Link>
            .
          </p>
        </div>
      </header>

      <TablesPanel
        slug={params.slug}
        initial={tables.map(t => ({
          id: t.id,
          label: t.label,
          zone: t.zone,
          sessionCount: t._count.sessions,
          requestCount: t._count.requests,
          preOrderCount: t._count.preOrders,
        }))}
      />
    </>
  );
}
