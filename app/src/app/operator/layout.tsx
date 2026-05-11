/**
 * Top-level layout for the TabCall operator console.
 *
 * Renders a thin header with operator-tier nav (Console / Audit /
 * Settings) and an "operator" pill identifying the role. Auth gate is
 * intentionally light here — each page re-checks `isOperator()` so a
 * non-operator who bookmarks a sub-route still gets the same denial
 * card the existing /operator page renders.
 *
 * Org-scoped pages under /operator/orgs/[orgId] keep their own
 * layout so the org-context doesn't leak up here.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();
  if (!session) {
    const reachedPath = headers().get("x-pathname") ?? "/operator";
    redirect(`/staff/login?next=${encodeURIComponent(reachedPath)}`);
  }
  return (
    <div className="min-h-screen bg-oat text-slate">
      <header className="sticky top-0 z-30 border-b border-slate/10 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-6">
          <div className="flex items-center gap-3">
            <Link href="/operator" className="inline-flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate">
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#C9F61C" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="2" fill="#C9F61C" />
                </svg>
              </span>
              <span className="text-lg font-medium tracking-tight">TabCall</span>
            </Link>
            <span className="rounded-full bg-chartreuse/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate">
              operator
            </span>
          </div>
          <nav className="hidden items-center gap-5 text-[13px] text-slate/70 md:flex">
            <Link href="/operator"          className="hover:text-slate">Console</Link>
            <Link href="/operator/orgs"     className="hover:text-slate">Orgs</Link>
            <Link href="/operator/venues"   className="hover:text-slate">Venues</Link>
            <Link href="/operator/admins"   className="hover:text-slate">Admins</Link>
            <Link href="/operator/audit"    className="hover:text-slate">Audit</Link>
            <Link href="/operator/settings" className="hover:text-slate">Settings</Link>
          </nav>
          <div className="flex items-center gap-3 text-[12px] text-slate/55">
            <span className="hidden font-mono md:inline">{session.email}</span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-slate/15 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
