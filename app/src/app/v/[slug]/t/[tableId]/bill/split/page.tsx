import Link from "next/link";
import { notFound } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { parseLineItems, totalsFor, dollars } from "@/lib/bill";
import { SplitScreen } from "./split-screen";

export const dynamic = "force-dynamic";

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type PageProps = {
  params: { slug: string; tableId: string };
  searchParams: { s?: string };
};

export default async function SplitPage({ params, searchParams }: PageProps) {
  const venue = await db.venue.findUnique({ where: { slug: params.slug } });
  if (!venue) notFound();

  const tableSeg = safeDecode(params.tableId);
  const session = await db.guestSession.findFirst({
    where: {
      venueId: venue.id,
      OR: [{ tableId: tableSeg }, { table: { label: tableSeg } }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      table: { select: { label: true } },
      splits: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) notFound();

  const providedToken = searchParams.s ?? "";
  if (!providedToken || !tokensEqual(session.sessionToken, providedToken)) {
    return (
      <main className="flex min-h-screen flex-col bg-oat text-slate">
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-3xl">·</p>
            <h1 className="mt-3 text-2xl font-medium tracking-tight">Scan the QR</h1>
            <p className="mt-3 text-sm text-slate/60">
              Open this link from your table&rsquo;s bill screen so we know it&rsquo;s yours.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (session.paidAt) {
    return (
      <main className="flex min-h-screen flex-col bg-oat text-slate">
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-3xl">·</p>
            <h1 className="mt-3 text-2xl font-medium tracking-tight">Tab paid</h1>
            <p className="mt-3 text-sm text-slate/60">
              All splits settled. Thanks for visiting {venue.name}.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const items = parseLineItems(session.lineItems);
  const totals = totalsFor(items, venue.zipCode ?? "", 0);
  const subtotalPlusTax = totals.subtotalCents + totals.taxCents;

  return (
    <main className="min-h-screen bg-oat text-slate">
      <div className="mx-auto flex max-w-md flex-col px-6 py-8">
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{venue.name}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">{session.table.label} · split</h1>
          <p className="mt-1 text-sm text-slate/60">
            Bill total before tip: {dollars(subtotalPlusTax)}
          </p>
          <p className="mt-2 text-[11px] text-slate/50">
            <Link
              href={`/v/${venue.slug}/t/${encodeURIComponent(tableSeg)}/bill?s=${encodeURIComponent(providedToken)}`}
              className="underline-offset-4 hover:underline"
            >
              ← back to single-bill view
            </Link>
          </p>
        </header>

        <SplitScreen
          slug={venue.slug}
          tableLabel={session.table.label}
          sessionId={session.id}
          sessionToken={providedToken}
          subtotalPlusTaxCents={subtotalPlusTax}
          initialSplits={session.splits.map(s => ({
            id: s.id,
            label: s.label,
            amountCents: s.amountCents,
            tipPercent: s.tipPercent,
            paidAt: s.paidAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </main>
  );
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}
