import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveByQrToken } from "@/lib/session";
import { CartScreen } from "./cart-screen";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: { qrToken: string } };

export default async function GuestQrCartPage({ params }: PageProps) {
  let resolved;
  try {
    resolved = await resolveByQrToken(params.qrToken);
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (code === "VENUE_NOT_FOUND" || code === "TABLE_NOT_FOUND") notFound();
    return <InvalidScan reason={code} />;
  }

  return (
    <main className="text-slate">
      <div className="mx-auto max-w-md px-6 py-10">
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
            {resolved.venueName}
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Your cart</h1>
          <p className="mt-1 text-sm text-slate/60">{resolved.tableLabel}</p>
        </header>

        <CartScreen
          qrToken={params.qrToken}
          slug={resolved.slug}
          sessionId={resolved.sessionId}
          sessionToken={resolved.sessionToken}
          venueName={resolved.venueName}
          tableLabel={resolved.tableLabel}
        />
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
