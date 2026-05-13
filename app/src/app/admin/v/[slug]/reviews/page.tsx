import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { ReviewsList } from "./reviews-list";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — reviews" };

const DEFAULT_DAYS = 7;
const PAGE_SIZE = 50;

export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { days?: string; flagged?: string };
}) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/reviews`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const daysParsed = Number(searchParams?.days ?? DEFAULT_DAYS);
  const days = Number.isFinite(daysParsed)
    ? Math.min(Math.max(Math.trunc(daysParsed), 1), 90)
    : DEFAULT_DAYS;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // ?flagged=true narrows the initial list to manager-flagged rows
  // regardless of rating. The 4-5★ stat (Google-bound) still uses the
  // unfiltered count so the summary makes sense.
  const flaggedOnly = searchParams?.flagged === "true";

  const [bad, total5] = await Promise.all([
    db.feedbackReport.findMany({
      where: {
        venueId: venue.id,
        ...(flaggedOnly ? { flagged: true } : { rating: { lte: 3 } }),
        createdAt: { gte: since },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { session: { include: { table: { select: { label: true } } } } },
      take: PAGE_SIZE + 1,
    }),
    db.feedbackReport.count({
      where: { venueId: venue.id, rating: { gte: 4 }, createdAt: { gte: since } },
    }),
  ]);

  const hasMore = bad.length > PAGE_SIZE;
  const initialItems = hasMore ? bad.slice(0, PAGE_SIZE) : bad;
  const initialCursor = hasMore ? initialItems[initialItems.length - 1]!.id : null;
  const unseen = initialItems.filter(r => !r.seenByMgr).length;

  const rangeLabel =
    days === 7 ? "Past 7 days" :
    days === 30 ? "Past 30 days" :
    days === 90 ? "Past 90 days" :
    `Past ${days} days`;

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{rangeLabel}</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Reviews</h1>
        <p className="mt-2 text-sm text-slate/60">
          We never email guests. Notes below come from the post-payment feedback
          screen and are routed privately to you.
        </p>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Stat label="1–3 stars" value={String(initialItems.length + (hasMore ? "+" : ""))} hint="Routed here" />
        <Stat label="Unseen (on screen)" value={String(unseen)} hint="Tap a card to mark seen" />
        <Stat label="4–5 stars" value={String(total5)} hint="Sent to Google" />
      </div>

      {initialItems.length === 0 ? (
        <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
          No bad reviews in this window. Good service is showing up.
        </div>
      ) : (
        <ReviewsList
          slug={params.slug}
          days={days}
          flaggedOnly={flaggedOnly}
          initial={initialItems.map(r => ({
            id: r.id,
            rating: r.rating,
            note: r.note,
            aiCategory: r.aiCategory,
            aiSuggestion: r.aiSuggestion,
            aiServerName: r.aiServerName,
            seenByMgr: r.seenByMgr,
            flagged: r.flagged,
            flaggedAt: r.flaggedAt?.toISOString() ?? null,
            createdAt: r.createdAt.toISOString(),
            tableLabel: r.session.table.label,
          }))}
          initialCursor={initialCursor}
        />
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate/10 bg-white px-5 py-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
      <p className="mt-2 font-mono text-3xl tabular-nums text-slate">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate/50">{hint}</p> : null}
    </div>
  );
}
