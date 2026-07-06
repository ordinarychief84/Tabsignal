import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { WatchPairing } from "./watch-pairing";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · pair a watch" };

/**
 * /staff/watch — pair a smartwatch and manage paired devices.
 * The heavy lifting is client-side (code generation + countdown +
 * device list); this shell just enforces the session like /staff does.
 */
export default async function StaffWatchPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login?next=/staff/watch");

  return (
    <main className="min-h-screen bg-oat text-slate">
      <header className="sticky top-0 z-10 border-b border-umber-soft/30 bg-oat/85 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] uppercase tracking-[0.18em] text-umber">Your account</p>
            <p className="text-sm font-medium text-slate">Smartwatch</p>
          </div>
          <Link
            href="/staff"
            className="rounded-lg border border-umber-soft/40 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate"
          >
            ← Queue
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-md px-4 py-6">
        <WatchPairing />
      </section>
    </main>
  );
}
