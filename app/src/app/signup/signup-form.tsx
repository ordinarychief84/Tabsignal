"use client";

import { useId, useState } from "react";

type Status = "idle" | "submitting" | "sent" | "error";

type FieldName = "email" | "ownerName" | "venueName" | "zipCode" | "tableCount";
type FieldErrors = Partial<Record<FieldName, string>>;

const ZIP_RE = /^\d{5}(-\d{4})?$/;
// Loose email check for inline UX feedback. Server still authoritatively validates.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateField(name: FieldName, raw: string): string | undefined {
  const v = raw.trim();
  switch (name) {
    case "email":
      if (!v) return "Email is required.";
      if (!EMAIL_RE.test(v)) return "Enter a valid email address.";
      return;
    case "ownerName":
      if (!v) return "Your name is required.";
      return;
    case "venueName":
      if (!v) return "Venue name is required.";
      return;
    case "zipCode":
      if (!v) return "ZIP code is required.";
      if (!ZIP_RE.test(v)) return "Use 5 digits (or 5+4).";
      return;
    case "tableCount": {
      if (!v) return;
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) return "Whole number of tables.";
      if (n < 1 || n > 60) return "Between 1 and 60.";
      return;
    }
  }
}

export function SignupForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  function onBlur(name: FieldName, value: string) {
    const msg = validateField(name, value);
    setErrors(prev => ({ ...prev, [name]: msg }));
  }

  function onChangeClearError(name: FieldName) {
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;

    const fd = new FormData(e.currentTarget);
    const rawEmail = String(fd.get("email") ?? "");
    const rawOwner = String(fd.get("ownerName") ?? "");
    const rawVenue = String(fd.get("venueName") ?? "");
    const rawZip = String(fd.get("zipCode") ?? "");
    const rawTables = String(fd.get("tableCount") ?? "");

    // Client-side gate: if any required field is invalid, show inline errors
    // and bail before hitting the network.
    const nextErrors: FieldErrors = {};
    const checks: Array<[FieldName, string]> = [
      ["email", rawEmail],
      ["ownerName", rawOwner],
      ["venueName", rawVenue],
      ["zipCode", rawZip],
      ["tableCount", rawTables],
    ];
    for (const [name, val] of checks) {
      const m = validateField(name, val);
      if (m) nextErrors[name] = m;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setStatus("error");
      setError("Please fix the highlighted fields.");
      return;
    }

    setStatus("submitting");
    setError(null);
    setErrors({});
    setDevLink(null);
    setAlreadyRegistered(false);

    // Trim + lowercase the email for UX clarity (server already does this too).
    const payloadEmail = rawEmail.trim().toLowerCase();
    setEmail(payloadEmail);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: payloadEmail,
          ownerName: rawOwner.trim(),
          venueName: rawVenue.trim(),
          zipCode: rawZip.trim(),
          tableCount: Number(rawTables || 6),
          timezone: String(fd.get("timezone") ?? "America/Chicago"),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      if (body?.alreadyRegistered) setAlreadyRegistered(true);
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
    setResendError(null);
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const body = await res.json().catch(() => ({}));
      if (body?.devLink) setDevLink(body.devLink);
      setResendStatus("sent");
    } catch (e) {
      setResendStatus("error");
      setResendError(e instanceof Error ? e.message : "Could not resend");
    }
  }

  if (status === "sent") {
    return (
      <div
        className="rounded-2xl border border-chartreuse/30 bg-chartreuse/15 p-6"
        role="status"
        aria-live="polite"
      >
        <p className="text-base font-medium">Check your email</p>
        {alreadyRegistered ? (
          <p className="mt-1 text-sm text-slate/70">
            If <span className="font-mono text-xs">{email}</span> is registered with us,
            we&rsquo;ve sent a sign-in link. Open it from this device.
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate/70">
            We sent a sign-in link to <span className="font-mono text-xs">{email}</span>.
            Tap it from this device and you&rsquo;ll land on a quick three-step
            wizard. The link expires in 15 minutes.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href="mailto:"
            className="inline-flex items-center rounded-full border border-slate/20 bg-white px-4 py-1.5 text-xs text-slate hover:border-slate/40"
          >
            Open email app
          </a>
          <button
            type="button"
            onClick={resend}
            disabled={resendStatus === "sending"}
            className="inline-flex items-center rounded-full border border-slate/20 bg-white px-4 py-1.5 text-xs text-slate hover:border-slate/40 disabled:opacity-60"
          >
            {resendStatus === "sending"
              ? "Resending…"
              : resendStatus === "sent"
                ? "Sent again"
                : "Resend link"}
          </button>
          {resendStatus === "sent" ? (
            <span className="text-[11px] text-slate/55">Check your inbox (and spam).</span>
          ) : null}
          {resendStatus === "error" && resendError ? (
            <span className="text-[11px] text-coral">{resendError}</span>
          ) : null}
        </div>

        {devLink ? (
          <p className="mt-4 break-all rounded bg-slate/5 px-3 py-2 text-[11px] text-slate/55">
            <span className="uppercase tracking-wider">Dev:</span>{" "}
            <a className="underline" href={devLink}>{devLink}</a>
          </p>
        ) : null}
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6"
      noValidate
      aria-busy={submitting}
    >
      <Section title="About you">
        <Field
          label="Your email"
          name="email"
          type="email"
          required
          autoFocus
          placeholder="you@yourbar.com"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          autoCapitalize="none"
          disabled={submitting}
          error={errors.email}
          onBlur={(e) => onBlur("email", e.currentTarget.value)}
          onChange={() => onChangeClearError("email")}
        />
        <Field
          label="Your name"
          name="ownerName"
          required
          maxLength={120}
          placeholder="Emeka"
          autoComplete="name"
          disabled={submitting}
          error={errors.ownerName}
          onBlur={(e) => onBlur("ownerName", e.currentTarget.value)}
          onChange={() => onChangeClearError("ownerName")}
        />
      </Section>

      <Section title="Your venue">
        <Field
          label="Venue name"
          name="venueName"
          required
          maxLength={120}
          placeholder="Otto's Lounge"
          disabled={submitting}
          error={errors.venueName}
          onBlur={(e) => onBlur("venueName", e.currentTarget.value)}
          onChange={() => onChangeClearError("venueName")}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="ZIP code"
            name="zipCode"
            required
            pattern="[0-9]{5}(-[0-9]{4})?"
            inputMode="numeric"
            placeholder="77006"
            autoComplete="postal-code"
            disabled={submitting}
            error={errors.zipCode}
            onBlur={(e) => onBlur("zipCode", e.currentTarget.value)}
            onChange={() => onChangeClearError("zipCode")}
          />
          <Field
            label="Tables (rough)"
            name="tableCount"
            type="number"
            min={1}
            max={60}
            defaultValue="6"
            inputMode="numeric"
            disabled={submitting}
            error={errors.tableCount}
            onBlur={(e) => onBlur("tableCount", e.currentTarget.value)}
            onChange={() => onChangeClearError("tableCount")}
          />
        </div>
        <Select
          label="Timezone"
          name="timezone"
          defaultValue="America/Chicago"
          disabled={submitting}
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

      {error ? (
        <p
          className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate disabled:opacity-60"
      >
        {submitting ? "Setting up…" : "Email me a sign-in link"}
      </button>

      <p className="text-center text-[11px] text-slate/45">
        By creating an account you agree to{" "}
        <a href="/terms" className="text-umber underline-offset-4 hover:underline">
          TabCall&rsquo;s terms
        </a>
        . We never email guests; you&rsquo;ll only hear from us about your own venue.
      </p>
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

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  unit?: string;
  error?: string;
};

function Field(props: FieldProps) {
  const { label, unit, error, id, name, ...rest } = props;
  const generatedId = useId();
  const inputId = id ?? `f-${name}-${generatedId}`;
  const errorId = `${inputId}-err`;
  const invalid = Boolean(error);
  return (
    <label htmlFor={inputId} className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</span>
        {unit ? (
          <span className="text-[10px] uppercase tracking-[0.14em] text-slate/45">{unit}</span>
        ) : null}
      </span>
      <input
        {...rest}
        id={inputId}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        className={[
          "mt-2 block w-full rounded-xl border bg-white px-4 py-3 text-base text-slate placeholder-slate/35 outline-none focus:ring-1",
          invalid
            ? "border-coral focus:border-coral focus:ring-coral"
            : "border-slate/15 focus:border-sea focus:ring-sea",
        ].join(" ")}
      />
      {invalid ? (
        <span id={errorId} className="mt-1 block text-xs text-coral">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function Select(props: {
  label: string;
  name: string;
  defaultValue?: string;
  disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  const generatedId = useId();
  const inputId = `f-${props.name}-${generatedId}`;
  return (
    <label htmlFor={inputId} className="block">
      <span className="text-[11px] uppercase tracking-[0.16em] text-umber">{props.label}</span>
      <select
        id={inputId}
        name={props.name}
        defaultValue={props.defaultValue}
        disabled={props.disabled}
        className="mt-2 block w-full rounded-xl border border-slate/15 bg-white px-4 py-3 text-base text-slate outline-none focus:border-sea focus:ring-1 focus:ring-sea disabled:opacity-60"
      >
        {props.options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
