import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The dead end a GUEST hits — an expired QR, a table that's been renamed,
 * a session that timed out.
 *
 * Without this, every notFound() under /v/ fell through to the app-level
 * 404, which is branded TabCall and offers "← back to TabCall". A guest
 * has no business with TabCall: they came to a restaurant, someone handed
 * them a code, and the code didn't work. Sending them to our marketing
 * site is both confusing and a little rude to the venue, whose customer
 * this actually is.
 *
 * So: no TabCall, no link off the venue, and a way back into the room
 * they're sitting in. `not-found.tsx` receives no params, so the venue is
 * recovered from the pathname the middleware stamps on every request —
 * which lets this greet them by the venue's name rather than generically.
 */
export default async function VenueNotFound() {
  const venue = await venueFromPath();

  return (
    <main className="flex min-h-[100dvh] flex-col bg-oat px-6 text-slate">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="w-full max-w-sm">
          {venue ? (
            <p className="text-[11px] uppercase tracking-[0.2em] text-umber">{venue.name}</p>
          ) : null}

          <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight">
            That code didn&rsquo;t work
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate/60">
            It may have expired, or the table may have changed. Ask a member
            of staff and they&rsquo;ll sort you out in a second.
          </p>

          {/* The only way out points back into the venue — never off it. */}
          {venue ? (
            <Link
              href={`/v/${venue.slug}`}
              className="mt-8 inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-slate px-6 text-[15px] font-semibold text-oat"
            >
              Back to {venue.name}
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}

/**
 * Recover the venue from /v/<slug>/... . Returns null rather than throwing
 * — this is already the error path, and a failure here must not replace a
 * gentle dead end with a stack trace.
 */
async function venueFromPath(): Promise<{ slug: string; name: string } | null> {
  try {
    const path = headers().get("x-pathname") ?? "";
    const slug = /^\/v\/([^/?#]+)/.exec(path)?.[1];
    if (!slug) return null;
    return await db.venue.findUnique({
      where: { slug: decodeURIComponent(slug) },
      select: { slug: true, name: true },
    });
  } catch {
    return null;
  }
}
