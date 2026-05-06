"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "sent" | "error";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting" || !email) return;
    setStatus("submitting");
    setErrorMsg(null);
    setDevLink(null);
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      if (body?.devLink) setDevLink(body.devLink);
      setStatus("sent");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Could not send link");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl border border-chartreuse/30 bg-chartreuse/10 p-5">
        <p className="text-base font-medium text-oat">Check your email</p>
        <p className="mt-1 text-sm text-oat/70">
          If <span className="font-mono text-xs">{email}</span> is registered,
          a sign-in link is on its way. The link expires in 15 minutes.
        </p>
        {devLink ? (
          <p className="mt-4 break-all text-[11px] text-oat/50">
            <span className="uppercase tracking-wider">Dev:</span>{" "}
            <a className="underline" href={devLink}>{devLink}</a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="text-[11px] uppercase tracking-[0.18em] text-oat/50">
          Work email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-slate-light px-4 py-3 text-base text-oat placeholder-oat/30 outline-none focus:border-sea focus:ring-1 focus:ring-sea"
        />
      </div>
      {errorMsg ? <p className="text-sm text-coral">{errorMsg}</p> : null}
      <button
        type="submit"
        disabled={status === "submitting" || !email}
        className="w-full rounded-xl bg-chartreuse py-3 text-base font-medium text-slate disabled:opacity-60"
      >
        {status === "submitting" ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
