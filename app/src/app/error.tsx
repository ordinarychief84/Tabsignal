"use client";

import Link from "next/link";
import { useEffect } from "react";

// Last-resort recovery boundary. Anything unexpected lands here instead
// of the bare Next.js error overlay. Keeps brand even when things break.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for whatever observer is configured. With no Sentry yet
    // this just lands in Vercel function logs; once Sentry's wired
    // it'll pick up the digest from the same console line.
    console.error("[app/error] caught:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col bg-oat text-slate">
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium tracking-tight">
            Something didn&rsquo;t load
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate/60">
            Try again. If it keeps happening, ask your server for a fresh QR
            or reload the page from a different network.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-full bg-slate px-5 py-2 text-sm text-oat hover:bg-slate/90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="ml-3 mt-6 inline-block text-sm text-umber underline-offset-4 hover:underline"
          >
            ← back
          </Link>
          {error.digest ? (
            <p className="mt-6 font-mono text-[10px] tracking-wider text-slate/30">
              ref: {error.digest}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
