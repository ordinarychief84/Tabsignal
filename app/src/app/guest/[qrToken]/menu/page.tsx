import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { resolveByQrToken } from "@/lib/session";
import { dollars } from "@/lib/bill";
import { planFromOrg, meetsAtLeast } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: { qrToken: string } };

export default async function GuestQrMenuPage({ params }: PageProps) {
  let resolved;
  try {
    resolved = await resolveByQrToken(params.qrToken);
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (code === "VENUE_NOT_FOUND" || code === "TABLE_NOT_FOUND") notFound();
    return <InvalidScan reason={code} />;
  }

  // Menu browse is a Growth-tier feature. Mirror the SSR gating used by
  // /v/[slug]/menu so a Starter venue's menu page 404s here too. 404
  // (not 402) so we don't leak which features the venue pays for.
  const venue = await db.venue.findUnique({
    where: { id: resolved.venueId },
    select: {
      id: true,
      name: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true } },
    },
  });
  if (!venue) notFound();
  if (!meetsAtLeast(planFromOrg(venue.org), "growth")) notFound();

  const [categories, uncategorized] = await Promise.all([
    db.menuCategory.findMany({
      where: { venueId: venue.id, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        items: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
    }),
    db.menuItem.findMany({
      where: { venueId: venue.id, isActive: true, categoryId: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const hasAnything =
    categories.some(c => c.items.length > 0) || uncategorized.length > 0;

  return (
    <main className="text-slate">
      <div className="mx-auto max-w-md px-6 py-10">
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
            {venue.name}
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Menu</h1>
          <p className="mt-1 text-sm text-slate/60">{resolved.tableLabel}</p>
        </header>

        {!hasAnything ? (
          <p className="rounded-lg border border-slate/10 bg-white px-5 py-8 text-center text-sm text-slate/60">
            Menu coming soon. Ask your server.
          </p>
        ) : null}

        {categories.map(c =>
          c.items.length === 0 ? null : (
            <section key={c.id} className="mb-8">
              <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-umber">
                {c.name}
              </h2>
              <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
                {c.items.map(it => (
                  <li
                    key={it.id}
                    className="flex items-start justify-between px-5 py-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{it.name}</span>
                        {it.ageRestricted ? (
                          <span className="rounded-full bg-coral/10 px-2 text-[10px] text-coral">
                            21+
                          </span>
                        ) : null}
                      </div>
                      {it.description ? (
                        <p className="mt-1 text-[11px] text-slate/60">
                          {it.description}
                        </p>
                      ) : null}
                    </div>
                    <span className="ml-3 font-mono text-xs">
                      {dollars(it.priceCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )
        )}

        {uncategorized.length > 0 ? (
          <section className="mb-8">
            <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
              {uncategorized.map(it => (
                <li
                  key={it.id}
                  className="flex items-start justify-between px-5 py-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{it.name}</span>
                      {it.ageRestricted ? (
                        <span className="rounded-full bg-coral/10 px-2 text-[10px] text-coral">
                          21+
                        </span>
                      ) : null}
                    </div>
                    {it.description ? (
                      <p className="mt-1 text-[11px] text-slate/60">
                        {it.description}
                      </p>
                    ) : null}
                  </div>
                  <span className="ml-3 font-mono text-xs">
                    {dollars(it.priceCents)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-10 flex flex-col items-center gap-3">
          <Link
            href={`/guest/${encodeURIComponent(params.qrToken)}/cart`}
            className="rounded-full bg-slate px-5 py-2 text-sm text-oat hover:bg-slate/90"
          >
            Review cart →
          </Link>
          <Link
            href={`/guest/${encodeURIComponent(params.qrToken)}`}
            className="text-sm text-slate/60 underline-offset-4 hover:text-slate hover:underline"
          >
            ← back to table
          </Link>
        </div>
      </div>
    </main>
  );
}

function InvalidScan({ reason }: { reason: string }) {
  return (
    <main className="flex flex-1 flex-col text-slate">
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="max-w-sm text-center">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium">QR code expired</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate/60">
            Ask your server for a fresh code, or speak with them directly.
          </p>
          <p className="mt-6 font-mono text-[10px] tracking-wider text-slate/30">
            {reason}
          </p>
        </div>
      </div>
    </main>
  );
}
