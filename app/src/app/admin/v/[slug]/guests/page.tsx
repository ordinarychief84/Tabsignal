import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { listGuests, guestbookStats } from "@/lib/guestbook";
import { PageHeader, Panel, DataTable, Th, Td, Badge, EmptyState } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · guestbook" };

/**
 * Guestbook — the people this venue has met.
 *
 * Phone numbers are resolved in lib/guestbook against the caller's role,
 * so this page renders whatever it was handed. A server opening this URL
 * gets masked values from the query itself; there is no branch here that
 * could be got wrong.
 */
export default async function GuestbookPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { q?: string };
}) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/guests`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const [guests, stats] = await Promise.all([
    listGuests({ venueId: venue.id, role: session.role, search: searchParams.q }),
    guestbookStats(venue.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Relationship"
        title="Guestbook"
        subtitle="Guests who chose to leave a number. Everyone else stays anonymous, which is the normal case."
        backHref={`/admin/v/${params.slug}`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Contacts" value={stats.contacts} />
        <Stat label="Opted in to marketing" value={stats.subscribed} />
        <Stat label="Returning" value={stats.returning} />
      </div>

      {!guests.length ? (
        <EmptyState
          title="No guests yet"
          body="A guest can leave a number after rating their visit. It's optional, and most won't — that's expected."
        />
      ) : (
        <Panel>
          {!guests[0]!.phoneVisible ? (
            <p className="mb-3 rounded-xl bg-oat px-3 py-2 text-[12px] text-slate/60">
              Phone numbers are hidden for your role. Owners and managers can see them.
            </p>
          ) : null}
          <DataTable
            head={
              <>
                <Th>Guest</Th>
                <Th right>Visits</Th>
                <Th>Last visit</Th>
                <Th>Experience</Th>
                <Th>Marketing</Th>
              </>
            }
          >
            {guests.map(g => (
              <tr key={g.id} className="border-t border-umber-soft/20">
                <Td>
                  <Link
                    href={`/admin/v/${params.slug}/guests/${g.id}`}
                    className="font-mono text-[13px] text-slate hover:underline"
                  >
                    {g.phone}
                  </Link>
                </Td>
                <Td right>
                  <span className="font-mono tabular-nums">{g.visits}</span>
                </Td>
                <Td>{g.lastVisitAt ? new Date(g.lastVisitAt).toLocaleDateString() : "—"}</Td>
                <Td>{g.latestRating ? `${g.latestRating}/5` : "—"}</Td>
                <Td>
                  <Badge tone={marketingTone(g.marketing)}>{marketingLabel(g.marketing)}</Badge>
                </Td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate/10 bg-white p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
      <p className="mt-1 font-mono text-2xl tabular-nums">{value}</p>
    </div>
  );
}

function marketingLabel(status: string): string {
  if (status === "SUBSCRIBED") return "Opted in";
  if (status === "UNSUBSCRIBED") return "Opted out";
  return "Not opted in";
}

function marketingTone(status: string): "green" | "coral" | "neutral" {
  if (status === "SUBSCRIBED") return "green";
  if (status === "UNSUBSCRIBED") return "coral";
  return "neutral";
}
