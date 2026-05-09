import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { venuePlanForVenueId } from "@/lib/plan-gate";
import { meetsAtLeast } from "@/lib/plans";
import { dossierFor } from "@/lib/regulars";
import { dollars } from "@/lib/bill";
import { DossierNotes } from "./dossier-notes";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — regular dossier" };

export default async function RegularDossierPage({
  params,
}: {
  params: { slug: string; profileId: string };
}) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/regulars/${params.profileId}`);

  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!venue || venue.id !== session.venueId) return null;

  const plan = await venuePlanForVenueId(venue.id);
  if (!meetsAtLeast(plan, "pro")) {
    redirect(`/admin/v/${params.slug}/regulars`);
  }

  const dossier = await dossierFor(params.profileId, venue.id);
  if (!dossier) notFound();

  const { profile, score, topItems, recentVisits, notes, loyaltyPoints } = dossier;

  return (
    <>
      <header className="mb-6">
        <Link href={`/admin/v/${params.slug}/regulars`} className="text-[12px] text-umber hover:underline">
          ← regulars
        </Link>
        <div className="mt-3 flex items-baseline justify-between">
          <h1 className="text-3xl font-medium tracking-tight">
            {profile.displayName ?? profile.phone}
          </h1>
          <span
            className={[
              "rounded-full px-3 py-1 font-mono text-sm tabular-nums",
              score.score >= 70 ? "bg-chartreuse/30 text-slate" :
              score.score >= 40 ? "bg-slate/10 text-slate/70" :
              "bg-slate/5 text-slate/50",
            ].join(" ")}
            title="Regular score (0–100)"
          >
            {score.score}
          </span>
        </div>
        <p className="mt-2 font-mono text-sm text-slate/50">{profile.phone}</p>
      </header>

      <section className="mb-8 grid gap-3 sm:grid-cols-4">
        <Stat label="Visits" value={String(score.visits)} />
        <Stat label="Lifetime spend" value={dollars(score.spendCents)} />
        <Stat label="Last visit" value={
          score.recencyDays === null ? "—"
          : score.recencyDays === 0 ? "Today"
          : `${score.recencyDays}d ago`
        } />
        <Stat label="Avg tip" value={
          score.avgTipPercent === null ? "—" : `${score.avgTipPercent.toFixed(0)}%`
        } />
      </section>

      <section className="mb-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate/10 bg-white p-5">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-umber">Their usual</h2>
          {topItems.length === 0 ? (
            <p className="mt-3 text-xs text-slate/50">No item history yet.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {topItems.map(t => (
                <li key={t.name} className="flex items-baseline justify-between text-sm">
                  <span>{t.name}</span>
                  <span className="font-mono text-[11px] tabular-nums text-slate/55">{t.count}×</span>
                </li>
              ))}
            </ul>
          )}
          {loyaltyPoints > 0 ? (
            <p className="mt-4 rounded bg-chartreuse/10 px-3 py-2 text-[11px] text-slate/70">
              {loyaltyPoints} loyalty points at your venue.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate/10 bg-white p-5">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-umber">Recent visits</h2>
          {recentVisits.length === 0 ? (
            <p className="mt-3 text-xs text-slate/50">No paid visits yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentVisits.map(v => (
                <li key={v.sessionId} className="text-sm">
                  <div className="flex items-baseline justify-between">
                    <span>{new Date(v.paidAt).toLocaleDateString()}</span>
                    <span className="font-mono text-[11px] tabular-nums text-slate/55">
                      {dollars(v.spendCents)}{v.tipPercent !== null ? ` · ${v.tipPercent.toFixed(0)}% tip` : ""}
                    </span>
                  </div>
                  {v.rating !== null ? (
                    <p className={[
                      "mt-0.5 text-[11px]",
                      v.rating <= 3 ? "text-coral" : "text-slate/55",
                    ].join(" ")}>
                      {v.rating}★{v.feedback ? ` — “${v.feedback.slice(0, 80)}”` : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <DossierNotes
        slug={params.slug}
        profileId={params.profileId}
        initialNotes={notes}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate/10 bg-white p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
      <p className="mt-1 text-2xl font-medium tracking-tight">{value}</p>
    </div>
  );
}
