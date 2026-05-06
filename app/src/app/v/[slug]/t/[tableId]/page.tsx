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
  const session = await db.guestSession.findUnique({
    where: { id: resolved.sessionId },
    select: {
      lineItems: true,
      requests: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  const items = session ? parseLineItems(session.lineItems) : [];
  const lastRequestAt = session?.requests[0]?.createdAt ?? null;
  const minutesSinceLast = lastRequestAt
    ? (Date.now() - lastRequestAt.getTime()) / 60_000
    : null;
  const isStale =
    items.length > 0 &&
    (lastRequestAt === null || (minutesSinceLast ?? 0) > STALE_AFTER_MIN);

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
          Tap once. Your server will see it instantly.
        </p>
      </header>

      <GuestRequestPanel
        sessionId={resolved.sessionId}
        sessionToken={resolved.sessionToken}
        slug={params.slug}
        tableLabel={resolved.tableLabel}
        prevTab={isStale ? {
          itemCount: items.length,
          lastRequestMinAgo: minutesSinceLast === null ? null : Math.round(minutesSinceLast),
        } : null}
      />

      <footer className="mt-auto border-t border-slate/5 px-6 py-5">
        <p className="text-center text-[11px] tracking-wide text-slate/40">
          Powered by TabCall
        </p>
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
