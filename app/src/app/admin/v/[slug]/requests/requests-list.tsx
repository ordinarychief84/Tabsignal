"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Mirror of the row shape returned by /api/venue/[venueId]/requests/live.
// Kept in sync manually — if the endpoint adds fields, add them here too.
export type LiveRequest = {
  id: string;
  tableId: string;
  tableLabel: string;
  type: "DRINK" | "BILL" | "HELP" | "REFILL";
  note: string | null;
  status: "PENDING" | "ACKNOWLEDGED" | "RESOLVED" | "ESCALATED";
  idCheckRequired?: boolean;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  escalatedAt: string | null;
  resolutionAction: string | null;
  acknowledgedBy: { id: string; name: string } | null;
};

type Tab = "all" | "pending" | "active" | "delayed" | "completed";

const TAB_ORDER: { id: Tab; label: string }[] = [
  { id: "all",       label: "All"       },
  { id: "pending",   label: "Pending"   },
  { id: "active",    label: "Active"    },
  { id: "delayed",   label: "Delayed"   },
  { id: "completed", label: "Completed" },
];

const REQUEST_LABEL: Record<LiveRequest["type"], string> = {
  DRINK: "Drink",
  BILL: "Bill",
  HELP: "Help",
  REFILL: "Refill",
};

// Same threshold the floor app uses so the buckets line up.
const DELAYED_THRESHOLD_MS = 90_000;

// 5s polling — feels real-time without socket bookkeeping. Acceptable
// because this is the admin desktop view, not the high-frequency floor
// PWA (which keeps sockets + 30s safety-net polling).
const POLL_INTERVAL_MS = 5_000;

const RESOLVE_ACTIONS: { id: string; label: string }[] = [
  { id: "SERVED",         label: "Served"         },
  { id: "COMPED",         label: "Comped"         },
  { id: "REFUSED",        label: "Refused"        },
  { id: "ESCALATED",      label: "Escalated"      },
  { id: "NOT_ACTIONABLE", label: "Not actionable" },
  { id: "OTHER",          label: "Other"          },
];

const TYPE_FILTERS: { id: LiveRequest["type"]; label: string }[] = [
  { id: "DRINK",  label: "Drink"  },
  { id: "BILL",   label: "Bill"   },
  { id: "HELP",   label: "Help"   },
  { id: "REFILL", label: "Refill" },
];

type StaffMate = { id: string; name: string };

