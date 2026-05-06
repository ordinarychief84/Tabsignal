import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { EditableField } from "./editable-field";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — settings" };

export default async function SettingsPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/settings`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const stripeAttached = !!venue.stripeAccountId;
  const stripeReady = stripeAttached && venue.stripeChargesEnabled;
  const reviewsConfigured = !!venue.googlePlaceId;

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Configuration</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-slate/60">
          Self-serve what you can. Structural changes (POS bridge, Stripe Connect attachment)
          stay concierge — email TabCall.
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
          <div
            className={[
              "mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] text-umber",
              stripeReady ? "border-chartreuse bg-chartreuse/15" : "border-coral bg-coral/15",
            ].join(" ")}
          >
            <span className={["h-1.5 w-1.5 rounded-full", stripeReady ? "bg-chartreuse" : "bg-coral"].join(" ")} />
            {stripeReady
              ? "Charges enabled"
              : stripeAttached
              ? "Account attached — onboarding incomplete"
              : "Not connected"}
          </div>

          {stripeAttached ? (
            <div className="mt-4 space-y-1.5 text-[12px]">
              <Flag label="Details submitted" on={venue.stripeDetailsSubmitted} />
              <Flag label="Charges enabled" on={venue.stripeChargesEnabled} />
              <Flag label="Payouts enabled" on={venue.stripePayoutsEnabled} />
            </div>
          ) : null}

          {stripeAttached ? (
            <p className="mt-3 font-mono text-[11px] text-slate/45">
              {venue.stripeAccountId}
            </p>
          ) : (
            <p className="mt-3 text-[12px] text-slate/55">
              Email TabCall — we&rsquo;ll attach your Stripe Express account on a 5-minute call.
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
          <EditableField
            slug={params.slug}
            field="brandColor"
            label="Brand color (hex)"
            placeholder="#1D9E75"
            initial={venue.brandColor ?? ""}
            help="Six-digit hex like #1D9E75. Appears on QR tents and the guest landing header."
            pattern="^#[0-9a-fA-F]{6}$"
          />
          <EditableField
            slug={params.slug}
            field="logoUrl"
            label="Logo URL"
            placeholder="https://example.com/logo.png"
            initial={venue.logoUrl ?? ""}
            help="Public URL to a square logo. Optional — wordmark fallback otherwise."
          />
        </Card>

        <Card title="Reviews routing">
          <EditableField
            slug={params.slug}
            field="googlePlaceId"
            label="Google Place ID"
            placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
            initial={venue.googlePlaceId ?? ""}
            help="From maps.google.com → search your venue → ⓘ → copy Place ID. Without this, 5★ feedback can't link guests to your Google review page."
          />
          {reviewsConfigured ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-chartreuse/15 px-3 py-2 text-[12px] text-umber">
              <span className="h-1.5 w-1.5 rounded-full bg-chartreuse" />
              4–5★ ratings show a one-tap Google review link.
            </p>
          ) : (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-coral/15 px-3 py-2 text-[12px] text-slate/70">
              <span className="h-1.5 w-1.5 rounded-full bg-coral" />
              No Place ID set. 4–5★ ratings show a generic thanks — you&rsquo;re leaving public reviews on the table.
            </p>
          )}
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

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-slate/55">{label}</span>
      <span
        className={[
          "inline-flex items-center gap-1.5 font-medium",
          on ? "text-umber" : "text-coral",
        ].join(" ")}
      >
        <span className={["h-1.5 w-1.5 rounded-full", on ? "bg-chartreuse" : "bg-coral"].join(" ")} />
        {on ? "Yes" : "No"}
      </span>
    </div>
  );
}
