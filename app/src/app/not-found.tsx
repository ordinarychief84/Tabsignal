import Link from "next/link";

/**
 * The TabCall 404 — for OUR pages, not a guest's.
 *
 * It used to be written in guest voice ("ask your server for a fresh QR")
 * while wearing TabCall branding and offering a link to our marketing
 * site, because it was catching guest dead ends too. Guests now have
 * their own boundary at /v/[slug]/not-found.tsx that keeps them inside
 * the venue, so this one can go back to being what it is.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col bg-oat text-slate">
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium tracking-tight">Not found</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate/60">
            That page doesn&rsquo;t exist, or it moved.
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
