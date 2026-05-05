import { notFound } from "next/navigation";
import { resolveGuestSession } from "@/lib/session";
import { GuestRequestPanel } from "./request-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: { slug: string; tableId: string };
  searchParams: { s?: string };
};

export default async function GuestPage({ params, searchParams }: PageProps) {
  let resolved;
  try {
    resolved = await resolveGuestSession(params.slug, params.tableId, searchParams.s ?? null);
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (code === "VENUE_NOT_FOUND" || code === "TABLE_NOT_FOUND") notFound();
    return <InvalidScan reason={code} />;
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-50">
      <header className="px-6 pt-10 pb-6">
        <p className="text-xs uppercase tracking-wider text-slate-500">{resolved.venueName}</p>
        <h1 className="text-2xl font-semibold text-slate-900">{resolved.tableLabel}</h1>
      </header>

      <GuestRequestPanel sessionId={resolved.sessionId} />

      <footer className="mt-auto px-6 py-4 text-center text-xs text-slate-400">
        Powered by TabCall
      </footer>
    </main>
  );
}

function InvalidScan({ reason }: { reason: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-slate-900">QR code expired</h1>
        <p className="mt-2 text-sm text-slate-600">
          Please ask your server for a fresh QR code, or speak with them directly.
        </p>
        <p className="mt-4 text-[11px] text-slate-400">Code: {reason}</p>
      </div>
    </main>
  );
}
