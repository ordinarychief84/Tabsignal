"use client";

import { useState } from "react";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  ackedCount: number;
  createdAt: string;
};

export function StaffPanel({
  initial,
  currentEmail,
}: {
  initial: Member[];
  currentEmail: string;
}) {
  const [items, setItems] = useState<Member[]>(initial);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setDevLink(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, send: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setItems(prev =>
        prev.some(p => p.id === body.id)
          ? prev.map(p => (p.id === body.id ? { ...p, ...body } : p))
          : [...prev, { ...body, ackedCount: 0, createdAt: new Date().toISOString() }]
      );
      if (body.devLink) setDevLink(body.devLink);
      setName("");
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate/10 bg-white px-6 py-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Invite staff</p>
        <p className="mt-1 text-sm text-slate/55">
          They&rsquo;ll get a sign-in link by email. No passwords.
        </p>
        <form onSubmit={invite} className="mt-5 grid gap-3 sm:grid-cols-[1fr,1fr,auto]">
          <input
            type="text"
            required
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-3 text-sm text-slate placeholder-slate/35 focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
          />
          <input
            type="email"
            required
            inputMode="email"
            placeholder="email@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-3 text-sm text-slate placeholder-slate/35 focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-chartreuse px-5 py-3 text-sm font-medium text-slate disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send link"}
          </button>
        </form>

        {error ? (
          <p className="mt-3 rounded-lg bg-coral/15 px-3 py-2 text-sm text-coral">{error}</p>
        ) : null}
        {devLink ? (
          <p className="mt-3 rounded-lg bg-chartreuse/15 px-3 py-2 text-[11px] text-slate/70">
            <span className="uppercase tracking-wider">Dev link:</span>{" "}
            <a className="break-all underline" href={devLink}>{devLink}</a>
          </p>
        ) : null}
      </section>

      <section>
        <header className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-medium">Team</h2>
          <p className="text-[11px] tracking-wide text-slate/40">{items.length} member{items.length === 1 ? "" : "s"}</p>
        </header>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
            No staff yet. Add yourself first to test the queue.
          </div>
        ) : (
          <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
            {items.map(m => (
              <li key={m.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate">
                    {m.name}
                    {m.email === currentEmail ? (
                      <span className="ml-2 rounded-full bg-chartreuse/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate/70">
                        you
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[12px] text-slate/55">{m.email}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm tabular-nums text-slate">{m.ackedCount}</p>
                  <p className="text-[10px] tracking-wide text-slate/40">acked</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
