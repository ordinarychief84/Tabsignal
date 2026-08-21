"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Something broke while a guest was mid-visit.
 *
 * Same reasoning as the sibling not-found: whatever went wrong is ours,
 * not theirs, and the recovery has to keep them inside the venue rather
 * than bouncing them to TabCall's marketing site.
 *
 * "Try again" first, because most failures here are a flaky restaurant
 * wifi connection rather than a real fault, and a retry genuinely fixes
 * those. The venue link is the fallback, derived from the URL because an
 * error boundary gets no params.
 */
export default function VenueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged, not shown. A guest doesn't need our stack trace, and the
    // digest is what ties this to the server-side report.
    console.error("[guest] surface error", error.digest ?? error.message);
  }, [error]);

  const pathname = usePathname() ?? "";
  const slug = /^\/v\/([^/?#]+)/.exec(pathname)?.[1] ?? null;

  return (
    <main className="flex min-h-[100dvh] flex-col bg-oat px-6 text-slate">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="w-full max-w-sm">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
            Something went wrong
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate/60">
            That&rsquo;s on us, not you. Try again — and if it keeps
            happening, just catch a member of staff.
          </p>

          <button
            type="button"
            onClick={reset}
            className="mt-8 min-h-[52px] w-full rounded-2xl bg-slate text-[15px] font-semibold text-oat"
          >
            Try again
          </button>

          {slug ? (
            <Link
              href={`/v/${slug}`}
              className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-white text-[15px] font-medium text-slate ring-1 ring-umber-soft/40"
            >
              Back to the venue
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
