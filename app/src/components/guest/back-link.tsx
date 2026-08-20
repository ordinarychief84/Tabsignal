import Link from "next/link";

/**
 * Back navigation for the light guest pages (menu, waitlist,
 * reservations, order confirmation).
 *
 * These were one-way trips: a guest who tapped into the menu could only
 * leave via the browser's back gesture, which plenty of people never use
 * inside something that looks like an app.
 *
 * The destination is passed in rather than derived, because it genuinely
 * differs — a guest who arrived from a table QR should land back on their
 * beacon with the session token intact, while someone browsing the public
 * venue page should land back there.
 */
export function GuestBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded text-[13px] text-slate/55 underline-offset-4 transition-colors hover:text-slate hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate/40"
    >
      <span aria-hidden>&larr;</span>
      {label}
    </Link>
  );
}
