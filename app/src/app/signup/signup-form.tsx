"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { COUNTRIES, toE164, type Country } from "@/lib/countries";

type Status = "idle" | "submitting" | "sent" | "error";

type FieldName = "restaurantName" | "address" | "phoneNational" | "email" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

/**
 * Restaurant signup form. Collects the six fields the spec requires:
 *
 *   - Restaurant name (required)
 *   - Address — single text line (required); ZIP is parsed server-side
 *   - Phone — country dial-code picker + national number (required).
 *     Dial-code defaults to the country we detected from the request
 *     headers (passed down via `defaultCountry`).
 *   - Email (required)
 *   - Password (required, ≥12 chars to match server policy)
 *   - Terms of Service / Privacy Policy checkbox (required)
 *
 * On submit, POSTs to /api/signup, which creates the org + venue +
 * staff member (status=INVITED, emailVerifiedAt=null) and sends a
 * verification email. The form then shows a "check your email"
 * confirmation. Verification is enforced at login: until the user
 * clicks the verification link, /api/auth/login returns 401
 * EMAIL_UNVERIFIED.
 */
export function SignupForm({ defaultCountry }: { defaultCountry: Country }) {
  const [restaurantName, setRestaurantName] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState<Country>(defaultCountry);
  const [phoneNational, setPhoneNational] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [devLink, setDevLink] = useState<string | null>(null);
  const [emailDeliveryFailed, setEmailDeliveryFailed] = useState(false);

  // Live preview of the composed E.164 number so the user can sanity-
  // check the international format before submitting. Null while the
  // input is empty or clearly too short.
  const e164Preview = useMemo(
    () => (phoneNational ? toE164(country, phoneNational) : null),
    [country, phoneNational],
  );

  function validate(name: FieldName, value: string): string | undefined {
    const v = value.trim();
    if (name === "restaurantName") return v.length >= 1 ? undefined : "What's the restaurant called?";
    if (name === "address") return v.length >= 5 ? undefined : "Enter the full street address.";
    if (name === "phoneNational") {
      if (!v) return "Phone number is required.";
      if (!toE164(country, v)) return "That phone number doesn't look right.";
      return undefined;
    }
    if (name === "email") {
      if (!v) return "Email is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Use a real email address.";
    }
    if (name === "password") {
      if (v.length < 12) return "Password must be at least 12 characters.";
    }
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
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    const errs: FieldErrors = {};
    (["restaurantName", "address", "phoneNational", "email", "password"] as FieldName[]).forEach(n => {
      const v =
        n === "restaurantName" ? restaurantName :
        n === "address" ? address :
        n === "phoneNational" ? phoneNational :
        n === "email" ? email :
        password;
      const m = validate(n, v);
      if (m) errs[n] = m;
    });
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setStatus("error");
      setError("Check the highlighted fields and try again.");
      return;
    }

    const phoneE164 = toE164(country, phoneNational);
    if (!phoneE164) {
      setFieldErrors(prev => ({ ...prev, phoneNational: "That phone number doesn't look right." }));
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setError(null);
    setFieldErrors({});
    setDevLink(null);
    setEmailDeliveryFailed(false);

    const payloadEmail = email.trim().toLowerCase();
    setEmail(payloadEmail);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantName: restaurantName.trim(),
          address: address.trim(),
          phoneNumber: phoneE164,
          country: country.iso,
          email: payloadEmail,
          password,
          agreeTerms: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface server-side Zod detail when present so the user sees
        // what's wrong without re-typing the whole form.
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
      if (body?.emailDeliveryFailed) setEmailDeliveryFailed(true);
      if (body?.devLink) setDevLink(body.devLink);
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not start signup");
    }
  }

  /* -------------------------- success state -------------------------- */

  if (status === "sent") {
    return (
      <div className="space-y-5" role="status" aria-live="polite">
        <div className={["rounded-2xl p-5", emailDeliveryFailed ? "border border-coral/40 bg-coral/10" : "bg-chartreuse/20"].join(" ")}>
          <div className="flex items-center gap-2">
            {!emailDeliveryFailed ? (
              <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-chartreuse text-slate">
                <svg width="14" height="14" viewBox="0 0 12 12">
                  <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : null}
            <p className={["text-base font-semibold", emailDeliveryFailed ? "text-coral" : "text-slate"].join(" ")}>
              {emailDeliveryFailed ? "Account created — email didn't go out" : "Check your email"}
            </p>
          </div>
          {emailDeliveryFailed ? (
            <p className="mt-2 text-[14px] leading-relaxed text-slate/75">
              Your account is set up but our email provider couldn&rsquo;t deliver
              the verification link to <span className="font-mono text-xs">{email}</span>.
              Email{" "}
              <a className="text-umber underline-offset-4 hover:underline" href="mailto:support@tab-call.com">
                support@tab-call.com
              </a>{" "}
              from this address and we&rsquo;ll re-issue it within an hour.
            </p>
          ) : (
            <p className="mt-2 text-[14px] leading-relaxed text-slate/75">
              We sent a verification link to{" "}
              <span className="font-mono text-xs">{email}</span>. Tap it from
              this device to activate your account, then you can log in with
              your password.
            </p>
          )}
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
        id="restaurantName"
        label="Restaurant name"
        autoComplete="organization"
        value={restaurantName}
        onChange={v => { setRestaurantName(v); if (fieldErrors.restaurantName) clearFieldError("restaurantName"); }}
        onBlur={v => onBlur("restaurantName", v)}
        error={fieldErrors.restaurantName}
        placeholder="Luna Lounge"
      />

      <Field
        id="address"
        label="Address"
        autoComplete="street-address"
        value={address}
        onChange={v => { setAddress(v); if (fieldErrors.address) clearFieldError("address"); }}
        onBlur={v => onBlur("address", v)}
        error={fieldErrors.address}
        placeholder="123 Main St, Houston, TX 77002"
        hint="Full street address — used for receipts and local tax."
      />

      <div>
        <label htmlFor="phoneNational" className="block text-[12px] font-medium text-slate/70">
          Phone number
        </label>
        <div className="mt-1.5 flex gap-2">
          {/* Native <select> gives us free OS-native search + a11y.
              On mobile it becomes the system picker — much better
              than a custom React combobox at this fidelity. */}
          <label className="sr-only" htmlFor="signup-country">Country code</label>
          <select
            id="signup-country"
            value={country.iso}
            onChange={e => {
              const next = COUNTRIES.find(c => c.iso === e.target.value);
              if (next) setCountry(next);
            }}
            className="rounded-xl border border-slate/15 bg-white px-2 py-3 text-[14px] text-slate outline-none transition-shadow focus:border-slate/40 focus:ring-4 focus:ring-slate/[0.08]"
            aria-label="Country dial code"
          >
            {COUNTRIES.map(c => (
              <option key={c.iso} value={c.iso}>
                {c.flag} {c.iso} +{c.dialCode}
              </option>
            ))}
          </select>
          <input
            id="phoneNational"
            type="tel"
            autoComplete="tel-national"
            inputMode="tel"
            value={phoneNational}
            onChange={e => {
              setPhoneNational(e.target.value);
              if (fieldErrors.phoneNational) clearFieldError("phoneNational");
            }}
            onBlur={e => onBlur("phoneNational", e.target.value)}
            placeholder="555 123 4567"
            aria-invalid={fieldErrors.phoneNational ? "true" : undefined}
            className={[
              "block w-full rounded-xl border bg-white px-3.5 py-3 text-[15px] text-slate placeholder-slate/35 outline-none transition-shadow focus:ring-4",
              fieldErrors.phoneNational
                ? "border-coral/60 focus:border-coral focus:ring-coral/15"
                : "border-slate/15 focus:border-slate/40 focus:ring-slate/[0.08]",
            ].join(" ")}
          />
        </div>
        {fieldErrors.phoneNational ? (
          <p className="mt-1.5 text-[12px] text-coral" role="alert">
            {fieldErrors.phoneNational}
          </p>
        ) : e164Preview ? (
          <p className="mt-1.5 font-mono text-[11px] text-slate/55">
            Will save as <span className="text-slate/75">{e164Preview}</span>
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-slate/55">
            We&rsquo;ll text reservation confirmations to this number.
          </p>
        )}
      </div>

      <Field
        id="email"
        type="email"
        label="Email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={v => { setEmail(v); if (fieldErrors.email) clearFieldError("email"); }}
        onBlur={v => onBlur("email", v)}
        error={fieldErrors.email}
        placeholder="owner@luna-lounge.com"
      />

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="signup-password" className="block text-[12px] font-medium text-slate/70">
            Password
          </label>
          <button
            type="button"
            onClick={() => setShowPassword(s => !s)}
            className="text-[11px] text-slate/55 underline-offset-4 hover:underline"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <input
          id="signup-password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={password}
          onChange={e => { setPassword(e.target.value); if (fieldErrors.password) clearFieldError("password"); }}
          onBlur={e => onBlur("password", e.target.value)}
          placeholder="At least 12 characters"
          aria-invalid={fieldErrors.password ? "true" : undefined}
          className={[
            "mt-1.5 block w-full rounded-xl border bg-white px-3.5 py-3 text-[15px] text-slate placeholder-slate/35 outline-none transition-shadow focus:ring-4",
            fieldErrors.password
              ? "border-coral/60 focus:border-coral focus:ring-coral/15"
              : "border-slate/15 focus:border-slate/40 focus:ring-slate/[0.08]",
          ].join(" ")}
        />
        {fieldErrors.password ? (
          <p className="mt-1.5 text-[12px] text-coral" role="alert">
            {fieldErrors.password}
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-slate/55">
            12 characters minimum. You&rsquo;ll use this to log in.
          </p>
        )}
      </div>

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
        title={!agreed ? "Tick the terms checkbox to continue" : undefined}
      >
        {status === "submitting" ? "Creating account…" : "Create account"}
      </button>

      {!agreed ? (
        <p className="text-center text-[11px] leading-relaxed text-umber">
          Tick the Terms of Service checkbox above to continue.
        </p>
      ) : (
        <p className="text-center text-[11px] leading-relaxed text-slate/55">
          We&rsquo;ll send a one-tap verification link to your email.
        </p>
      )}
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
  hint,
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
  inputMode?: "email" | "text" | "tel";
  hint?: string;
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
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
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
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[11px] text-slate/55">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
