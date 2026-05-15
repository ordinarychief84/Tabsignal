import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveByQrToken } from "@/lib/session";
import { PayScreen } from "./pay-screen";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: { qrToken: string };
  searchParams: { split?: string; secret?: string };
};

export default async function GuestQrPayPage({
  params,
  searchParams,
}: PageProps) {
  let resolved;
  try {
    resolved = await resolveByQrToken(params.qrToken);
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (code === "VENUE_NOT_FOUND" || code === "TABLE_NOT_FOUND") notFound();
    return <InvalidScan reason={code} />;
  }

  // The secret was historically passed via `?secret=` in the URL.
  // Per audit Finding #6, the new flow stores it in sessionStorage
  // keyed by splitId on the producer side — PayScreen reads it back
  // on mount. We still accept `?secret=` here as a one-revision
  // fallback for private-browsing mode where sessionStorage refused
  // the write; the new flow drops it the moment Stripe Elements
  // mounts so it never lingers.
  const splitId = searchParams.split ?? "";
  const fallbackSecret = searchParams.secret;

  if (!splitId) {
    return (
      <main className="text-slate">
        <div className="mx-auto max-w-md px-6 py-10">
          <div className="rounded-2xl border border-slate/10 bg-white p-6 text-center">
            <p className="text-3xl">·</p>
            <h1 className="mt-3 text-base font-medium">No payment in progress</h1>
            <p className="mt-2 text-sm text-slate/60">
              Open this from your bill. &ldquo;Pay selected&rdquo; will bring
              you here with the secure payment session attached.
            </p>
            <div className="mt-5 flex flex-col items-center gap-2">
              <Link
                href={`/guest/${encodeURIComponent(params.qrToken)}/bill`}
                className="rounded-full bg-slate px-5 py-2 text-sm text-oat hover:bg-slate/90"
              >
                View bill →
              </Link>
              <Link
                href={`/guest/${encodeURIComponent(params.qrToken)}`}
                className="text-sm text-slate/60 underline-offset-4 hover:text-slate hover:underline"
              >
                ← back to table
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const returnUrl = `/guest/${encodeURIComponent(params.qrToken)}/review`;

  return (
    <main className="text-slate">
      <div className="mx-auto max-w-md px-6 py-8">
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
            {resolved.venueName}
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Pay</h1>
          <p className="mt-1 text-sm text-slate/60">{resolved.tableLabel}</p>
        </header>

        <PayScreen
          splitId={splitId}
          fallbackClientSecret={fallbackSecret}
          returnUrl={returnUrl}
        />

        <p className="mt-6 text-center text-[11px] text-slate/40">
          Encrypted by Stripe. Apple Pay and Google Pay supported.
        </p>
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
