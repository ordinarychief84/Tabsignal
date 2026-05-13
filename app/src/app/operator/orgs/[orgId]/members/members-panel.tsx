"use client";

import { useState } from "react";

type Role = "OWNER" | "ADMIN" | "VIEWER";
type Member = { id: string; email: string; role: string; createdAt: string };

export function MembersPanel({
  orgId,
  canManage,
  initial,
}: {
  orgId: string;
  canManage: boolean;
  initial: Member[];
}) {
  const [members, setMembers] = useState<Member[]>(initial);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(email: string, role: Role) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/operator/orgs/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setMembers(curr => {
        const existing = curr.find(m => m.id === body.id);
        if (existing) return curr.map(m => m.id === body.id ? { ...m, role: body.role } : m);
        return [...curr, { id: body.id, email: body.email, role: body.role, createdAt: new Date().toISOString() }];
      });
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/operator/orgs/${orgId}/members/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
      setMembers(curr => curr.filter(m => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove");
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate/10 bg-white p-5">
        <header className="mb-3 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{members.length} member{members.length === 1 ? "" : "s"}</p>
          {canManage && !adding ? (
            <button
              onClick={() => setAdding(true)}
              className="rounded-full bg-slate px-3 py-1 text-xs text-oat hover:bg-slate/90"
            >
              + Add member
            </button>
          ) : null}
        </header>

        {adding ? (
          <form
            onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const email = String(fd.get("email") ?? "").trim();
              const role = String(fd.get("role") ?? "VIEWER") as Role;
              if (email) add(email, role);
            }}
            className="mb-3 grid grid-cols-[1fr_auto_auto] gap-2"
          >
            <input
              name="email"
              type="email"
              required
              placeholder="cofounder@yourbar.com"
              className="rounded border border-slate/15 bg-white px-3 py-1.5 text-sm"
            />
            <select
              name="role"
              defaultValue="ADMIN"
              className="rounded border border-slate/15 bg-white px-3 py-1.5 text-sm"
            >
              <option value="OWNER">OWNER</option>
              <option value="ADMIN">ADMIN</option>
              <option value="VIEWER">VIEWER</option>
            </select>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="rounded-full bg-slate px-3 py-1 text-xs text-oat disabled:opacity-50">
                {busy ? "…" : "Add"}
              </button>
              <button type="button" onClick={() => setAdding(false)} className="text-[12px] text-slate/55 hover:text-slate">cancel</button>
            </div>
          </form>
        ) : null}

        {members.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate/55">No members yet.</p>
        ) : (
          <ul className="divide-y divide-slate/5">
            {members.map(m => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm">{m.email}</p>
                  <p className="font-mono text-[11px] text-slate/50">
                    {m.role.toLowerCase()} · added {new Date(m.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {canManage ? (
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${m.email} from this org?`)) remove(m.id);
                    }}
                    className="rounded-full border border-coral/30 px-3 py-1 text-xs text-coral hover:bg-coral/5"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!canManage ? (
        <p className="text-[11px] text-slate/45">
          You&rsquo;re a viewer here. Adding/removing members requires OWNER or ADMIN.
        </p>
      ) : null}
    </div>
  );
}
