"use client";

import { useState } from "react";

export function BroadcastPanel({ orgId, venueCount }: { orgId: string; venueCount: number }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ reachedVenueCount: number } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/operator/orgs/${orgId}/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: String(fd.get("subject") ?? "").trim(),
          body: String(fd.get("body") ?? "").trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setSent({ reachedVenueCount: body.reachedVenueCount ?? 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <section className="rounded-2xl border border-chartreuse/40 bg-chartreuse/15 p-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Sent</p>
        <h2 className="mt-2 text-xl font-medium">Reached {sent.reachedVenueCount} venue{sent.reachedVenueCount === 1 ? "" : "s"}.</h2>
        <p className="mt-2 text-sm text-slate/70">
          Currently logs server-side. Push / email fan-out is on the
          roadmap — track delivery in the deployment logs.
        </p>
        <button
          onClick={() => setSent(null)}
          className="mt-4 text-[12px] text-umber underline-offset-4 hover:underline"
        >
          Send another →
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate/10 bg-white p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Compose</p>

      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Subject</span>
        <input
          name="subject"
          required
          maxLength={120}
          placeholder="Saturday closing time + ID check reminder"
          className="mt-2 block w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Body</span>
        <textarea
          name="body"
          required
          rows={6}
          maxLength={2000}
          placeholder="Write the full notice here. Plain text. Keep it short — managers read these on their phone between covers."
          className="mt-2 block w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
        />
      </label>

      {error ? <p className="text-sm text-coral">{error}</p> : null}

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate/45">
          Reaches {venueCount} venue{venueCount === 1 ? "" : "s"} in this org.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-slate px-5 py-2 text-sm font-medium text-oat disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send broadcast"}
        </button>
      </div>
    </form>
  );
}
