import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { BillsPanel } from "./bills-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — bills" };

// V2 Bills queue. Read-only browsing view: total / paid / due, click a row
// to drill into the split details. Mutating actions (refunds, manual mark-
// paid) live elsewhere; this page is for visibility into what's been paid
// and what's still outstanding.
export default async function BillsPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/bills`);

  const role = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(role, "bills.view")) {
    redirect(`/admin/v/${params.slug}`);
  }

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const bills = await db.bill.findMany({
    where: { venueId: venue.id, createdAt: { gte: since } },
    include: {
      table: { select: { label: true } },
      items: { orderBy: { createdAt: "asc" } },
      splits: { include: { splitItems: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  const initial = bills.map(b => ({
    id: b.id,
    status: b.status,
    tableLabel: b.table?.label ?? null,
    totalCents: b.totalCents,
    amountPaidCents: b.amountPaidCents,
    amountDueCents: b.amountDueCents,
    splitCount: b.splits.length,
    itemCount: b.items.length,
    createdAt: b.createdAt.toISOString(),
    items: b.items.map(i => ({
      id: i.id,
      nameSnapshot: i.nameSnapshot,
      priceCents: i.priceCents,
      quantity: i.quantity,
      status: i.status,
      paidBySplitId: i.paidBySplitId,
    })),
    splits: b.splits.map(s => ({
      id: s.id,
      status: s.status,
      totalCents: s.totalCents,
      tipCents: s.tipCents,
      paidAt: s.paidAt?.toISOString() ?? null,
      billItemIds: s.splitItems.map(si => si.billItemId),
    })),
  }));

  const counts = { open: 0, partial: 0, paid: 0 };
  for (const b of initial) {
    if (b.status === "OPEN") counts.open += 1;
    else if (b.status === "PARTIAL") counts.partial += 1;
    else if (b.status === "PAID") counts.paid += 1;
  }

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{venue.name}</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Bills</h1>
        <p className="mt-2 text-sm text-slate/60">
          Every tab the guests have opened. Expand a row to see the
          item-level splits and what each payer covered.
        </p>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Open"    value={String(counts.open)}    hint="No payments yet" />
        <Stat label="Partial" value={String(counts.partial)} hint="Some splits paid" coral={counts.partial > 0} />
        <Stat label="Paid"    value={String(counts.paid)}    hint="Fully settled"    />
      </div>

      <BillsPanel slug={params.slug} initial={initial} />
    </>
  );
}

function Stat({ label, value, hint, coral = false }: { label: string; value: string; hint?: string; coral?: boolean }) {
  return (
    <div className={[
      "rounded-2xl border bg-white px-5 py-4",
      coral ? "border-coral/40" : "border-slate/10",
    ].join(" ")}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
      <p className={[
        "mt-2 font-mono text-3xl tabular-nums",
        coral ? "text-coral" : "text-slate",
      ].join(" ")}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate/50">{hint}</p> : null}
    </div>
  );
}
