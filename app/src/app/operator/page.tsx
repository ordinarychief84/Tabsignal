import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync, operatorAllowlist } from "@/lib/auth/operator";
import { planById, planFromOrg } from "@/lib/plans";
import {
  PageHeader,
  StatCard,
  StatGrid,
  Panel,
  DataTable,
  Th,
  Td,
  Badge,
  EmptyState,
  ButtonLink,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · operator console" };

const PLAN_TONE = { free: "neutral", growth: "sea", pro: "green" } as const;

export default async function OperatorConsole() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login?next=/operator");
  if (!(await isPlatformStaffAsync(session))) {
    return (
      <div className="mx-auto max-w-sm py-20 text-center">
        <h1 className="text-2xl font-semibold text-slate">Operator only</h1>
        <p className="mt-3 text-sm text-slate/60">
          This console is gated to TabCall&rsquo;s operator allowlist. You&rsquo;re signed in as{" "}
          <span className="font-mono text-[12px]">{session.email}</span>.
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-block rounded-lg border border-slate/20 px-4 py-2 text-sm text-slate hover:bg-slate hover:text-oat"
        >
          ← back to admin
        </Link>
      </div>
    );
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [orgs, totalVenues, totalStaff, totalGuestsToday, totalRequestsToday, totalPaidToday] =
    await Promise.all([
      db.organization.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          venues: { select: { id: true, slug: true, name: true, posType: true, stripeAccountId: true } },
          _count: { select: { members: true } },
        },
        take: 100,
      }),
      db.venue.count(),
      db.staffMember.count(),
      db.guestSession.count({ where: { createdAt: { gte: since24h } } }),
      db.request.count({ where: { createdAt: { gte: since24h } } }),
      db.guestSession.count({ where: { paidAt: { gte: since24h } } }),
    ]);

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Overview"
        subtitle="Platform-wide view of TabCall. Open an org to flip plans, manage members, and broadcast notices."
        actions={<ButtonLink href="/operator/venues/new">+ New venue</ButtonLink>}
      />

      <StatGrid cols={5}>
        <StatCard label="Organizations" value={orgs.length} />
        <StatCard label="Venues" value={totalVenues} />
        <StatCard label="Staff seats" value={totalStaff} />
        <StatCard label="Guests · 24h" value={totalGuestsToday} hint={`${totalRequestsToday} requests`} />
        <StatCard label="Paid · 24h" value={totalPaidToday} hint="Settled tabs" />
      </StatGrid>

      <div className="mt-8">
        <Panel
          title="Organizations"
          action={
            <Link href="/operator/orgs" className="text-[12px] font-medium text-umber hover:underline">
              View all →
            </Link>
          }
        >
          {orgs.length === 0 ? (
            <EmptyState
              title="No organizations yet"
              body="When a venue signs up, its organization appears here."
              action={{ href: "/operator/venues/new", label: "Create the first venue" }}
            />
          ) : (
            <DataTable
              head={
                <>
                  <Th>Organization</Th>
                  <Th>Plan</Th>
                  <Th right>Venues</Th>
                  <Th right>Members</Th>
                  <Th right>Created</Th>
                  <Th />
                </>
              }
            >
              {orgs.map(o => {
                const plan = planFromOrg(o);
                return (
                  <tr key={o.id} className="transition-colors hover:bg-oat/60">
                    <Td>
                      <Link href={`/operator/orgs/${o.id}`} className="font-medium text-slate hover:underline">
                        {o.name}
                      </Link>
                      {o.venues[0] ? (
                        <span className="ml-2 font-mono text-[11px] text-slate/40">{o.venues[0].slug}</span>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={PLAN_TONE[plan]}>{planById(plan)?.name ?? plan}</Badge>
                    </Td>
                    <Td right muted>{o.venues.length}</Td>
                    <Td right muted>{o._count.members}</Td>
                    <Td right muted>{timeAgo(o.createdAt)}</Td>
                    <Td right>
                      <Link href={`/operator/orgs/${o.id}`} className="text-[12px] text-umber hover:underline">
                        Manage →
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </Panel>
      </div>

      <p className="mt-8 text-[11px] tracking-wide text-slate/40">
        Operator allowlist · {operatorAllowlist().length} email
        {operatorAllowlist().length === 1 ? "" : "s"} · set via OPERATOR_EMAILS
      </p>
    </>
  );
}

function timeAgo(d: Date): string {
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return "just now";
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
