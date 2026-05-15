"use client";

import Link from "next/link";
import { useState } from "react";

type Status = "idle" | "submitting" | "sent" | "error";

type FieldName = "fullName" | "email" | "venueName";
type FieldErrors = Partial<Record<FieldName, string>>;

/**
 * Modern, polished signup form.
 *
 * Asks the minimum to provision an account: full name, work email,
 * venue name. The rest of the venue setup (ZIP, table count, brand,
 * features) happens on the onboarding wizard at
 * /admin/v/[slug]/onboarding after the magic-link click.
 *
 * Auth model: email-based magic link. Same model as Notion, Linear,
 * Slack — no password to remember. We're explicit about this in the
 * footer copy so users understand what arrives in their inbox.
 *
 * Backend defaults applied here so we don't have to relax the
 * /api/signup Zod schema:
 *   - zipCode: "00000" (sentinel; onboarding step 1 forces correction)
 *   - tableCount: 6 (the default the schema already carries)
 *   - timezone: "America/Chicago" (US-centric default; onboarding can change)
 */
export function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [venueName, setVenueName] = useState("");
  const [agreed, setAgreed] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [emailDeliveryFailed, setEmailDeliveryFailed] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  function validate(name: FieldName, value: string): string | undefined {
    const v = value.trim();
    if (name === "fullName") return v.length >= 1 ? undefined : "Tell us your name.";
    if (name === "email") {
      if (!v) return "Email is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Use a real email address.";
    }
    if (name === "venueName") return v.length >= 1 ? undefined : "What's the venue called?";
    return undefined;
  }

  function onBlur(name: FieldName, value: string) {
    const msg = validate(name, value);
    setFieldErrors(prev => ({ ...prev, [name]: msg }));
  }

  function clearFieldError(name: FieldName) {
    setFieldErrors(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;

    if (!agreed) {
      setStatus("error");
      setError("Please agree to the Terms of Service and Privacy Policy before continuing.");
      return;
    }

    const errs: FieldErrors = {};
    (["fullName", "email", "venueName"] as FieldName[]).forEach(n => {
      const v = n === "fullName" ? fullName : n === "email" ? email : venueName;
      const m = validate(n, v);
      if (m) errs[n] = m;
    });
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setStatus("error");
      setError("Check the highlighted fields and try again.");
      return;
    }

    setStatus("submitting");
    setError(null);
    setFieldErrors({});
    setDevLink(null);
    setAlreadyRegistered(false);
    setEmailDeliveryFailed(false);

    const payloadEmail = email.trim().toLowerCase();
    setEmail(payloadEmail);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: payloadEmail,
          ownerName: fullName.trim(),
          venueName: venueName.trim(),
          // ZIP is captured during onboarding step 1. Sentinel passes the
          // 5-digit regex; the onboarding wizard forces a real value
          // before the venue is considered set up.
          zipCode: "00000",
          tableCount: 6,
          timezone: "America/Chicago",
          agreeTerms: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      if (body?.alreadyRegistered) setAlreadyRegistered(true);
      if (body?.emailDeliveryFailed) setEmailDeliveryFailed(true);
      if (body?.devLink) setDevLink(body.devLink);
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not start signup");
    }
  }

  async function resend() {
    if (resendStatus === "sending") return;
    setResendStatus("sending");
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      if (body?.devLink) setDevLink(body.devLink);
      setResendStatus("sent");
    } catch {
      setResendStatus("error");
    }
  }

  /* -------------------------- success states ------------------------- */

  if (status === "sent") {
    if (emailDeliveryFailed) {
      return (
        <div
          className="rounded-2xl border border-coral/40 bg-coral/10 p-5"
          role="status"
          aria-live="polite"
        >
          <p className="text-base font-semibold text-coral">Account created — but the email didn&rsquo;t go out</p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate/75">
            Your venue is set up. Our email provider couldn&rsquo;t deliver the
            sign-in link to <span className="font-mono text-xs">{email}</span>.
            Email{" "}
            <a className="text-umber underline-offset-4 hover:underline" href="mailto:support@tab-call.com">
              support@tab-call.com
            </a>{" "}
            from this address and we&rsquo;ll re-issue your link within an hour.
          </p>
          {devLink ? (
            <p className="mt-4 break-all rounded bg-slate/5 px-3 py-2 text-[11px] text-slate/55">
              <span className="uppercase tracking-wider">Dev:</span>{" "}
              <a className="underline" href={devLink}>{devLink}</a>
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <div className="space-y-5" role="status" aria-live="polite">
        <div className="rounded-2xl bg-chartreuse/20 p-5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-chartreuse text-slate">
              <svg width="14" height="14" viewBox="0 0 12 12">
                <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="text-base font-semibold text-slate">Check your email</p>
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-slate/75">
            {alreadyRegistered ? (
              <>
                If <span className="font-mono text-xs">{email}</span> is registered, we&rsquo;ve sent
                a sign-in link. Open it from this device.
              </>
            ) : (
              <>
                We sent a sign-in link to <span className="font-mono text-xs">{email}</span>.
                Tap it from this device to finish setup.
              </>
            )}
          </p>
        </div>

        <div className="rounded-xl border border-slate/10 bg-white p-4 text-[12px] text-slate/65">
          <p>
            Didn&rsquo;t get it? Check your spam folder, or{" "}
            <button
              type="button"
              onClick={resend}
              disabled={resendStatus === "sending"}
              className="font-semibold text-umber underline-offset-4 hover:underline disabled:opacity-60"
            >
              {resendStatus === "sending" ? "resending…" : resendStatus === "sent" ? "resent" : "resend the link"}
            </button>
            .
          </p>
        </div>

        {devLink ? (
          <p className="break-all rounded bg-slate/5 px-3 py-2 text-[11px] text-slate/55">
            <span className="uppercase tracking-wider">Dev:</span>{" "}
            <a className="underline" href={devLink}>{devLink}</a>
          </p>
        ) : null}
      </div>
    );
  }

  /* --------------------------- form view ----------------------------- */

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field
        id="fullName"
        label="Full name"
        autoComplete="name"
        value={fullName}
        onChange={(v) => {
          setFullName(v);
          if (fieldErrors.fullName) clearFieldError("fullName");
        }}
        onBlur={(v) => onBlur("fullName", v)}
        error={fieldErrors.fullName}
        placeholder="Maria Lopez"
      />
      <Field
        id="email"
        type="email"
        label="Work email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(v) => {
          setEmail(v);
          if (fieldErrors.email) clearFieldError("email");
        }}
        onBlur={(v) => onBlur("email", v)}
        error={fieldErrors.email}
        placeholder="maria@luna-lounge.com"
      />
      <Field
        id="venueName"
        label="Venue name"
        autoComplete="organization"
        value={venueName}
        onChange={(v) => {
          setVenueName(v);
          if (fieldErrors.venueName) clearFieldError("venueName");
        }}
        onBlur={(v) => onBlur("venueName", v)}
        error={fieldErrors.venueName}
        placeholder="Luna Lounge"
      />

      <label className="mt-1 flex items-start gap-3 rounded-xl bg-slate/[0.03] p-3 text-[13px] text-slate/75">
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate/30 accent-slate"
        />
        <span className="leading-relaxed">
          I agree to TabCall&rsquo;s{" "}
          <Link href="/terms" target="_blank" className="text-umber underline-offset-4 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/terms#privacy" target="_blank" className="text-umber underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "submitting" || !agreed}
        className="min-h-[48px] w-full rounded-xl bg-chartreuse text-[15px] font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {status === "submitting" ? "Sending sign-in link…" : "Create account"}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-slate/55">
        We use passwordless sign-in. Submit your email and we&rsquo;ll send a
        single-use link that signs you in straight to onboarding.
      </p>
    </form>
  );
}

/* ---------------------------------------------------------------------- */
/* Field — single source for label + input + error + focus styling        */
/* ---------------------------------------------------------------------- */

function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  autoComplete,
  inputMode,
}: {
  id: string;
  label: string;
  type?: "text" | "email";
  value: string;
  onChange: (v: string) => void;
  onBlur: (v: string) => void;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "email" | "text";
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-medium text-slate/70">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={[
          "mt-1.5 block w-full rounded-xl border bg-white px-3.5 py-3 text-[15px] text-slate placeholder-slate/35 outline-none transition-shadow",
          "focus:ring-4",
          error
            ? "border-coral/60 focus:border-coral focus:ring-coral/15"
            : "border-slate/15 focus:border-slate/40 focus:ring-slate/[0.08]",
        ].join(" ")}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[12px] text-coral" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
