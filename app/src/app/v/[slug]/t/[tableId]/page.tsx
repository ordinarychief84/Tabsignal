import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { resolveGuestSession } from "@/lib/session";
import { tabItems } from "@/domain/billing/tab";
import { GuestRequestPanel } from "./request-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STALE_AFTER_MIN = 20;

type PageProps = {
  params: { slug: string; tableId: string };
  searchParams: { s?: string };
};

/**
 * Guest QR landing — the "After Dark" surface. A dark, venue-branded
 * canvas with a press-and-hold beacon instead of a form: guests pick a
 * signal, hold the beacon to send it, and watch a live Sent → Seen
 * timeline as staff acknowledge. Venue.brandColor drives the ambient
 * glow so every venue's page feels like *their* room.
 */
export default async function GuestPage({ params, searchParams }: PageProps) {
  const tableSeg = safeDecode(params.tableId);
  let resolved;
  try {
    resolved = await resolveGuestSession(params.slug, tableSeg, searchParams.s ?? null);
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (code === "VENUE_NOT_FOUND" || code === "TABLE_NOT_FOUND") notFound();
    return <InvalidScan reason={code} />;
  }

  // Stale-tab detection + venue guest-copy overrides + branding, one call.
  const session = await db.guestSession.findUnique({
    where: { id: resolved.sessionId },
    select: {
      lineItems: true,
      venue: {
        select: {
          guestWelcomeMessage: true,
          guestConfirmationMessage: true,
          brandColor: true,
          logoUrl: true,
        },
      },
      requests: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  // Live BANNER promotions for this venue — same filter as the guest API.
  const now = new Date();
  const banners = await db.promotion.findMany({
    where: {
      venueId: resolved.venueId,
      status: "ACTIVE",
      type: "BANNER",
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: 6,
  });

  const items = session ? tabItems(session.lineItems) : [];
  const lastRequestAt = session?.requests[0]?.createdAt ?? null;
  const minutesSinceLast = lastRequestAt
    ? (Date.now() - lastRequestAt.getTime()) / 60_000
    : null;
  const isStale =
    items.length > 0 &&
    (lastRequestAt === null || (minutesSinceLast ?? 0) > STALE_AFTER_MIN);
  const welcomeMessage = session?.venue?.guestWelcomeMessage ?? null;
  const confirmationMessage = session?.venue?.guestConfirmationMessage ?? null;
  const brandColor = session?.venue?.brandColor ?? "#F2E7B7";
  const logoUrl = session?.venue?.logoUrl ?? null;

  return (
    <main
      className="guest-dark guest-grain flex min-h-screen flex-col"
      style={{ "--brand": brandColor } as React.CSSProperties}
    >
      <header className="px-6 pt-9 pb-2 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={resolved.venueName}
            className="mx-auto mb-3 h-12 w-12 rounded-2xl border border-white/10 object-cover"
          />
        ) : null}
        <p className="text-[11px] uppercase tracking-[0.32em] text-white/45">
          {resolved.venueName}
        </p>
        <h1 className="mt-1.5 text-[34px] font-medium leading-none tracking-tight text-white">
          {resolved.tableLabel}
        </h1>
        <p className="mx-auto mt-2.5 max-w-[36ch] text-[13px] leading-relaxed text-white/55">
          {welcomeMessage ?? "Pick a signal, hold the beacon. Your server sees it the second you let go."}
        </p>
      </header>

      {banners.length > 0 ? (
        <div className="space-y-2 px-6 pb-2 pt-3">
          {banners.map(p => (
            <div key={p.id} className="guest-card overflow-hidden rounded-2xl">
              {p.bannerImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.bannerImageUrl} alt="" className="h-24 w-full object-cover" />
              ) : null}
              <div className="px-4 py-2.5">
                <p className="text-sm font-medium text-white">{p.title}</p>
                {p.description ? (
                  <p className="mt-0.5 text-[12px] text-white/55">{p.description}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <GuestRequestPanel
        sessionId={resolved.sessionId}
        sessionToken={resolved.sessionToken}
        slug={params.slug}
        tableLabel={resolved.tableLabel}
        confirmationMessage={confirmationMessage}
        prevTab={isStale ? {
          itemCount: items.length,
          lastRequestMinAgo: minutesSinceLast === null ? null : Math.round(minutesSinceLast),
        } : null}
      />

      <footer className="mt-auto px-6 pb-6 pt-4">
        <div className="flex items-center justify-center gap-4 text-[11px] tracking-wide">
          <Link
            href={`/v/${params.slug}/t/${encodeURIComponent(resolved.tableLabel)}/wishlist?s=${encodeURIComponent(resolved.sessionToken)}`}
            className="text-white/40 underline-offset-4 transition-colors hover:text-white/80 hover:underline"
          >
            Wishlist
          </Link>
          <span className="text-white/15">·</span>
          <p className="text-white/25">Powered by TabCall</p>
        </div>
      </footer>
    </main>
  );
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

function InvalidScan({ reason }: { reason: string }) {
  return (
    <main className="guest-dark guest-grain flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="guest-card max-w-sm rounded-3xl px-8 py-10 text-center">
          <p aria-hidden className="text-3xl">✳</p>
          <h1 className="mt-3 text-2xl font-medium text-white">This QR has gone quiet</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/55">
            The code on this table is expired or replaced. Wave your server
            down the old-fashioned way — or ask for a fresh code.
          </p>
          <p className="mt-6 font-mono text-[10px] tracking-wider text-white/25">
            {reason}
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm text-white/60 underline-offset-4 hover:text-white hover:underline"
          >
            ← TabCall
          </Link>
        </div>
      </div>
    </main>
  );
}
