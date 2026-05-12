import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { EditableField } from "./editable-field";
import { ToggleField } from "./toggle-field";
import { ConnectStripeButton } from "./connect-stripe-button";
import { LogoUpload } from "./logo-upload";
import { SessionsCard } from "./sessions-card";

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
          <EditableField slug={params.slug} field="name" label="Name" initial={venue.name} placeholder="Otto's Lounge" />
          <Row label="Slug" value={venue.slug} mono />
          <EditableField slug={params.slug} field="address" label="Address" initial={venue.address ?? ""} placeholder="123 Main St" help="Optional. Used to derive city for benchmarks." />
          <EditableField slug={params.slug} field="zipCode" label="ZIP code" initial={venue.zipCode ?? ""} placeholder="77006" pattern="^\d{5}(-\d{4})?$" help="Five digits or ZIP+4. Drives sales tax." />
          <EditableField slug={params.slug} field="timezone" label="Timezone" initial={venue.timezone} placeholder="America/Chicago" help="IANA name. Affects how analytics buckets the day." />
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
          ) : null}

          {/* Self-serve Stripe Connect Express onboarding. Hidden once
              charges are enabled — the venue is fully provisioned and
              this button would only confuse a working manager. */}
          {!stripeReady ? (
            <ConnectStripeButton slug={params.slug} attached={stripeAttached} />
          ) : null}
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
            placeholder="#5BD0B3"
            initial={venue.brandColor ?? ""}
            help="Six-digit hex like #5BD0B3 (brand: Sea Glass). Appears on QR tents and the guest landing header."
            pattern="^#[0-9a-fA-F]{6}$"
          />
          <LogoUpload slug={params.slug} initialUrl={venue.logoUrl} />
        </Card>

        <Card title="Compliance">
          <ToggleField
            slug={params.slug}
            field="requireIdOnFirstDrink"
            label="Check ID on first drink"
            help="When on, the first DRINK request from any new tab is flagged in the staff queue with a coral 'check ID' badge. Bartenders must verify before tapping Got it. Required for TABC compliance in Texas; useful anywhere serving alcohol."
            initial={venue.requireIdOnFirstDrink}
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

        <Card title="Alerts routing">
          <EditableField
            slug={params.slug}
            field="alertEmails"
            label="Notification emails"
            placeholder="manager@yourbar.com, owner@yourbar.com"
            initial={venue.alertEmails ?? ""}
            help="Comma-separated. Bad-rating intercepts and other venue alerts go here. Leave empty to use the default routing."
          />
        </Card>

        <SessionsCard email={session.email} />

        <Card title="Tonight">
          <p className="text-[12px] text-slate/55">
            Per-shift kill switches. Flip off when the kitchen is slammed or
            you need to pause a feature without losing data. New venues default
            to all on.
          </p>
          <ToggleField
            slug={params.slug}
            field="requestsEnabled"
            label="Guest request queue"
            help="When off, the QR landing page hides the four request buttons. Bills can still close."
            initial={venue.requestsEnabled}
          />
          <ToggleField
            slug={params.slug}
            field="preorderEnabled"
            label="Pre-order at QR"
            help="When off, the menu/pre-order tab disappears from the guest view. Existing orders complete normally."
            initial={venue.preorderEnabled}
          />
          <ToggleField
            slug={params.slug}
            field="reservationsEnabled"
            label="Reservations + waitlist"
            help="When off, the public reservations page returns 404. Existing bookings stay visible to staff."
            initial={venue.reservationsEnabled}
          />
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
