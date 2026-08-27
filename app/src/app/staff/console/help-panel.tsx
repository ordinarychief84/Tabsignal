"use client";

import { useCallback, useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import {
  PING_ACTION_HINT,
  PING_ACTION_LABEL,
  STAFF_PING_KINDS,
  type StaffPingKind,
} from "@/lib/staff/ping";
import type { WaiterTable } from "@/lib/waiter-console";

/**
 * Asking the floor for something, and answering when somebody asks.
 *
 * Two taps to send: what you need, and which table. No text field —
 * see lib/staff/ping for why composing is the thing being prevented.
 *
 * Open asks from other people sit at the top of the panel with one
 * control, "I've got this", which is the only response that changes
 * anything on a floor. There is no reply, no thread and no read
 * receipt, because a server reading a thread is a server not looking at
 * their tables.
 */

type Ping = { id: string; kind: string; text: string; createdAt: string };

export function HelpPanel({
  venueId,
  tables,
}: {
  venueId: string;
  /** The waiter's own tables, for the "which table" step. */
  tables: WaiterTable[];
}) {
  const [pings, setPings] = useState<Ping[]>([]);
  const [choosing, setChoosing] = useState<StaffPingKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/ping", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setPings(body.pings ?? []);
    } catch {
      /* offline — keep whatever we last had */
    }
  }, []);

  useEffect(() => {
    void load();
    // Slow poll: a ping arrives over the socket, and this is the safety
    // net for a dropped connection rather than the primary path.
    const t = setInterval(() => void load(), 45_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onPing = () => void load();
    socket.on("staff_ping", onPing);
    socket.on("staff_ping_answered", onPing);
    return () => {
      socket.off("staff_ping", onPing);
      socket.off("staff_ping_answered", onPing);
    };
  }, [venueId, load]);

  async function send(kind: StaffPingKind, tableId: string | null) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/staff/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, tableId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? "Couldn't send that");
      setNote("Sent to the floor");
      setChoosing(null);
      setTimeout(() => setNote(null), 2500);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't send that");
    } finally {
      setBusy(false);
    }
  }

  async function answer(pingId: string) {
    // Optimistic — this is pressed while already walking.
    const previous = pings;
    setPings(p => p.filter(x => x.id !== pingId));
    try {
      const res = await fetch("/api/staff/ping", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pingId }),
      });
      if (!res.ok) {
        // 409 means somebody beat you to it, which is a fine outcome and
        // shouldn't look like an error — the card is already gone.
        if (res.status !== 409) setPings(previous);
      }
    } catch {
      setPings(previous);
    }
  }

  return (
    <section className="rounded-2xl border border-sandstone bg-surface p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
        The floor
      </h2>

      {/* Other people's asks, first — answering somebody is more urgent
          than raising your own. */}
      {pings.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {pings.map(p => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-saffron-deep/30 bg-saffron-soft px-3.5 py-2.5"
            >
              <span className="min-w-0 text-[13px] font-medium text-plum">{p.text}</span>
              <button
                type="button"
                onClick={() => void answer(p.id)}
                className="min-h-[40px] shrink-0 rounded-lg bg-plum px-3 text-[12px] font-semibold text-ivory"
              >
                I&rsquo;ve got this
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {choosing ? (
        <div className="mt-3">
          <p className="text-[13px] font-medium text-plum">
            {PING_ACTION_LABEL[choosing]} — which table?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tables
              .filter(t => t.mine)
              .map(t => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(choosing, t.id)}
                  className="min-h-[44px] rounded-xl border border-sandstone bg-surface-muted px-3.5 text-[14px] font-medium text-plum disabled:opacity-60"
                >
                  {t.label}
                </button>
              ))}
            {/* Not every ask is about a table — "need a manager" often
                isn't — so this is always available. */}
            <button
              type="button"
              disabled={busy}
              onClick={() => void send(choosing, null)}
              className="min-h-[44px] rounded-xl border border-sandstone px-3.5 text-[14px] text-graphite disabled:opacity-60"
            >
              No table
            </button>
            <button
              type="button"
              onClick={() => setChoosing(null)}
              className="min-h-[44px] px-2 text-[13px] text-graphite underline-offset-4 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {STAFF_PING_KINDS.map(kind => (
            <button
              key={kind}
              type="button"
              onClick={() => setChoosing(kind)}
              className="flex min-h-[52px] flex-col justify-center rounded-xl border border-sandstone bg-surface-muted px-3.5 text-left transition-colors hover:bg-surface-hover"
            >
              <span className="text-[14px] font-medium text-plum">
                {PING_ACTION_LABEL[kind]}
              </span>
              <span className="text-[11px] leading-tight text-graphite">
                {PING_ACTION_HINT[kind]}
              </span>
            </button>
          ))}
        </div>
      )}

      {note ? (
        <p role="status" className="mt-2.5 text-[12px] text-graphite">
          {note}
        </p>
      ) : null}
    </section>
  );
}
