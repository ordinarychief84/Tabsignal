"use client";

import { useState } from "react";

type Org = { id: string; name: string };

type Result = {
  slug: string;
  alreadyRegistered?: boolean;
  devLink?: string;
};

export function NewVenueForm({ orgs }: { orgs: Org[] }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      // Reuse the public /api/signup endpoint — it creates Org + Venue +
      // tables + owner StaffMember + OrgMember(OWNER) and emails the link.
      // From the operator's perspective it's the same flow as a self-serve
      // signup, just initiated by us on the owner's behalf.
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(fd.get("email") ?? "").trim().toLowerCase(),
          ownerName: String(fd.get("ownerName") ?? "").trim(),
          venueName: String(fd.get("venueName") ?? "").trim(),
          zipCode: String(fd.get("zipCode") ?? "").trim(),
          tableCount: Number(fd.get("tableCount") ?? 6),
          timezone: String(fd.get("timezone") ?? "America/Chicago"),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setResult({
        slug: body.slug,
        alreadyRegistered: body.alreadyRegistered,
        devLink: body.devLink,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create venue");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <section className="rounded-2xl border border-chartreuse/40 bg-chartreuse/15 p-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Done</p>
        {result.alreadyRegistered ? (
          <>
            <h2 className="mt-2 text-xl font-medium">That email already runs a venue.</h2>
            <p className="mt-2 text-sm text-slate/70">
              We sent the existing owner a sign-in link instead. Use the operator console
              to find their venue.
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-2 text-xl font-medium">Venue created.</h2>
            <p className="mt-2 text-sm text-slate/70">
              Slug: <code className="font-mono text-xs">{result.slug}</code>. Owner has
              been emailed a sign-in link to the onboarding wizard.
            </p>
            <a
              href={`/admin/v/${result.slug}/settings`}
              className="mt-4 inline-block rounded-full bg-slate px-4 py-2 text-sm text-oat hover:bg-slate/90"
            >
              Open venue settings →
            </a>
          </>
        )}
        {result.devLink ? (
          <p className="mt-4 break-all rounded bg-slate/5 px-3 py-2 text-[11px] text-slate/55">
            <span className="uppercase tracking-wider">Dev:</span>{" "}
            <a className="underline" href={result.devLink}>{result.devLink}</a>
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Owner">
        <Field label="Email" name="email" type="email" required placeholder="owner@yourbar.com" />
        <Field label="Name" name="ownerName" required maxLength={120} placeholder="Emeka" />
      </Section>

      <Section title="Venue">
        <Field label="Venue name" name="venueName" required maxLength={120} placeholder="Otto's Lounge" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="ZIP code" name="zipCode" required pattern="[0-9]{5}(-[0-9]{4})?" placeholder="77006" />
          <Field label="Tables" name="tableCount" type="number" min={1} max={60} defaultValue="6" />
        </div>
        <Select
          label="Timezone"
          name="timezone"
          defaultValue="America/Chicago"
          options={[
            { value: "America/Chicago", label: "Central (Houston)" },
            { value: "America/New_York", label: "Eastern (NYC, ATL, MIA)" },
            { value: "America/Denver", label: "Mountain (DEN)" },
            { value: "America/Phoenix", label: "Arizona (no DST)" },
            { value: "America/Los_Angeles", label: "Pacific (LA, SF, SEA)" },
            { value: "America/Anchorage", label: "Alaska" },
            { value: "Pacific/Honolulu", label: "Hawaii" },
            { value: "America/Puerto_Rico", label: "Puerto Rico" },
          ]}
        />
      </Section>

      <p className="text-[11px] text-slate/45">
        Creates a brand-new Organization. To attach a venue to an existing org,
        use the admin operator console&rsquo;s SQL access or contact the platform.
        Existing orgs ({orgs.length}): {orgs.map(o => o.name).slice(0, 5).join(", ")}{orgs.length > 5 ? ", …" : ""}.
      </p>

      {error ? <p className="text-sm text-coral">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate disabled:opacity-60"
      >
        {submitting ? "Creating…" : "Create venue + email owner"}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate/10 bg-white px-6 py-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{title}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</span>
      <input
        {...rest}
        className="mt-2 block w-full rounded-xl border border-slate/15 bg-white px-4 py-3 text-base text-slate placeholder-slate/35 outline-none focus:border-sea focus:ring-1 focus:ring-sea"
      />
    </label>
  );
}

function Select(props: { label: string; name: string; defaultValue?: string; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.16em] text-umber">{props.label}</span>
      <select
        name={props.name}
        defaultValue={props.defaultValue}
        className="mt-2 block w-full rounded-xl border border-slate/15 bg-white px-4 py-3 text-base text-slate outline-none focus:border-sea focus:ring-1 focus:ring-sea"
      >
        {props.options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
