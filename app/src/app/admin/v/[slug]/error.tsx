"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error boundary scoped to the venue dashboard.
 *
 * Without this, any error in any of the ~24 pages under this route bubbles
 * to the root boundary, which throws away the shell — sidebar, venue
 * context, plan badge — and drops the manager on a full-page error with no
 * idea where they were or how to get back. Failing inside the shell keeps
 * the rest of the dashboard usable and makes retry a one-tap affair.
 */
export default function VenueDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/v] caught:", error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-coral/25 bg-coral/5 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate">This section didn&rsquo;t load</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate/60">
        The rest of your dashboard is fine — it&rsquo;s just this page. Try again, or pick
        another section from the menu.
      </p>
      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-slate px-4 py-2 text-sm font-medium text-oat hover:bg-slate/90"
        >
          Try again
        </button>
        <Link
          href="/staff"
          className="rounded-full px-4 py-2 text-sm font-medium text-slate/60 hover:text-slate"
        >
          Live queue
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-6 font-mono text-[10px] tracking-wider text-slate/30">ref: {error.digest}</p>
      ) : null}
    </div>
  );
}
