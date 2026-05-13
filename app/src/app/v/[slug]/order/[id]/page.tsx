import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { dollars, parseLineItems } from "@/lib/bill";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { slug: string; id: string };
  searchParams: { code?: string };
};

export default async function OrderConfirmationPage({ params, searchParams }: PageProps) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true },
  });
  if (!venue) notFound();

  const code = searchParams.code ?? "";
  const order = await db.preOrder.findFirst({
    where: { id: params.id, venueId: venue.id, pickupCode: code },
  });
  if (!order) notFound();

  const items = parseLineItems(order.items);

  const statusLabel = (() => {
    if (order.pickedUpAt) return "Picked up. Thanks!";
    if (order.readyAt) return "Ready at the bar. Show this code.";
    if (order.paidAt) return "Paid. We're making it.";
    return "Waiting for payment confirmation…";
  })();

  return (
    <main className="min-h-screen bg-oat text-slate">
      <div className="mx-auto max-w-md px-6 py-10">
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{venue.name}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Pickup code</h1>
        </header>

        <section className="mb-6 rounded-2xl border border-slate/10 bg-white p-8 text-center">
          <p className="font-mono text-6xl tracking-widest">{order.pickupCode}</p>
          <p className="mt-3 text-sm text-slate/60">{statusLabel}</p>
        </section>

        <section className="rounded-2xl border border-slate/10 bg-white">
          <header className="border-b border-slate/10 px-5 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Order</p>
          </header>
          <ul className="divide-y divide-slate/5">
            {items.map((it, i) => (
              <li key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="text-slate/50">{it.quantity}× </span>
                  {it.name}
                </span>
                <span className="font-mono text-xs">{dollars(it.unitCents * it.quantity)}</span>
              </li>
            ))}
          </ul>
          <footer className="border-t border-slate/10 px-5 py-3 text-sm">
            <div className="flex justify-between text-slate/70"><span>Subtotal</span><span className="font-mono">{dollars(order.subtotalCents)}</span></div>
            <div className="flex justify-between text-slate/70"><span>Tip</span><span className="font-mono">{dollars(order.tipCents)}</span></div>
            <div className="mt-1 flex justify-between border-t border-slate/10 pt-1 font-medium"><span>Total</span><span className="font-mono">{dollars(order.totalCents)}</span></div>
          </footer>
        </section>
      </div>
    </main>
  );
}
