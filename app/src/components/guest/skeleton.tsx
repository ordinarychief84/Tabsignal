/**
 * Guest-surface loading placeholders.
 *
 * Two tones because the guest surface is genuinely two-toned: the beacon
 * screen at /v/[slug]/t/[tableId] is the dark "After Dark" canvas, while
 * its children — bill, split, feedback, wishlist — are the light oat
 * surface. A single skeleton would flash the wrong colour on half of
 * them, which on a phone in a dim bar is worse than no skeleton at all.
 *
 * Shapes deliberately echo the page each one stands in for, so nothing
 * visibly jumps when the server render lands.
 */

function Bar({ tone, className }: { tone: Tone; className: string }) {
  const fill = tone === "dark" ? "bg-white/10" : "bg-slate/10";
  return <div aria-hidden className={`animate-pulse rounded ${fill} ${className}`} />;
}

type Tone = "dark" | "light";

/** The beacon screen: venue name, table number, signal row, beacon. */
export function GuestBeaconSkeleton() {
  return (
    <main
      role="status"
      aria-busy="true"
      className="guest-dark guest-grain flex min-h-screen flex-col items-center px-6 pt-10"
    >
      <span className="sr-only">Loading…</span>
      <Bar tone="dark" className="h-3 w-40" />
      <Bar tone="dark" className="mt-4 h-8 w-16" />
      <Bar tone="dark" className="mt-8 h-16 w-full max-w-sm rounded-2xl" />
      <Bar tone="dark" className="mt-6 h-12 w-full max-w-sm rounded-2xl" />
      <Bar tone="dark" className="mt-10 h-40 w-40 rounded-full" />
    </main>
  );
}

/** Bill, split, feedback, wishlist: a titled card with a few rows. */
export function GuestPanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <main role="status" aria-busy="true" className="min-h-screen bg-oat px-6 pt-10 text-slate">
      <span className="sr-only">Loading…</span>
      <Bar tone="light" className="h-3 w-32" />
      <Bar tone="light" className="mt-3 h-7 w-48" />
      <div className="mt-8 space-y-3 rounded-2xl border border-slate/10 bg-white p-5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Bar tone="light" className="h-4 w-40 max-w-full" />
            <Bar tone="light" className="h-4 w-14 shrink-0" />
          </div>
        ))}
      </div>
      <Bar tone="light" className="mt-6 h-12 w-full rounded-full" />
    </main>
  );
}
