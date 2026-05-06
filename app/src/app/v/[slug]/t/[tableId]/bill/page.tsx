import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseLineItems, totalsFor } from "@/lib/bill";
import { BillScreen } from "./bill-screen";

const DEFAULT_TIP_PERCENT = 20;

export const dynamic = "force-dynamic";

export default async function BillPage({ params }: { params: { slug: string; tableId: string } }) {
  const venue = await db.venue.findUnique({ where: { slug: params.slug } });
  if (!venue) notFound();

  const tableSeg = safeDecode(params.tableId);
  const session = await db.guestSession.findFirst({
    where: {
      venueId: venue.id,
      OR: [{ tableId: tableSeg }, { table: { label: tableSeg } }],
      paidAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    include: { table: { select: { label: true } } },
  });
  if (!session) notFound();

  const items = parseLineItems(session.lineItems);
  const totals = totalsFor(items, venue.zipCode ?? "", DEFAULT_TIP_PERCENT);

  return (
    <main className="min-h-screen bg-oat text-slate">
      <div className="mx-auto flex max-w-md flex-col px-6 py-8">
        <header className="mb-7">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{venue.name}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">{session.table.label}</h1>
          <p className="mt-1 text-sm text-slate/60">Your bill</p>
        </header>

        <BillScreen
          slug={venue.slug}
          zipCode={venue.zipCode ?? ""}
          data={{
            sessionId: session.id,
            venueName: venue.name,
            tableLabel: session.table.label,
            items,
            defaultTipPercent: DEFAULT_TIP_PERCENT,
            totals,
          }}
        />
      </div>
    </main>
  );
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}
