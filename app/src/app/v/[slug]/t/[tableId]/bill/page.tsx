import Link from "next/link";
import { notFound } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { parseLineItems, totalsFor } from "@/lib/bill";
import { BillScreen } from "./bill-screen";

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
              Ask your server for a fresh QR — this one timed out.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const items = parseLineItems(session.lineItems);
  // Honor a previously-chosen tip rather than always resetting to 20%.
  const tipPercent =
    typeof session.tipPercent === "number" && session.tipPercent >= 0
      ? session.tipPercent
      : DEFAULT_TIP_PERCENT;
  const totals = totalsFor(items, venue.zipCode ?? "", tipPercent);

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
            sessionToken: session.sessionToken,
            venueName: venue.name,
            tableLabel: session.table.label,
            items,
            defaultTipPercent: tipPercent,
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
