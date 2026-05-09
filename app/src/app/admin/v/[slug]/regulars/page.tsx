import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { venuePlanForVenueId } from "@/lib/plan-gate";
import { meetsAtLeast } from "@/lib/plans";
import { listRegulars } from "@/lib/regulars";
import { dollars } from "@/lib/bill";
import { UpgradeRequired } from "../upgrade-required";
import { ImportPanel } from "./import-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — regulars" };

export default async function RegularsPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/regulars`);

  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!venue || venue.id !== session.venueId) return null;

  const plan = await venuePlanForVenueId(venue.id);
  if (!meetsAtLeast(plan, "pro")) {
    return (
      <>
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Regulars</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Your people</h1>
        </header>
        <UpgradeRequired slug={params.slug} feature="Regulars dossier" current={plan} required="pro" />
      </>
    );
  }

  const regulars = await listRegulars(venue.id, 100);

  return (
    <>
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Regulars</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Your people</h1>
          <p className="mt-2 text-sm text-slate/60">
            Guests who&rsquo;ve identified themselves and visited more than once.
            Tap a row to open the dossier and add notes.
          </p>
        </div>
        <a
          href={`/api/admin/v/${params.slug}/export/regulars`}
          className="shrink-0 rounded-full border border-slate/15 bg-white px-3 py-1.5 text-xs text-slate/70 hover:border-slate/40"
        >
          ↓ Export CSV
        </a>
      </header>

      <div className="mb-6">
        <ImportPanel slug={params.slug} />
      </div>

      {regulars.length === 0 ? (
        <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
          No identified regulars yet. Once guests opt in via phone, their visit
          history starts building here.
        </div>
      ) : (
        <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
          {regulars.map(r => (
            <li key={r.profileId}>
              <Link
                href={`/admin/v/${params.slug}/regulars/${r.profileId}`}
                className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate/5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate">
                    {r.displayName ?? r.phone}
                  </p>
                  <p className="truncate font-mono text-[11px] text-slate/50">
                    {r.visits} visit{r.visits === 1 ? "" : "s"} · {dollars(r.spendCents)} total
                    {r.recencyDays !== null
                      ? ` · last ${r.recencyDays === 0 ? "today" : `${r.recencyDays}d ago`}`
                      : null}
                  </p>
                </div>
                <span
                  className={[
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-mono tabular-nums",
                    r.score >= 70 ? "bg-chartreuse/30 text-slate" :
                    r.score >= 40 ? "bg-slate/10 text-slate/70" :
                    "bg-slate/5 text-slate/50",
                  ].join(" ")}
                  title="Regular score (0–100)"
                >
                  {r.score}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
