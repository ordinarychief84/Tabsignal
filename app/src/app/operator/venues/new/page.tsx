import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { isOperator } from "@/lib/auth/operator";
import { db } from "@/lib/db";
import { NewVenueForm } from "./new-venue-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — new venue" };

export default async function OperatorNewVenuePage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login?next=/operator/venues/new");
  if (!isOperator(session)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-oat px-6 text-center">
        <div className="max-w-sm">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium">Operator only.</h1>
          <p className="mt-3 text-sm text-slate/60">
            Creating venues is gated to TabCall staff (OPERATOR_EMAILS).
          </p>
          <Link
            href="/operator"
            className="mt-6 inline-block rounded-lg border border-slate/20 px-4 py-2 text-sm hover:bg-slate hover:text-oat"
          >
            ← back to operator
          </Link>
        </div>
      </main>
    );
  }

  // Fetch the orgs we can attach to. Operators see all orgs in this list.
  const orgs = await db.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  return (
    <main className="min-h-screen bg-oat text-slate">
      <header className="border-b border-slate/10 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/operator" className="inline-flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#C9F61C" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#C9F61C" />
              </svg>
            </span>
            <span className="text-lg font-medium tracking-tight">TabCall</span>
            <span className="ml-2 rounded-full bg-sea/40 px-2 py-0.5 text-[10px] font-medium text-slate">operator</span>
          </Link>
          <p className="text-xs tracking-wide text-slate/50">New venue</p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Concierge setup</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight">Create a venue.</h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-slate/60">
          For venues you&rsquo;re onboarding by hand. Creates the org + venue +
          tables + owner staff in one go and emails the owner a sign-in link.
        </p>

        <div className="mt-10">
          <NewVenueForm orgs={orgs} />
        </div>
      </div>
    </main>
  );
}
