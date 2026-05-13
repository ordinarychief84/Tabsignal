import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { resolveGuestSession } from "@/lib/session";
import { parseLineItems } from "@/lib/bill";
import { GuestRequestPanel } from "./request-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STALE_AFTER_MIN = 20;

type PageProps = {
  params: { slug: string; tableId: string };
  searchParams: { s?: string };
};

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

  // Detect a "stale tab" — the resolved session has line items AND no
  // recent request. Likely a previous party who didn't pay before leaving.
  // Show a "Continue / Start fresh" prompt to the new guest.
  // Bundled in the same call: venue's guest-facing copy overrides. Each
  // override is short manager-curated text that replaces a default
  // string in the guest UI.
  const session = await db.guestSession.findUnique({
    where: { id: resolved.sessionId },
    select: {
      lineItems: true,
      venue: {
        select: {
          guestWelcomeMessage: true,
          guestConfirmationMessage: true,
        },
      },
      requests: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  // Pull live BANNER promotions for this venue. Same filter as the guest
  // API: status=ACTIVE AND inside the time window. Only banner-type
  // promos render on the landing — menu-targeted badges live on /menu.
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

  const items = session ? parseLineItems(session.lineItems) : [];
  const lastRequestAt = session?.requests[0]?.createdAt ?? null;
  const minutesSinceLast = lastRequestAt
    ? (Date.now() - lastRequestAt.getTime()) / 60_000
    : null;
  const isStale =
    items.length > 0 &&
    (lastRequestAt === null || (minutesSinceLast ?? 0) > STALE_AFTER_MIN);
  const welcomeMessage = session?.venue?.guestWelcomeMessage ?? "Tap once. Your server will see it instantly.";
  const confirmationMessage = session?.venue?.guestConfirmationMessage ?? null;

  return (
    <main className="flex min-h-screen flex-col bg-oat text-slate">
      <header className="px-6 pt-10 pb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
          {resolved.venueName}
        </p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">
          {resolved.tableLabel}
        </h1>
        <p className="mt-2 text-sm text-slate/60">
          {welcomeMessage}
        </p>
      </header>

      {banners.length > 0 ? (
        <div className="space-y-2 px-6 pb-4">
          {banners.map(p => (
            <div
              key={p.id}
              className="overflow-hidden rounded-2xl border border-sea/40 bg-sea/15"
            >
              {p.bannerImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.bannerImageUrl} alt="" className="h-24 w-full object-cover" />
              ) : null}
              <div className="px-4 py-2">
                <p className="text-sm font-medium text-slate">{p.title}</p>
                {p.description ? (
                  <p className="mt-1 text-[12px] text-slate/70">{p.description}</p>
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

      <footer className="mt-auto border-t border-slate/5 px-6 py-5">
        <div className="flex items-center justify-center gap-4 text-[11px] tracking-wide">
          <Link
            href={`/v/${params.slug}/t/${encodeURIComponent(resolved.tableLabel)}/wishlist?s=${encodeURIComponent(resolved.sessionToken)}`}
            className="text-slate/60 underline-offset-4 hover:text-slate hover:underline"
          >
            Wishlist
          </Link>
          <span className="text-slate/20">·</span>
          <p className="text-slate/40">Powered by TabCall</p>
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
    <main className="flex min-h-screen flex-col bg-oat text-slate">
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium">QR code expired</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate/60">
            Ask your server for a fresh code, or speak with them directly.
          </p>
          <p className="mt-6 font-mono text-[10px] tracking-wider text-slate/30">
            {reason}
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-umber underline-offset-4 hover:underline">
            ← back to TabCall
          </Link>
        </div>
      </div>
    </main>
  );
}
