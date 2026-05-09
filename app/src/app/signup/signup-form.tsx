"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "sent" | "error";

export function SignupForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setError(null);
    setDevLink(null);
    setAlreadyRegistered(false);

    const fd = new FormData(e.currentTarget);
    const payloadEmail = String(fd.get("email") ?? "").trim();
    setEmail(payloadEmail);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: payloadEmail,
          ownerName: String(fd.get("ownerName") ?? ""),
          venueName: String(fd.get("venueName") ?? ""),
          zipCode: String(fd.get("zipCode") ?? ""),
          tableCount: Number(fd.get("tableCount") ?? 6),
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

  if (status === "sent") {
    return (
      <div className="rounded-2xl border border-chartreuse/30 bg-chartreuse/15 p-6">
        <p className="text-base font-medium">Check your email</p>
        {alreadyRegistered ? (
          <p className="mt-1 text-sm text-slate/70">
            Looks like <span className="font-mono text-xs">{email}</span> already runs
            a venue with us. We&rsquo;ve sent a sign-in link instead — open it
            from this device.
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate/70">
            We sent a sign-in link to <span className="font-mono text-xs">{email}</span>.
            Tap it from this device and you&rsquo;ll land on a quick three-step
            wizard. The link expires in 15 minutes.
          </p>
        )}
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
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="About you">
        <Field label="Your email" name="email" type="email" required placeholder="you@yourbar.com" autoComplete="email" />
        <Field label="Your name" name="ownerName" required maxLength={120} placeholder="Emeka" />
      </Section>

      <Section title="Your venue">
        <Field label="Venue name" name="venueName" required maxLength={120} placeholder="Otto's Lounge" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="ZIP code" name="zipCode" required pattern="[0-9]{5}(-[0-9]{4})?" inputMode="numeric" placeholder="77006" />
          <Field label="Tables (rough)" name="tableCount" type="number" min={1} max={60} defaultValue="6" />
        </div>
        <Select
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
      </Section>

      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate disabled:opacity-60"
      >
        {status === "submitting" ? "Setting up…" : "Email me a sign-in link"}
      </button>

      <p className="text-center text-[11px] text-slate/45">
        By creating an account you agree to TabCall&rsquo;s terms. We never email
        guests; you&rsquo;ll only hear from us about your own venue.
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

function Select(props: {
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
