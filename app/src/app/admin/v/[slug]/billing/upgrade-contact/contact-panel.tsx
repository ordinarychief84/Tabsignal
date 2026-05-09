"use client";

import { useState } from "react";

// Calendly URL is optional — if unset, we just collect their availability
// note and email TabCall. Set NEXT_PUBLIC_CALENDLY_URL in Vercel to
// surface the embed/link path.
const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL ?? "";

export function ContactPanel({
  slug,
  venueName,
  plan,
  sent,
}: {
  slug: string;
  venueName: string;
  plan: "growth" | "pro";
  sent: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(sent);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/admin/v/${slug}/billing/upgrade-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          phone: String(fd.get("phone") ?? "").trim() || undefined,
          availability: String(fd.get("availability") ?? "").trim() || undefined,
          notes: String(fd.get("notes") ?? "").trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section className="rounded-2xl border border-chartreuse/40 bg-chartreuse/15 p-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Got it</p>
        <h2 className="mt-2 text-xl font-medium">We&rsquo;ll be in touch within one business day.</h2>
        <p className="mt-2 text-sm text-slate/70">
          A TabCall founder will email <strong>{venueName}</strong>&rsquo;s primary
          contact to schedule the {plan === "pro" ? "Pro" : "Growth"} setup call.
          We&rsquo;ll have your account flipped to {plan === "pro" ? "Pro" : "Growth"} the
          moment we hang up.
        </p>
        {CALENDLY_URL ? (
          <p className="mt-4 text-sm">
            Want to skip the email and pick a slot now?{" "}
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noreferrer"
              className="text-umber underline-offset-4 hover:underline"
            >
              Open the calendar →
            </a>
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {CALENDLY_URL ? (
        <a
          href={CALENDLY_URL}
          target="_blank"
          rel="noreferrer"
          className="block rounded-2xl border border-chartreuse/40 bg-chartreuse/15 p-5 text-center hover:bg-chartreuse/25"
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Fastest</p>
          <p className="mt-1 text-base font-medium">Pick a 15-min slot on the calendar →</p>
          <p className="mt-1 text-xs text-slate/55">Opens in a new tab. We&rsquo;ll auto-confirm by email.</p>
        </a>
      ) : null}

      <form onSubmit={onSubmit} className="rounded-2xl border border-slate/10 bg-white p-5 space-y-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Or send a note</p>
        <p className="text-sm text-slate/60">
          Tell us when you&rsquo;re free and we&rsquo;ll book a 15-min call. Phone is
          optional — useful if email gets buried.
        </p>

        <Field label="Phone (optional)" name="phone" type="tel" placeholder="+1 555-555-5555" />
        <Field
          label="When are you free?"
          name="availability"
          placeholder="Weekday afternoons CT work best"
        />
        <Textarea
          label="Anything we should know?"
          name="notes"
          rows={3}
          placeholder="POS system, urgency, edge cases — anything useful for the call"
        />

        {error ? <p className="text-sm text-coral">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-slate py-3 text-sm font-medium text-oat hover:bg-slate/90 disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send to TabCall"}
        </button>
      </form>
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
        className="mt-2 block w-full rounded-lg border border-slate/15 bg-white px-3 py-2 text-sm"
      />
    </label>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</span>
      <textarea
        {...rest}
        className="mt-2 block w-full rounded-lg border border-slate/15 bg-white px-3 py-2 text-sm"
      />
    </label>
  );
}
