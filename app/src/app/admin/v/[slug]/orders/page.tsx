import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { OrdersPanel } from "./orders-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — orders" };

// V2 Guest Commerce Module orders queue. Distinct from the older PreOrder
// flow (which lives behind plan-gate at `growth`); these are the Order rows
// minted by /api/v/[slug]/orders POST. Status-tabbed view mirrors the live
// requests page so a manager can pivot between the two without retraining.
export default async function OrdersPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/orders`);

  // Permission gate. Action routes re-gate writes server-side; this is the
  // page-level check so a Server / Viewer doesn't see the admin queue at
  // all. Treat legacy 'STAFF' as OWNER (same normalization plan-gate uses).
  const role = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(role, "orders.manage")) {
    redirect(`/admin/v/${params.slug}`);
  }

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  // Initial dataset: NEW/ACCEPTED/PREPARING/READY first, recent SERVED +
  // CANCELLED for the "Completed" tab. 30-day window matches the API.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const orders = await db.order.findMany({
    where: { venueId: venue.id, createdAt: { gte: since } },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      table: { select: { label: true } },
      bill: { select: { id: true, status: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  const initial = orders.map(o => ({
    id: o.id,
    status: o.status,
    tableLabel: o.table?.label ?? null,
    subtotalCents: o.subtotalCents,
    totalCents: o.totalCents,
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    createdAt: o.createdAt.toISOString(),
    billId: o.bill?.id ?? null,
    billStatus: o.bill?.status ?? null,
    items: o.items.map(i => ({
      id: i.id,
      nameSnapshot: i.nameSnapshot,
      priceCents: i.priceCents,
      quantity: i.quantity,
      notes: i.notes,
      status: i.status,
    })),
  }));

  // Bucket counts for the summary cards. Mirrors the panel's filter buckets
  // so the header stays in sync with the tabs.
  const counts = { open: 0, preparing: 0, ready: 0, completed: 0 };
  for (const o of initial) {
    if (o.status === "NEW" || o.status === "ACCEPTED") counts.open += 1;
    else if (o.status === "PREPARING") counts.preparing += 1;
    else if (o.status === "READY") counts.ready += 1;
    else counts.completed += 1; // SERVED or CANCELLED
  }

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{venue.name}</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Orders</h1>
        <p className="mt-2 text-sm text-slate/60">
          Every tab a guest has opened from the QR. Walk an order through the
          line — accept, prep, ready, served — without leaving the console.
        </p>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open"      value={String(counts.open)}      hint="New + accepted" />
        <Stat label="Preparing" value={String(counts.preparing)} hint="On the line"    />
        <Stat label="Ready"     value={String(counts.ready)}     hint="Awaiting handoff" coral={counts.ready > 0} />
        <Stat label="Completed" value={String(counts.completed)} hint="Last 30 days"   />
      </div>

      <OrdersPanel slug={params.slug} initial={initial} />
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
