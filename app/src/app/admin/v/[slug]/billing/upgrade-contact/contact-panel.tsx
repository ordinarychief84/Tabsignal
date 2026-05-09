"use client";

import { useId, useState } from "react";

// Calendly URL is optional — if unset, we just collect their availability
// note and email TabCall. Set NEXT_PUBLIC_CALENDLY_URL in Vercel to
// surface the embed/link path.
const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL ?? "";

const PLAN_PERKS: Record<"growth" | "pro", string> = {
  growth:
    "regulars CRM, named-tab splits, tip pooling, and concierge onboarding",
  pro:
    "multi-location, regulars dossier, custom branding, and a dedicated rep",
};

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
  const [showEmailForm, setShowEmailForm] = useState(!CALENDLY_URL);
  const planTitle = plan === "pro" ? "Pro" : "Growth";
  const perks = PLAN_PERKS[plan];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const fd = new FormData(e.currentTarget);
    const phone = String(fd.get("phone") ?? "").trim();
    const availability = String(fd.get("availability") ?? "").trim();
    const notes = String(fd.get("notes") ?? "").trim();

    // Empty submissions help no one — require at least one signal of intent.
    if (!availability && !notes) {
      setError("Tell us when you're free, or add a quick note. Empty notes can't be acted on.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/v/${slug}/billing/upgrade-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          phone: phone || undefined,
          availability: availability || undefined,
          notes: notes || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
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
      <section
        className="rounded-2xl border border-chartreuse/40 bg-chartreuse/15 p-6"
        role="status"
        aria-live="polite"
      >
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Got it</p>
        <h2 className="mt-2 text-xl font-medium">We&rsquo;ll be in touch within one business day.</h2>
        <p className="mt-2 text-sm text-slate/70">
          A TabCall founder will email <strong>{venueName}</strong>&rsquo;s primary
          contact to schedule the {planTitle} setup call. We&rsquo;ll have your
          account flipped to {planTitle} the moment we hang up — that&rsquo;s when{" "}
          {perks} go live.
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
        <p className="mt-4 text-sm">
          <button
            type="button"
            onClick={() => {
              setSuccess(false);
              setError(null);
              setShowEmailForm(true);
            }}
            className="text-umber underline-offset-4 hover:underline"
          >
            Send another note →
          </button>
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <p className="text-sm text-slate/65">
        {planTitle} unlocks {perks}. Pick how you&rsquo;d like to start.
      </p>

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

      {CALENDLY_URL && !showEmailForm ? (
        <p className="text-center text-xs text-slate/55">
          <button
            type="button"
            onClick={() => setShowEmailForm(true)}
            className="underline underline-offset-4 hover:text-slate"
          >
            Or email instead
          </button>
        </p>
      ) : null}

      {showEmailForm ? (
        <EmailForm
          plan={plan}
          planTitle={planTitle}
          submitting={submitting}
          error={error}
          onSubmit={onSubmit}
        />
      ) : null}
    </section>
  );
}

function EmailForm({
  planTitle,
  submitting,
  error,
  onSubmit,
}: {
  plan: "growth" | "pro";
  planTitle: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const phoneId = useId();
  const availId = useId();
  const notesId = useId();
  const errorId = `${availId}-err`;
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-slate/10 bg-white p-5 space-y-4"
      noValidate
      aria-busy={submitting}
    >
      <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Or send a note</p>
      <p className="text-sm text-slate/60">
        Tell us when you&rsquo;re free and we&rsquo;ll book a 15-min {planTitle} setup
        call. Phone is optional — useful if email gets buried.
      </p>

      <Field
        id={phoneId}
        label="Phone (optional)"
        name="phone"
        type="tel"
        autoComplete="tel"
        placeholder="+1 555-555-5555"
        disabled={submitting}
      />
      <Field
        id={availId}
        label="When are you free?"
        name="availability"
        placeholder="Weekday afternoons CT work best"
        disabled={submitting}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <Textarea
        id={notesId}
        label="Anything we should know?"
        name="notes"
        rows={3}
        placeholder="POS system, urgency, edge cases — anything useful for the call"
        disabled={submitting}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />

      {error ? (
        <p id={errorId} className="text-sm text-coral" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-slate py-3 text-sm font-medium text-oat hover:bg-slate/90 disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send to TabCall"}
      </button>
    </form>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, id, name, ...rest } = props;
  const generatedId = useId();
  const inputId = id ?? `f-${name}-${generatedId}`;
  return (
    <label htmlFor={inputId} className="block">
      <span className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</span>
      <input
        {...rest}
        id={inputId}
        name={name}
        className="mt-2 block w-full rounded-lg border border-slate/15 bg-white px-3 py-2 text-sm disabled:opacity-60"
      />
    </label>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const { label, id, name, ...rest } = props;
  const generatedId = useId();
  const inputId = id ?? `f-${name}-${generatedId}`;
  return (
    <label htmlFor={inputId} className="block">
      <span className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</span>
      <textarea
        {...rest}
        id={inputId}
        name={name}
        className="mt-2 block w-full rounded-lg border border-slate/15 bg-white px-3 py-2 text-sm disabled:opacity-60"
      />
    </label>
  );
}
