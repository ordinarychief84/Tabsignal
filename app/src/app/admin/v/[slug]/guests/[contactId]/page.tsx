import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { guestProfile } from "@/lib/guestbook";
import { tagLabel } from "@/lib/feedback";
import { PageHeader, Panel, Badge, EmptyState } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · guest" };

/**
 * One guest's history at this venue.
 *
 * Deliberately narrow: visits, ratings, what they said, and their consent
 * position. No cross-venue history — a contact belongs to one venue — and
 * nothing inferred about them beyond what they did here.
 */
export default async function GuestProfilePage({
  params,
}: {
  params: { slug: string; contactId: string };
}) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/guests/${params.contactId}`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  // Returns null for another venue's contact — same as one that doesn't
  // exist, so the id can't be used to probe.
  const guest = await guestProfile({
    venueId: venue.id,
    contactId: params.contactId,
    role: session.role,
  });
  if (!guest) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Guest"
        title={guest.phone}
        subtitle={`${guest.totalVisits} visit${guest.totalVisits === 1 ? "" : "s"} · first seen ${new Date(guest.firstSeenAt).toLocaleDateString()}`}
        backHref={`/admin/v/${params.slug}/guests`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Marketing consent">
          <div className="flex items-center gap-2">
            <Badge tone={guest.marketing === "SUBSCRIBED" ? "green" : guest.marketing === "UNSUBSCRIBED" ? "coral" : "neutral"}>
              {guest.marketing === "SUBSCRIBED"
                ? "Opted in"
                : guest.marketing === "UNSUBSCRIBED"
                  ? "Opted out"
                  : "Not opted in"}
            </Badge>
            {guest.consentedAt ? (
              <span className="text-[12px] text-slate/55">
                {new Date(guest.consentedAt).toLocaleString()}
              </span>
            ) : null}
          </div>
          {guest.consentTextVersion ? (
            <p className="mt-3 text-[12px] leading-relaxed text-slate/55">
              Agreed to wording version{" "}
              <span className="font-mono">{guest.consentTextVersion}</span>. Kept so you
              can show exactly what they saw.
            </p>
          ) : (
            <p className="mt-3 text-[12px] leading-relaxed text-slate/55">
              No consent on file. This guest may not be sent promotional messages.
            </p>
          )}
        </Panel>

        <Panel title="Messages sent">
          {guest.campaigns.length === 0 ? (
            <p className="text-[13px] text-slate/55">Nothing sent yet.</p>
          ) : (
            <ul className="space-y-2">
              {guest.campaigns.map((c, i) => (
                <li key={i} className="flex items-center justify-between text-[13px]">
                  <span>{c.name}</span>
                  <span className="text-slate/50">
                    {c.sentAt ? new Date(c.sentAt).toLocaleDateString() : c.status.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Feedback history">
          {guest.feedback.length === 0 ? (
            <EmptyState title="No feedback yet" />
          ) : (
            <ul className="space-y-3">
              {guest.feedback.map(f => (
                <li key={f.id} className="rounded-2xl border border-umber-soft/25 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm tabular-nums">{f.rating}/5</span>
                    <Badge tone={f.sentiment === "POSITIVE" ? "green" : "coral"}>
                      {(f.sentiment ?? "").toLowerCase() || "—"}
                    </Badge>
                    <span className="ml-auto text-[12px] text-slate/45">
                      {new Date(f.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {f.tags.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {f.tags.map(t => (
                        <li key={t} className="rounded-full bg-oat px-2.5 py-1 text-[11px] text-slate/70">
                          {tagLabel(t, null, f.rating)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {f.note ? (
                    <p className="mt-2 text-[13px] leading-relaxed text-slate/70">{f.note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
