"use client";

import { useState } from "react";

type CreatedVenue = {
  orgId: string;
  venueId: string;
  slug: string;
  tables: { id: string; label: string; qrToken: string }[];
};

export function SetupForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedVenue | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const body = {
      ownerName: String(fd.get("ownerName") ?? ""),
      venueName: String(fd.get("venueName") ?? ""),
      address: String(fd.get("address") ?? "") || undefined,
      zipCode: String(fd.get("zipCode") ?? ""),
      timezone: String(fd.get("timezone") ?? "America/Chicago"),
      posType: String(fd.get("posType") ?? "NONE") as "NONE" | "TOAST" | "SQUARE" | "CLOVER",
      googlePlaceId: String(fd.get("googlePlaceId") ?? "") || undefined,
      tableCount: Number(fd.get("tableCount") ?? 10),
    };

    try {
      const res = await fetch("/api/admin/venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) return <SetupSuccess data={result} />;

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <FormSection title="About you" hint="We'll address email and reports to this name.">
        <Field label="Your name" name="ownerName" required maxLength={120} placeholder="Emeka" />
      </FormSection>

      <FormSection title="The venue" hint="Public details guests may see on their QR landing page.">
        <Field label="Venue name" name="venueName" required maxLength={120} placeholder="Otto's Lounge" />
        <Field label="Street address" name="address" placeholder="Optional" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="ZIP code" name="zipCode" required pattern="[0-9]{5}(-[0-9]{4})?" inputMode="numeric" placeholder="77006" />
          <NumberField label="Tables" name="tableCount" min={1} max={120} defaultValue={10} />
        </div>
        <SelectField
          label="Timezone"
          name="timezone"
          defaultValue="America/Chicago"
          options={[
            { value: "America/Chicago", label: "Central (Houston)" },
            { value: "America/New_York", label: "Eastern" },
            { value: "America/Denver", label: "Mountain" },
            { value: "America/Los_Angeles", label: "Pacific" },
          ]}
        />
      </FormSection>

      <FormSection title="Optional" hint="Skip for now — you can wire these later from Settings.">
        <SelectField
          label="POS system"
          name="posType"
          options={[
            { value: "NONE", label: "None / other" },
            { value: "TOAST", label: "Toast" },
            { value: "SQUARE", label: "Square" },
            { value: "CLOVER", label: "Clover" },
          ]}
        />
        <Field label="Google Place ID" name="googlePlaceId" placeholder="For routing 5★ to your Google review page" />
      </FormSection>

      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate disabled:opacity-60"
      >
        {submitting ? "Creating venue…" : "Create venue"}
      </button>
    </form>
  );
}

function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate/10 bg-white px-6 py-6">
      <header className="mb-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{title}</p>
        {hint ? <p className="mt-1 text-sm text-slate/55">{hint}</p> : null}
      </header>
      <div className="space-y-4">{children}</div>
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

function NumberField(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <Field {...props} type="number" />;
}

function SelectField(props: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
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

function SetupSuccess({ data }: { data: CreatedVenue }) {
  const previewLink = (label: string, qrToken: string) =>
    `/v/${data.slug}/t/${encodeURIComponent(label)}?s=${encodeURIComponent(qrToken)}`;
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-chartreuse/40 bg-chartreuse/20 p-7 text-center">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Live</p>
        <h2 className="mt-2 text-2xl font-medium text-slate">Your venue is set up.</h2>
        <p className="mt-2 text-sm text-slate/70">
          Slug: <code className="font-mono text-xs">{data.slug}</code> ·{" "}
          {data.tables.length} table{data.tables.length === 1 ? "" : "s"} created.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <a
          href={`/admin/v/${data.slug}/qr-tents`}
          className="rounded-2xl bg-slate p-6 text-oat transition-colors hover:bg-slate-light"
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-oat/40">Step 1</p>
          <p className="mt-2 text-lg font-medium">Print QR tents</p>
          <p className="mt-2 text-sm text-oat/60">
            One per table. Letter paper. Place tonight.
          </p>
          <p className="mt-5 text-sm font-medium text-chartreuse">Open printer →</p>
        </a>

        <a
          href={`/admin/v/${data.slug}/staff`}
          className="rounded-2xl border border-slate/10 bg-white p-6 hover:border-slate/25"
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Step 2</p>
          <p className="mt-2 text-lg font-medium text-slate">Invite a staff member</p>
          <p className="mt-2 text-sm text-slate/60">
            They sign in by magic link. No passwords, ever.
          </p>
          <p className="mt-5 text-sm font-medium text-slate">Add staff →</p>
        </a>
      </div>

      <div className="rounded-2xl border border-slate/10 bg-white">
        <div className="flex items-center justify-between border-b border-slate/10 px-5 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Your tables</p>
          <p className="text-[11px] text-slate/40">SMS a preview link to test on a phone</p>
        </div>
        <ul className="divide-y divide-slate/5">
          {data.tables.map(t => (
            <li key={t.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span>{t.label}</span>
              <a
                className="font-mono text-[11px] text-umber underline-offset-4 hover:underline"
                href={previewLink(t.label, t.qrToken)}
                target="_blank"
                rel="noreferrer"
              >
                preview ↗
              </a>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-center">
        <a
          href={`/admin/v/${data.slug}`}
          className="inline-block rounded-xl bg-chartreuse px-6 py-3 text-sm font-medium text-slate"
        >
          Go to manager dashboard →
        </a>
      </p>
    </div>
  );
}
