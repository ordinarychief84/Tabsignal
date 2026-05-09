import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaff } from "@/lib/auth/operator";
import { checkOrgAccess } from "@/lib/operator-rbac";
import { ImpersonateButton } from "./impersonate-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — org venues" };

export default async function OrgVenuesPage({ params }: { params: { orgId: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/operator/orgs/${params.orgId}/venues`);
  const access = await checkOrgAccess(session, params.orgId);
  if (!access.ok) redirect("/operator");

  const canImpersonate = isPlatformStaff(session);

  const venues = await db.venue.findMany({
    where: { orgId: params.orgId },
    orderBy: [{ regionTag: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      regionTag: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      createdAt: true,
    },
  });

  const lastPaid = venues.length === 0 ? [] : await db.guestSession.groupBy({
    by: ["venueId"],
    where: { venueId: { in: venues.map(v => v.id) }, paidAt: { not: null } },
    _max: { paidAt: true },
  });
  const lastPaidByVenue = new Map(lastPaid.map(g => [g.venueId, g._max.paidAt]));

  // Group by regionTag (null bucket renders last as "Uncategorized").
  const groups = new Map<string, typeof venues>();
  for (const v of venues) {
    const key = v.regionTag ?? "_none";
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }
  const orderedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "_none") return 1;
    if (b === "_none") return -1;
    return a.localeCompare(b);
  });

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Venues</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">All locations</h1>
        <p className="mt-2 text-sm text-slate/60">
          {venues.length} total. Stripe-ready means Charges + Payouts both enabled.
        </p>
      </header>

      {venues.length === 0 ? (
        <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
          No venues yet for this org.
        </div>
      ) : (
        <div className="space-y-8">
          {orderedKeys.map(key => {
            const list = groups.get(key)!;
            return (
              <section key={key}>
                <h2 className="mb-2 text-[11px] uppercase tracking-[0.18em] text-umber">
                  {key === "_none" ? "Uncategorized" : key}
                </h2>
                <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
                  {list.map(v => {
                    const ready =
                      v.stripeAccountId && v.stripeChargesEnabled && v.stripePayoutsEnabled;
                    const lp = lastPaidByVenue.get(v.id);
                    return (
                      <li key={v.id} className="flex items-center justify-between gap-4 px-5 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate">{v.name}</p>
                          <p className="truncate font-mono text-[11px] text-slate/50">{v.slug}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-[11px] text-slate/60">
                          <span className={[
                            "rounded-full px-2 py-0.5",
                            ready ? "bg-chartreuse/20 text-slate" : "bg-coral/10 text-coral",
                          ].join(" ")}>
                            {ready ? "Stripe ready" : "Stripe pending"}
                          </span>
                          <span className="hidden tabular-nums sm:inline">
                            {lp ? `paid ${formatRelative(lp)}` : "—"}
                          </span>
                          {canImpersonate ? (
                            <ImpersonateButton slug={v.slug} />
                          ) : null}
                          <Link
                            href={`/admin/v/${v.slug}`}
                            className="text-umber underline-offset-4 hover:underline"
                          >
                            open ↗
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
