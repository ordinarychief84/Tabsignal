import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { resolveByQrToken } from "@/lib/session";
import { parseLineItems } from "@/lib/bill";
import { GuestRequestPanel } from "@/app/v/[slug]/t/[tableId]/request-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STALE_AFTER_MIN = 20;

type PageProps = { params: { qrToken: string } };

export default async function GuestQrPage({ params }: PageProps) {
  let resolved;
  try {
    resolved = await resolveByQrToken(params.qrToken);
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (code === "VENUE_NOT_FOUND") notFound();
    return <InvalidScan reason={code} />;
  }

  // Same "stale tab" detection as the legacy QR landing — if the session
  // already has line items and no recent request, give the new guest a
  // way to start fresh.
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
  const items = session ? parseLineItems(session.lineItems) : [];
  const lastRequestAt = session?.requests[0]?.createdAt ?? null;
  const minutesSinceLast = lastRequestAt
    ? (Date.now() - lastRequestAt.getTime()) / 60_000
    : null;
  const isStale =
    items.length > 0 &&
    (lastRequestAt === null || (minutesSinceLast ?? 0) > STALE_AFTER_MIN);
  const welcomeMessage =
    session?.venue?.guestWelcomeMessage ?? "Tap once. Your server will see it instantly.";
  const confirmationMessage = session?.venue?.guestConfirmationMessage ?? null;

  return (
    <main className="flex flex-col text-slate">
      <header className="px-6 pt-10 pb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
          {resolved.venueName}
        </p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">
          {resolved.tableLabel}
        </h1>
        <p className="mt-2 text-sm text-slate/60">{welcomeMessage}</p>
      </header>

      <GuestRequestPanel
        sessionId={resolved.sessionId}
        sessionToken={resolved.sessionToken}
        slug={resolved.slug}
        tableLabel={resolved.tableLabel}
        confirmationMessage={confirmationMessage}
        prevTab={
          isStale
            ? {
                itemCount: items.length,
                lastRequestMinAgo:
                  minutesSinceLast === null ? null : Math.round(minutesSinceLast),
              }
            : null
        }
      />
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
          <Link
            href="/"
            className="mt-6 inline-block text-sm text-umber underline-offset-4 hover:underline"
          >
            ← back to TabCall
          </Link>
        </div>
      </div>
    </main>
  );
}
