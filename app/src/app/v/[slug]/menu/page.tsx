import { notFound } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { dollars } from "@/lib/bill";
import { planFromOrg, meetsAtLeast } from "@/lib/plans";
import { WishlistHeart } from "./wishlist-heart";

export const dynamic = "force-dynamic";

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type SearchParams = {
  // Guest session id + token, passed in when the guest reaches the menu
  // from their table page. Without these we hide the heart UI.
  sid?: string;
  s?: string;
};

export default async function PublicMenuPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: SearchParams;
}) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      brandColor: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true } },
    },
  });
  if (!venue) notFound();
  // Menu browse is a Growth-tier feature. The API at /api/v/[slug]/menu
  // also 404s for sub-Growth — make the SSR page match so guests on a
  // Starter venue don't see a rendered menu that subsequently goes
  // blank on client refresh. 404 (not 402) so we don't leak which
  // features the venue pays for.
  if (!meetsAtLeast(planFromOrg(venue.org), "growth")) notFound();

  const now = new Date();
  const [categories, uncategorized, promotions] = await Promise.all([
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
    // Live promotions: ACTIVE + within the time window (null sentinels =
    // always-on). Pulled directly so the SSR render is one DB trip.
    db.promotion.findMany({
      where: {
        venueId: venue.id,
        status: "ACTIVE",
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      include: { items: { select: { menuItemId: true } } },
      take: 24,
    }),
  ]);

  const hasAnything = categories.some(c => c.items.length > 0) || uncategorized.length > 0;

  // Index per-item badges by menuItemId so the item row render is O(1).
  // Each entry is the most recent badge-style promo for that item.
  const badgeByItem = new Map<string, { label: string; tone: "chartreuse" | "coral" | "sea" }>();
  for (const p of promotions) {
    if (p.type === "LIMITED_TIME_ITEM" || p.type === "NEW_ITEM" || p.type === "DISCOUNT_HIGHLIGHT") {
      const label =
        p.type === "NEW_ITEM" ? "New"
        : p.type === "LIMITED_TIME_ITEM" ? "Limited"
        : "Deal";
      const tone =
        p.type === "NEW_ITEM" ? "chartreuse"
        : p.type === "LIMITED_TIME_ITEM" ? "coral"
        : "sea";
      for (const it of p.items) {
        if (!badgeByItem.has(it.menuItemId)) badgeByItem.set(it.menuItemId, { label, tone });
      }
    }
  }
  const banners = promotions.filter(p => p.type === "BANNER");
  const pills = promotions.filter(p => p.type === "HAPPY_HOUR" || p.type === "BUSINESS_LUNCH");

  // Resolve the guest session if the URL carried valid sid + s. Only
  // then do we render hearts (and pre-seed their saved state from any
  // existing wishlist). The token has to match constant-time — we
  // don't trust the URL alone.
  const guest = await loadGuestContext(venue.id, searchParams.sid, searchParams.s);
  const savedItemIds = guest?.savedMenuItemIds ?? new Set<string>();

  return (
    <main className="min-h-screen bg-oat text-slate">
      <div className="mx-auto max-w-md px-6 py-10">
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{venue.name}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Menu</h1>
        </header>

        {pills.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {pills.map(p => (
              <span
                key={p.id}
                className="rounded-full bg-chartreuse/50 px-3 py-1 text-xs font-medium text-slate"
                title={p.description ?? undefined}
              >
                {p.title}
              </span>
            ))}
          </div>
        ) : null}

        {banners.length > 0 ? (
          <div className="mb-6 space-y-3">
            {banners.map(p => (
              <div
                key={p.id}
                className="overflow-hidden rounded-2xl border border-sea/40 bg-sea/15"
              >
                {p.bannerImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.bannerImageUrl} alt="" className="h-32 w-full object-cover" />
                ) : null}
                <div className="px-5 py-3">
                  <p className="text-sm font-medium text-slate">{p.title}</p>
                  {p.description ? (
                    <p className="mt-1 text-[12px] text-slate/70">{p.description}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!hasAnything ? (
          <p className="rounded-lg border border-slate/10 bg-white px-5 py-8 text-center text-sm text-slate/60">
            Menu coming soon. Ask your server.
          </p>
        ) : null}

        {categories.map(c => (
          c.items.length === 0 ? null : (
            <section key={c.id} className="mb-8">
              <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-umber">{c.name}</h2>
              <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
                {c.items.map(it => (
                  <li key={it.id} className="flex items-start justify-between px-5 py-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm">{it.name}</span>
                        {it.ageRestricted ? <span className="rounded-full bg-coral/10 px-2 text-[10px] text-coral">21+</span> : null}
                        {badgeByItem.get(it.id) ? (
                          <span
                            className={[
                              "rounded-full px-2 text-[10px]",
                              badgeByItem.get(it.id)!.tone === "chartreuse"
                                ? "bg-chartreuse/40 text-slate"
                                : badgeByItem.get(it.id)!.tone === "coral"
                                ? "bg-coral/20 text-coral"
                                : "bg-sea/25 text-slate/80",
                            ].join(" ")}
                          >
                            {badgeByItem.get(it.id)!.label}
                          </span>
                        ) : null}
                      </div>
                      {it.description ? <p className="mt-1 text-[11px] text-slate/60">{it.description}</p> : null}
                    </div>
                    <div className="ml-3 flex items-center gap-1">
                      <span className="font-mono text-xs">{dollars(it.priceCents)}</span>
                      {guest ? (
                        <WishlistHeart
                          slug={params.slug}
                          menuItemId={it.id}
                          sessionId={guest.sessionId}
                          sessionToken={guest.sessionToken}
                          savedInit={savedItemIds.has(it.id)}
                        />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        ))}

        {uncategorized.length > 0 ? (
          <section className="mb-8">
            <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
              {uncategorized.map(it => (
                <li key={it.id} className="flex items-start justify-between px-5 py-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">{it.name}</span>
                      {it.ageRestricted ? <span className="rounded-full bg-coral/10 px-2 text-[10px] text-coral">21+</span> : null}
                      {badgeByItem.get(it.id) ? (
                        <span
                          className={[
                            "rounded-full px-2 text-[10px]",
                            badgeByItem.get(it.id)!.tone === "chartreuse"
                              ? "bg-chartreuse/40 text-slate"
                              : badgeByItem.get(it.id)!.tone === "coral"
                              ? "bg-coral/20 text-coral"
                              : "bg-sea/25 text-slate/80",
                          ].join(" ")}
                        >
                          {badgeByItem.get(it.id)!.label}
                        </span>
                      ) : null}
                    </div>
                    {it.description ? <p className="mt-1 text-[11px] text-slate/60">{it.description}</p> : null}
                  </div>
                  <div className="ml-3 flex items-center gap-1">
                    <span className="font-mono text-xs">{dollars(it.priceCents)}</span>
                    {guest ? (
                      <WishlistHeart
                        slug={params.slug}
                        menuItemId={it.id}
                        sessionId={guest.sessionId}
                        sessionToken={guest.sessionToken}
                        savedInit={savedItemIds.has(it.id)}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-10 border-t border-slate/5 pt-6 text-center text-[11px] tracking-wide text-slate/40">
          Powered by TabCall
        </footer>
      </div>
    </main>
  );
}

async function loadGuestContext(
  venueId: string,
  sid: string | undefined,
  token: string | undefined
): Promise<{
  sessionId: string;
  sessionToken: string;
  savedMenuItemIds: Set<string>;
} | null> {
  if (!sid || !token) return null;
  const session = await db.guestSession.findUnique({
    where: { id: sid },
    select: { id: true, sessionToken: true, venueId: true, expiresAt: true, paidAt: true },
  });
  if (!session || session.venueId !== venueId) return null;
  if (!tokensEqual(session.sessionToken, token)) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (session.paidAt) return null;

  const wishlist = await db.wishlist.findUnique({
    where: { guestSessionId: session.id },
    select: { items: { select: { menuItemId: true } } },
  });
  const ids = new Set<string>();
  for (const it of wishlist?.items ?? []) ids.add(it.menuItemId);

  return {
    sessionId: session.id,
    sessionToken: session.sessionToken,
    savedMenuItemIds: ids,
  };
}
