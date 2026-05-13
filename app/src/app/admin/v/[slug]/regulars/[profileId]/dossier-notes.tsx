"use client";

import { useState } from "react";

type Note = {
  id: string;
  authorName: string;
  body: string;
  pinned: boolean;
  createdAt: string;
};

export function DossierNotes({
  slug,
  profileId,
  initialNotes,
}: {
  slug: string;
  profileId: string;
  initialNotes: Note[];
}) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!body.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/regulars/${profileId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), pinned }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b?.error ?? `HTTP ${res.status}`);
      setNotes(curr => [{ ...b }, ...curr]);
      setBody("");
      setPinned(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setPending(false);
    }
  }

  async function togglePin(id: string, next: boolean) {
    setError(null);
    const before = notes;
    setNotes(curr => curr.map(n => (n.id === id ? { ...n, pinned: next } : n)));
    try {
      const res = await fetch(`/api/admin/v/${slug}/regulars/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setNotes(before);
      setError(e instanceof Error ? e.message : "Could not pin");
    }
  }

  async function remove(id: string) {
    setError(null);
    const before = notes;
    setNotes(curr => curr.filter(n => n.id !== id));
    try {
      const res = await fetch(`/api/admin/v/${slug}/regulars/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setNotes(before);
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <section className="rounded-2xl border border-slate/10 bg-white p-5">
      <h2 className="text-[11px] uppercase tracking-[0.16em] text-umber">Staff notes</h2>
      <p className="mt-1 text-xs text-slate/55">
        Anything the next bartender should know: drink preferences, allergies, who they came in with.
      </p>

      <div className="mt-4 space-y-2">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={2}
          placeholder="e.g. Allergic to peanuts; partner Mike; usually orders Negroni neat."
          className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[12px] text-slate/70">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
            Pin to top
          </label>
          <button
            onClick={add}
            disabled={pending || !body.trim()}
            className="rounded-full bg-slate px-4 py-1.5 text-sm text-oat hover:bg-slate/90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Add note"}
          </button>
        </div>
        {error ? <p className="text-xs text-coral">{error}</p> : null}
      </div>

      {notes.length === 0 ? (
        <p className="mt-6 py-4 text-center text-xs text-slate/45">No notes yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate/5">
          {notes.map(n => (
            <li key={n.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">{n.body}</p>
                  <p className="mt-1 font-mono text-[11px] text-slate/45">
                    {n.authorName} · {new Date(n.createdAt).toLocaleDateString()}
                    {n.pinned ? " · pinned" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => togglePin(n.id, !n.pinned)}
                    className="rounded-full border border-slate/15 px-2 py-0.5 text-[11px] text-slate/70 hover:border-slate/40"
                  >
                    {n.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    onClick={() => remove(n.id)}
                    className="rounded-full border border-coral/30 px-2 py-0.5 text-[11px] text-coral hover:bg-coral/5"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
