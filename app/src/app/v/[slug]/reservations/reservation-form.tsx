"use client";

import { useState } from "react";

export function ReservationForm({ slug }: { slug: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ id: string; guestCode: string; startsAt: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const startsAt = new Date(`${fd.get("date")}T${fd.get("time")}`);
    if (Number.isNaN(startsAt.getTime())) {
      setSubmitting(false);
      setError("Pick a valid date and time.");
      return;
    }
    try {
      const res = await fetch(`/api/v/${slug}/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partySize: Number(fd.get("partySize")),
          startsAt: startsAt.toISOString(),
          guestName: String(fd.get("guestName") ?? ""),
          guestPhone: String(fd.get("guestPhone") ?? ""),
          notes: (fd.get("notes") as string) || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setConfirmation({ id: body.id, guestCode: body.guestCode, startsAt: body.startsAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <div className="rounded-2xl border border-chartreuse/40 bg-chartreuse/10 p-5 text-sm">
        <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Confirmed</p>
        <p className="mt-2 font-medium">
          {new Date(confirmation.startsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
        </p>
        <p className="mt-2 text-xs text-slate/70">
          Confirmation code: <span className="font-mono">{confirmation.guestCode.slice(0, 6)}</span>
        </p>
        <p className="mt-2 text-[11px] text-slate/60">
          You&rsquo;ll get a text shortly. Need to cancel? Show this screen at the host stand.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input
            type="date"
            name="date"
            required
            min={new Date().toISOString().slice(0, 10)}
            className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Time">
          <input
            type="time"
            name="time"
            required
            className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
          />
        </Field>
      </div>
      <Field label="Party size">
        <input
          type="number"
          name="partySize"
          min={1}
          max={20}
          defaultValue={2}
          required
          className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Name">
        <input name="guestName" required className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm" />
      </Field>
      <Field label="Phone (for SMS confirmation)">
        <input name="guestPhone" required type="tel" className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm" />
      </Field>
      <Field label="Notes (optional)">
        <input name="notes" className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm" />
      </Field>
      {error ? (
        <p className="rounded border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-slate px-4 py-2 text-sm text-oat hover:bg-slate/90 disabled:opacity-50"
      >
        {submitting ? "Booking…" : "Book"}
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
