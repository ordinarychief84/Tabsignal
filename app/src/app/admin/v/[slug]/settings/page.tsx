import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — settings" };

export default async function SettingsPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/settings`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const stripeReady = !!venue.stripeAccountId;

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Configuration</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-slate/60">
          Wire up Stripe, branding, and integrations. Bare-bones for now;
          per-row inline editing ships in the next pass.
        </p>
      </header>

      <div className="space-y-6">
        <Card title="Venue">
          <Row label="Name" value={venue.name} />
          <Row label="Slug" value={venue.slug} mono />
          <Row label="Address" value={venue.address ?? "—"} />
          <Row label="ZIP" value={venue.zipCode ?? "—"} mono />
          <Row label="Timezone" value={venue.timezone} />
        </Card>

        <Card title="Payments — Stripe Connect">
          <p className="text-sm text-slate/65">
            Charges settle directly to your Stripe account. TabCall keeps a 0.5% platform fee.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px]"
            style={{
              backgroundColor: stripeReady ? "#EEEFC81A" : "#EFC8C81A",
              color: stripeReady ? "#7B6767" : "#7B6767",
              border: stripeReady ? "1px solid #EEEFC8" : "1px solid #EFC8C8",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: stripeReady ? "#EEEFC8" : "#EFC8C8" }}
            />
            {stripeReady ? "Connected" : "Not connected — onboard via Stripe"}
          </div>
          {stripeReady ? (
            <p className="mt-3 font-mono text-[11px] text-slate/45">
              {venue.stripeAccountId}
            </p>
          ) : (
            <p className="mt-3 text-[12px] text-slate/55">
              Stripe Express onboarding ships in the next milestone. For now,
              ask TabCall support to attach your account.
            </p>
          )}
        </Card>

        <Card title="POS bridge">
          <Row label="POS" value={venue.posType} mono />
          {venue.posType === "NONE" ? (
            <p className="mt-2 text-[12px] text-slate/55">
              Without a POS bridge, the manager dashboard works fully but no
              receipt prints automatically on payment.
            </p>
          ) : (
            <p className="mt-2 text-[12px] text-slate/55">
              We&rsquo;ll send a payment-confirmed signal to your{" "}
              {venue.posType.toLowerCase()} receipt printer.
            </p>
          )}
        </Card>

        <Card title="Branding">
          <Row label="Brand color" value={venue.brandColor ?? "—"} mono />
          <Row label="Logo" value={venue.logoUrl ?? "—"} />
          <p className="mt-3 text-[12px] text-slate/55">
            Brand color appears on QR tents and the guest landing header.
          </p>
        </Card>

        <Card title="Reviews routing">
          <Row label="Google Place ID" value={venue.googlePlaceId ?? "—"} mono />
          <p className="mt-2 text-[12px] text-slate/55">
            With this set, 4–5 star feedback offers a one-tap link to your
            Google review page.
          </p>
        </Card>
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate/10 bg-white px-6 py-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{title}</p>
      <div className="mt-3 space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate/5 py-1.5 text-sm last:border-0">
      <span className="text-slate/55">{label}</span>
      <span className={mono ? "font-mono text-[12px] text-slate" : "text-slate"}>{value}</span>
    </div>
  );
}
