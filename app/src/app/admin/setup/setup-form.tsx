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
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Your name" name="ownerName" required maxLength={120} />
      <Field label="Venue name" name="venueName" required maxLength={120} placeholder="Cocktail bar in Montrose" />
      <Field label="Street address" name="address" placeholder="optional" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="ZIP code" name="zipCode" required pattern="[0-9]{5}(-[0-9]{4})?" inputMode="numeric" placeholder="77006" />
        <NumberField label="Tables" name="tableCount" min={1} max={120} defaultValue={10} />
      </div>
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
      <Field label="Google Place ID" name="googlePlaceId" placeholder="optional — for review routing" />
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

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

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

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        {...rest}
        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-3 text-base outline-none focus:border-sea focus:ring-1 focus:ring-sea"
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
      <span className="text-sm font-medium text-slate-700">{props.label}</span>
      <select
        name={props.name}
        defaultValue={props.defaultValue}
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-sea focus:ring-1 focus:ring-sea"
      >
        {props.options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function SetupSuccess({ data }: { data: CreatedVenue }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-emerald-50 p-6 text-center">
        <p className="text-3xl">✓</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">Venue created</h2>
        <p className="mt-1 text-sm text-slate-600">
          Slug: <code className="font-mono text-xs">{data.slug}</code>
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Your tables</h3>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {data.tables.map(t => (
            <li key={t.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span>{t.label}</span>
              <a
                className="font-mono text-xs text-umber underline-offset-2 hover:underline"
                href={`/v/${data.slug}/t/${encodeURIComponent(t.label)}?s=${encodeURIComponent(t.qrToken)}`}
                target="_blank"
                rel="noreferrer"
              >
                preview
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Share the preview links by SMS to test on real phones, or print all QR tents at once:
        </p>
        <a
          href={`/admin/v/${data.slug}/qr-tents`}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Open printable QR tents →
        </a>
      </div>
    </div>
  );
}
