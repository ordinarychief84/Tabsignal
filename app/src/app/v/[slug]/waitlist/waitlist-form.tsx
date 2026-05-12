"use client";

import { useState } from "react";

type Confirmation = {
  id: string;
  position: number;
  quotedWaitMin: number;
};

export function WaitlistForm({ slug }: { slug: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const partySize = Number(fd.get("partySize"));
    if (!Number.isFinite(partySize) || partySize < 1 || partySize > 12) {
      setSubmitting(false);
      setError("Pick a party size between 1 and 12.");
      return;
    }
    try {
      const res = await fetch(`/api/v/${slug}/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partySize,
          guestName: String(fd.get("guestName") ?? ""),
          guestPhone: String(fd.get("guestPhone") ?? ""),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setConfirmation({
        id: body.id,
        position: body.position,
        quotedWaitMin: body.quotedWaitMin,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the waitlist");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <div className="rounded-2xl border border-chartreuse/40 bg-chartreuse/10 p-5 text-sm">
        <p className="text-[11px] uppercase tracking-[0.16em] text-umber">You&rsquo;re on the list</p>
        <p className="mt-2 font-medium">
          Quoted wait: <span className="font-mono">{confirmation.quotedWaitMin} min</span>
        </p>
        <p className="mt-1 text-xs text-slate/70">
          Position: <span className="font-mono">#{confirmation.position}</span>
        </p>
        <p className="mt-3 text-[11px] leading-relaxed text-slate/60">
          We&rsquo;ll text you when your table is ready. Stay nearby — wait times
          are estimates and tables can free up faster than expected.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Name">
        <input
          name="guestName"
          required
          className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Phone (for SMS when ready)">
        <input
          name="guestPhone"
          required
          type="tel"
          className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Party size">
        <input
          type="number"
          name="partySize"
          min={1}
          max={12}
          defaultValue={2}
          required
          className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
        />
      </Field>
      {error ? (
        <p className="rounded border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-slate px-4 py-2 text-sm text-oat hover:bg-slate/90 disabled:opacity-50"
      >
        {submitting ? "Joining…" : "Join the waitlist"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[0.16em] text-umber">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
