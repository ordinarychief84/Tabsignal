"use client";

import { useEffect, useState } from "react";

type Reservation = {
  id: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  startsAt: string;
  endsAt: string;
  status: "PENDING" | "ARRIVED" | "SEATED" | "NO_SHOW" | "CANCELED";
  tableId: string | null;
  tableLabel: string | null;
  zone: string | null;
  notes: string | null;
};

type WaitlistEntry = {
  id: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  quotedWaitMin: number;
  joinedAt: string;
  notifiedAt: string | null;
  status: string;
};

export function ReservationsPanel({ slug, initialDate }: { slug: string; initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [queue, setQueue] = useState<WaitlistEntry[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function load() {
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/admin/v/${slug}/reservations?date=${date}`),
        fetch(`/api/admin/v/${slug}/waitlist`),
      ]);
      if (r1.ok) {
        const b = await r1.json();
        setReservations(b.reservations ?? []);
      }
      if (r2.ok) {
        const b = await r2.json();
        setQueue(b.queue ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }

  async function setStatus(id: string, status: Reservation["status"]) {
    setPending(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function notifyWaitlist(id: string) {
    setPending(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</p>
      ) : null}

      <section className="rounded-2xl border border-slate/10 bg-white p-5">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">Bookings</h2>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded border border-slate/15 bg-white px-2 py-1 text-sm"
          />
        </header>
        {reservations.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate/55">No reservations on this date.</p>
        ) : (
          <ul className="divide-y divide-slate/5">
            {reservations.map(r => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {timeOf(r.startsAt)} · party of {r.partySize} · {r.guestName}
                  </p>
                  <p className="font-mono text-[11px] text-slate/55">
                    {r.guestPhone} · {r.tableLabel ?? r.zone ?? "any"} · {r.status.toLowerCase()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {r.status === "PENDING" ? (
                    <Btn onClick={() => setStatus(r.id, "ARRIVED")} disabled={pending === r.id}>Arrived</Btn>
                  ) : null}
                  {r.status === "ARRIVED" ? (
                    <Btn onClick={() => setStatus(r.id, "SEATED")} disabled={pending === r.id}>Seated</Btn>
                  ) : null}
                  {(r.status === "PENDING" || r.status === "ARRIVED") ? (
                    <Btn onClick={() => setStatus(r.id, "NO_SHOW")} disabled={pending === r.id} variant="warn">No-show</Btn>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate/10 bg-white p-5">
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Waitlist</h2>
          <span className="text-[11px] text-slate/45">{queue.filter(q => q.status === "WAITING").length} waiting</span>
        </header>
        {queue.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate/55">No one waiting.</p>
        ) : (
          <ul className="divide-y divide-slate/5">
            {queue.map(q => (
              <li key={q.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {q.guestName} · party of {q.partySize}
                  </p>
                  <p className="font-mono text-[11px] text-slate/55">
                    {q.guestPhone} · joined {timeOf(q.joinedAt)} · quoted {q.quotedWaitMin}m
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {q.status === "WAITING" ? (
                    <Btn onClick={() => notifyWaitlist(q.id)} disabled={pending === q.id}>Notify</Btn>
                  ) : (
                    <span className="rounded-full bg-chartreuse/20 px-3 py-1 text-[11px] text-slate">notified</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "warn";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-full px-3 py-1 text-xs",
        variant === "warn"
          ? "border border-coral/30 text-coral hover:bg-coral/5"
          : "border border-slate/15 text-slate/80 hover:border-slate/40",
        "disabled:opacity-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
