import Link from "next/link";
import { notFound } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { dollars, totalsFor } from "@/lib/bill";
import { tabItems } from "@/domain/billing/tab";
import { GuestBackLink } from "@/components/guest/back-link";

const DEFAULT_TIP_PERCENT = 20;

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

export default async function BillPage({ params, searchParams }: PageProps) {
  const venue = await db.venue.findUnique({ where: { slug: params.slug } });
  if (!venue) notFound();

  const tableSeg = safeDecode(params.tableId);
  // Look up the latest session for this table regardless of paid state.
  // A guest who paid and reloads should see "thanks", not a 404.
  const session = await db.guestSession.findFirst({
    where: {
      venueId: venue.id,
      OR: [{ tableId: tableSeg }, { table: { label: tableSeg } }],
    },
    orderBy: { createdAt: "desc" },
    include: { table: { select: { label: true } } },
  });
  if (!session) notFound();

  // Privacy: only the guest who owns this tab can see the bill. Without a
  // matching token, anyone with the slug + table label could navigate
  // directly and read the prior party's line items.
  const providedToken = searchParams.s ?? "";
  if (!providedToken || !tokensEqual(session.sessionToken, providedToken)) {
    return (
      <main className="flex min-h-screen flex-col bg-oat text-slate">
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-3xl">·</p>
            <h1 className="mt-3 text-2xl font-medium tracking-tight">Scan the QR</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate/60">
              Bills are tied to your scan. Scan the table QR or tap &ldquo;Get the bill&rdquo;
              from the table page to view yours.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Already paid → success state with feedback CTA.
  if (session.paidAt) {
    return (
      <main className="flex min-h-screen flex-col bg-oat text-slate">
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-3xl">·</p>
            <h1 className="mt-3 text-2xl font-medium tracking-tight">Tab paid</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate/60">
              Thanks for visiting {venue.name}. We&rsquo;ll get out of your way.
            </p>
            <Link
              href={`/v/${venue.slug}/t/${encodeURIComponent(tableSeg)}/feedback?s=${encodeURIComponent(session.sessionToken)}`}
              className="mt-6 inline-block rounded-full bg-slate px-5 py-2 text-sm text-oat hover:bg-slate/90"
            >
              Leave feedback
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Expired (open but past TTL) → ask staff for fresh QR.
  if (session.expiresAt.getTime() <= Date.now()) {
    return (
      <main className="flex min-h-screen flex-col bg-oat text-slate">
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-3xl">·</p>
            <h1 className="mt-3 text-2xl font-medium tracking-tight">Tab expired</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate/60">
              Ask your server for a fresh QR. This one timed out.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const items = tabItems(session.lineItems);
  const totals = totalsFor(items);
  const tokenSegment = `?s=${encodeURIComponent(session.sessionToken)}`;

  return (
    <main className="min-h-screen bg-oat text-slate">
      <div className="mx-auto flex max-w-md flex-col px-6 py-8">
        <header className="mb-7">
          <GuestBackLink
            href={`/v/${venue.slug}/t/${encodeURIComponent(session.table.label)}${tokenSegment}`}
            label={`Back to ${session.table.label}`}
          />
          <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-umber">{venue.name}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">{session.table.label}</h1>
          <p className="mt-1 text-sm text-slate/60">Your tab so far</p>
        </header>

        {/* Read-only. TabCall doesn't take payment — this is a running
            record so a guest can see what they've had before settling with
            staff, which is where tax and tipping now happen. */}
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate/15 bg-white/50 px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate">Nothing on your tab yet</p>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-slate/50">
              Anything your server adds will show up here.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate/5 overflow-hidden rounded-2xl border border-slate/10 bg-white">
              {items.map((it, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4 px-5 py-3.5">
                  <span className="min-w-0 text-sm text-slate">
                    {it.quantity > 1 ? <span className="text-slate/45">{it.quantity}× </span> : null}
                    {it.name}
                  </span>
                  <span className="shrink-0 font-mono text-sm text-slate">
                    {dollars(it.quantity * it.unitCents)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-baseline justify-between rounded-2xl bg-white px-5 py-4">
              <span className="text-sm font-medium text-slate">Total</span>
              <span className="font-mono text-lg font-semibold text-slate">
                {dollars(totals.totalCents)}
              </span>
            </div>

            <p className="mt-3 px-1 text-[12px] leading-relaxed text-slate/50">
              Settle with your server when you&rsquo;re ready — they&rsquo;ll add any tax and tip on the
              venue&rsquo;s own card machine.
            </p>
          </>
        )}

        <div className="mt-8 text-center">
          <a
            href={`/v/${venue.slug}/t/${encodeURIComponent(session.table.label)}/feedback${tokenSegment}`}
            className="text-[13px] text-slate/55 underline-offset-4 hover:text-slate hover:underline"
          >
            ⭐ Rate your service
          </a>
        </div>
      </div>
    </main>
  );
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}