export function RequestsList({
  slug: _slug,
  venueId,
  staffId,
  initial,
}: {
  slug: string;
  venueId: string;
  staffId: string;
  initial: LiveRequest[];
}) {
  void _slug;
  const [items, setItems] = useState<LiveRequest[]>(initial);
  const [tab, setTab] = useState<Tab>("all");
  const [typeFilter, setTypeFilter] = useState<Set<LiveRequest["type"]>>(new Set());
  const [tableFilter, setTableFilter] = useState<Set<string>>(new Set());
  const [staffMates, setStaffMates] = useState<StaffMate[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tick every 15s so age-based bucketing (PENDING → delayed at 90s)
  // refreshes without waiting for a server poll.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  const aborter = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    aborter.current?.abort();
    aborter.current = new AbortController();
    try {
      const res = await fetch(`/api/venue/${venueId}/requests/live`, {
        signal: aborter.current.signal,
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setItems((data.items ?? []) as LiveRequest[]);
    } catch {
      // swallow — next tick reconciles
    }
  }, [venueId]);

  useEffect(() => {
    const poll = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      clearInterval(poll);
      aborter.current?.abort();
    };
  }, [refresh]);

  // Lazy-load staff list once for the handoff popover. Same endpoint
  // the floor app uses (id + name only — no email leakage).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff/mates")
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => { if (!cancelled) setStaffMates((d.items ?? []) as StaffMate[]); })
      .catch(() => { /* swallow */ });
    return () => { cancelled = true; };
  }, []);

  const now = Date.now();
  function bucketFor(it: LiveRequest): Exclude<Tab, "all"> {
    if (it.status === "RESOLVED") return "completed";
    if (it.status === "ESCALATED") return "delayed";
    if (it.status === "ACKNOWLEDGED") return "active";
    const age = now - new Date(it.createdAt).getTime();
    return age >= DELAYED_THRESHOLD_MS ? "delayed" : "pending";
  }

  // Distinct tables present in the current dataset — used to populate
  // the table-filter dropdown. Sorted by label for predictable order.
  const tableOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const it of items) {
      if (!seen.has(it.tableId)) seen.set(it.tableId, it.tableLabel);
    }
    return Array.from(seen, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true })
    );
  }, [items]);

  // Apply type + table filters before bucketing so the counts match
  // exactly what the list below shows.
  const filteredAll = items.filter(it => {
    if (typeFilter.size > 0 && !typeFilter.has(it.type)) return false;
    if (tableFilter.size > 0 && !tableFilter.has(it.tableId)) return false;
    return true;
  });

  const bucketCounts = { pending: 0, active: 0, delayed: 0, completed: 0 } as Record<Exclude<Tab, "all">, number>;
  for (const it of filteredAll) bucketCounts[bucketFor(it)] += 1;

  const visible = tab === "all"
    ? filteredAll
    : filteredAll.filter(it => bucketFor(it) === tab);

  // Sort: delayed first, then pending, then active, then completed.
  // Within a status, newer first for live work and most-recent-resolved
  // first for the completed tab.
  const STATUS_RANK: Record<LiveRequest["status"], number> = {
    ESCALATED: 0, PENDING: 1, ACKNOWLEDGED: 2, RESOLVED: 3,
  };
  const sorted = [...visible].sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;
    const aTime = a.status === "RESOLVED"
      ? new Date(a.resolvedAt ?? a.createdAt).getTime()
      : new Date(a.createdAt).getTime();
    const bTime = b.status === "RESOLVED"
      ? new Date(b.resolvedAt ?? b.createdAt).getTime()
      : new Date(b.createdAt).getTime();
    return a.status === "RESOLVED" ? bTime - aTime : aTime - bTime;
  });

  async function ack(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${id}/acknowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && !body.alreadyAcked) {
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
      setItems(prev =>
        prev.map(it =>
          it.id === id
            ? {
                ...it,
                status: (body.status as LiveRequest["status"]) ?? "ACKNOWLEDGED",
                acknowledgedAt: body.acknowledgedAt ?? new Date().toISOString(),
                acknowledgedBy: body.acknowledgedBy
                  ? { id: body.acknowledgedBy.id ?? "", name: body.acknowledgedBy.name }
                  : it.acknowledgedBy,
              }
            : it
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Acknowledge failed");
    } finally {
      setPendingId(null);
    }
  }

  async function resolve(id: string, action: string, note?: string) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      // Optimistic transition to RESOLVED so the row reflows into the
      // Completed tab. The next poll fills in resolvedAt authoritatively.
      setItems(prev =>
        prev.map(it =>
          it.id === id
            ? {
                ...it,
                status: "RESOLVED",
                resolvedAt: new Date().toISOString(),
                resolutionAction: action,
              }
            : it
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resolve failed");
    } finally {
      setPendingId(null);
    }
  }

  async function handoff(id: string, toStaffId: string) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${id}/handoff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStaffId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
      const dest = staffMates.find(s => s.id === toStaffId);
      if (dest) {
        setItems(prev =>
          prev.map(it =>
            it.id === id
              ? { ...it, acknowledgedBy: { id: dest.id, name: dest.name } }
              : it
          )
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Handoff failed");
    } finally {
      setPendingId(null);
    }
  }

  function toggleType(t: LiveRequest["type"]) {
    setTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  function toggleTable(tableId: string) {
    setTableFilter(prev => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId); else next.add(tableId);
      return next;
    });
  }

  function clearFilters() {
    setTypeFilter(new Set());
    setTableFilter(new Set());
  }

  const hasFilters = typeFilter.size > 0 || tableFilter.size > 0;

  return (
    <div className="space-y-5">
      {/* Tabs row — bigger than the floor app's chips, with counts. */}
      <div className="flex flex-wrap gap-2">
        {TAB_ORDER.map(t => {
          const count = t.id === "all"
            ? filteredAll.length
            : bucketCounts[t.id];
          const isDelayed = t.id === "delayed" && count > 0;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? (isDelayed
                      ? "border-coral bg-coral text-slate"
                      : "border-slate bg-slate text-oat")
                  : (isDelayed
                      ? "border-coral/40 bg-white text-coral hover:border-coral"
                      : "border-slate/15 bg-white text-slate/70 hover:text-slate"),
              ].join(" ")}
            >
              <span>{t.label}</span>
              <span className={[
                "ml-2 rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                isActive
                  ? "bg-white/10"
                  : "bg-slate/5 text-slate/55",
              ].join(" ")}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filter row — type chips + table multi-select. */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate/10 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Type</span>
          {TYPE_FILTERS.map(t => {
            const on = typeFilter.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleType(t.id)}
                className={[
                  "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors",
                  on
                    ? "border-slate bg-slate text-oat"
                    : "border-slate/15 text-slate/55 hover:text-slate",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-umber">
            <span>Table</span>
            <select
              multiple={false}
              value=""
              onChange={e => {
                if (e.target.value) toggleTable(e.target.value);
                e.currentTarget.value = "";
              }}
              className="rounded border border-slate/15 bg-white px-2 py-1 font-mono text-xs uppercase tracking-wider text-slate"
            >
              <option value="">+ Add table</option>
              {tableOptions
                .filter(t => !tableFilter.has(t.id))
                .map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
            </select>
          </label>
          {Array.from(tableFilter).map(id => {
            const opt = tableOptions.find(t => t.id === id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleTable(id)}
                className="inline-flex items-center gap-1 rounded-full border border-sea bg-sea/30 px-2.5 py-1 text-[11px] font-medium text-slate"
              >
                {opt?.label ?? id}
                <span aria-hidden className="text-slate/50">×</span>
              </button>
            );
          })}
          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] text-slate/55 underline-offset-2 hover:text-slate hover:underline"
            >
              clear
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-coral/40 bg-coral/5 px-4 py-2 text-xs text-coral">
          {error}
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState tab={tab} hasFilters={hasFilters} />
      ) : (
        <ul className="space-y-3">
          {sorted.map(it => (
            <RequestRow
              key={it.id}
              item={it}
              busy={pendingId === it.id}
              currentStaffId={staffId}
              staffMates={staffMates}
              onAck={() => ack(it.id)}
              onResolve={(action, note) => resolve(it.id, action, note)}
              onHandoff={(toStaffId) => handoff(it.id, toStaffId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ tab, hasFilters }: { tab: Tab; hasFilters: boolean }) {
  const message =
    hasFilters
      ? "No requests match those filters."
      : tab === "pending"
      ? "Nothing waiting. Service is keeping up."
      : tab === "active"
      ? "No active requests right now."
      : tab === "delayed"
      ? "Nothing delayed — staff is on top of things."
      : tab === "completed"
      ? "Nothing wrapped in the last hour yet."
      : "Floor is quiet.";
  return (
    <div className="rounded-2xl border border-slate/10 bg-white px-6 py-12 text-center">
      <p className="text-sm text-slate/55">{message}</p>
      <p className="mt-1 text-[11px] tracking-wide text-slate/35">
        Live view refreshes every few seconds.
      </p>
    </div>
  );
}

function RequestRow({
  item,
  busy,
  currentStaffId,
  staffMates,
  onAck,
  onResolve,
  onHandoff,
}: {
  item: LiveRequest;
  busy: boolean;
  currentStaffId: string;
  staffMates: StaffMate[];
  onAck: () => void;
  onResolve: (action: string, note?: string) => void;
  onHandoff: (toStaffId: string) => void;
}) {
  const seconds = useAge(item.createdAt);
  const isResolved = item.status === "RESOLVED";
  const isAcked = item.status === "ACKNOWLEDGED";
  const isEscalated = item.status === "ESCALATED";
  const ackedByMe = isAcked && item.acknowledgedBy?.id === currentStaffId;
  const delayed = !isResolved && (isEscalated || seconds > 90);
  const warn = !isResolved && !delayed && seconds > 60;
  const [showResolve, setShowResolve] = useState(false);
  const [showHandoff, setShowHandoff] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const others = staffMates.filter(s => s.id !== currentStaffId);

  return (
    <li
      className={[
        "rounded-2xl border bg-white p-5 transition-colors",
        isResolved
          ? "border-slate/10 opacity-70"
          : delayed
          ? "border-coral ring-1 ring-coral/30"
          : isAcked
          ? "border-chartreuse/40"
          : warn
          ? "border-sea/60"
          : "border-slate/10",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-medium text-slate">{item.tableLabel}</p>
            <span className="text-sm text-slate/55">· {REQUEST_LABEL[item.type]}</span>
            <StatusPill status={item.status} delayedByAge={!isResolved && seconds > 90 && item.status === "PENDING"} />
            {item.idCheckRequired && !isResolved ? (
              <span className="rounded-full bg-coral/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-coral">
                ⚠ check ID
              </span>
            ) : null}
            {isResolved && item.resolutionAction ? (
              <span className="rounded-full bg-slate/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate/60">
                {item.resolutionAction.toLowerCase().replace(/_/g, " ")}
              </span>
            ) : null}
          </div>
          {item.note ? (
            <p className="mt-2 border-l-2 border-slate/10 pl-3 text-sm italic leading-relaxed text-slate/70">
              &ldquo;{item.note}&rdquo;
            </p>
          ) : null}
          <p className="mt-3 text-[11px] tracking-wide text-slate/50">
            Opened {timeAgo(item.createdAt)}
            {item.acknowledgedBy ? (
              <span> · {item.acknowledgedBy.name} {isResolved ? "closed" : "on it"}</span>
            ) : null}
            {isResolved && item.resolvedAt ? (
              <span> · resolved {timeAgo(item.resolvedAt)}</span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={[
              "font-mono text-lg tabular-nums",
              isResolved ? "text-slate/40" : delayed ? "text-coral" : warn ? "text-slate" : "text-slate/55",
            ].join(" ")}
          >
            {formatAge(seconds)}
          </span>
          {!isResolved ? (
            <div className="flex flex-wrap justify-end gap-2">
              {item.status === "PENDING" || isEscalated ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onAck}
                  className="rounded-lg bg-chartreuse px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate hover:bg-chartreuse/90 disabled:opacity-60"
                >
                  Acknowledge
                </button>
              ) : null}
              {isAcked && ackedByMe && others.length > 0 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setShowHandoff(s => !s); setShowResolve(false); }}
                  className="rounded-lg border border-slate/15 px-3 py-2 text-xs font-medium text-slate/70 hover:text-slate disabled:opacity-60"
                >
                  Hand off
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => { setShowResolve(s => !s); setShowHandoff(false); }}
                className="rounded-lg border border-slate/15 px-3 py-2 text-xs font-medium text-slate/70 hover:text-slate disabled:opacity-60"
              >
                Resolve
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {showResolve && !isResolved ? (
        <div className="mt-4 rounded-xl border border-slate/10 bg-oat/40 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">How did this end?</p>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {RESOLVE_ACTIONS.map(a => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setShowResolve(false);
                    const note = resolveNote.trim() || undefined;
                    setResolveNote("");
                    onResolve(a.id, note);
                  }}
                  className="w-full rounded-lg border border-slate/15 bg-white px-3 py-2 text-xs font-medium text-slate hover:bg-slate hover:text-oat disabled:opacity-60"
                >
                  {a.label}
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-3 block">
            <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Note (optional)</span>
            <input
              type="text"
              value={resolveNote}
              onChange={e => setResolveNote(e.target.value.slice(0, 500))}
              placeholder="Anything worth recording…"
              className="mt-1 w-full rounded-lg border border-slate/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/35"
            />
          </label>
          <button
            type="button"
            onClick={() => { setShowResolve(false); setResolveNote(""); }}
            className="mt-3 text-[11px] text-slate/55 underline-offset-4 hover:text-slate hover:underline"
          >
            cancel
          </button>
        </div>
      ) : null}

      {showHandoff && isAcked && ackedByMe ? (
        <div className="mt-4 rounded-xl border border-slate/10 bg-oat/40 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Hand off to</p>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {others.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { onHandoff(s.id); setShowHandoff(false); }}
                  className="w-full rounded-lg border border-slate/15 bg-white px-3 py-2 text-sm text-slate hover:bg-slate hover:text-oat disabled:opacity-60"
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setShowHandoff(false)}
            className="mt-3 text-[11px] text-slate/55 underline-offset-4 hover:text-slate hover:underline"
          >
            cancel
          </button>
        </div>
      ) : null}
    </li>
  );
}

function StatusPill({
  status,
  delayedByAge,
}: { status: LiveRequest["status"]; delayedByAge: boolean }) {
  const cfg = (() => {
    if (status === "RESOLVED") return { label: "Resolved", className: "bg-slate/10 text-slate/60" };
    if (status === "ESCALATED") return { label: "Escalated", className: "bg-coral text-slate" };
    if (status === "ACKNOWLEDGED") return { label: "In progress", className: "bg-chartreuse text-slate" };
    return delayedByAge
      ? { label: "Delayed", className: "bg-coral/20 text-coral" }
      : { label: "Pending", className: "bg-sea/40 text-slate" };
  })();
  return (
    <span className={[
      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
      cfg.className,
    ].join(" ")}>
      {cfg.label}
    </span>
  );
}

function useAge(iso: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
}

function formatAge(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
