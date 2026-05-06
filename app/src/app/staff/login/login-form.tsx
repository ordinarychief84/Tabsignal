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
      // In dev, the API may return the link directly when Resend is unconfigured.
      if (body?.devLink) setDevLink(body.devLink);
      setStatus("sent");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Could not send link");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl bg-emerald-50 p-5 text-center">
        <p className="text-base font-semibold text-emerald-900">Check your email</p>
        <p className="mt-1 text-sm text-emerald-800">
          If <strong>{email}</strong> is registered, a sign-in link is on its way.
        </p>
        {devLink ? (
          <p className="mt-4 break-all text-xs text-emerald-700">
            <strong>Dev mode:</strong>{" "}
            <a className="underline" href={devLink}>{devLink}</a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base"
      />
      {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
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
