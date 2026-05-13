"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";

type Review = {
  id: string;
  rating: number;
  note: string | null;
  aiCategory: string | null;
  aiSuggestion: string | null;
  aiServerName: string | null;
  seenByMgr: boolean;
  flagged: boolean;
  flaggedAt: string | null;
  createdAt: string;
  tableLabel: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  service_speed: "Service speed",
  drink_quality: "Drink quality",
  food: "Food",
  staff_attitude: "Staff attitude",
  wait_time: "Wait time",
  noise: "Noise",
  other: "Other",
};

// "All" maps to the max-days the API supports (90).
const RANGE_OPTIONS: { label: string; days: number }[] = [
  { label: "Last 7 days",  days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All",          days: 90 },
];

export function ReviewsList({
  slug,
  days,
  flaggedOnly,
  initial,
  initialCursor,
}: {
  slug: string;
  days: number;
  flaggedOnly: boolean;
  initial: Review[];
  initialCursor: string | null;
}) {
  const [items, setItems] = useState<Review[]>(initial);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function changeRange(nextDays: number) {
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    sp.set("days", String(nextDays));
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`);
      router.refresh();
    });
  }

  function toggleFlaggedFilter() {
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    if (flaggedOnly) sp.delete("flagged");
    else sp.set("flagged", "true");
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`);
      router.refresh();
    });
  }

  async function toggleSeen(id: string, next: boolean) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, seenByMgr: next } : i)));
    try {
      await fetch(`/api/admin/v/${slug}/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seen: next }),
      });
    } catch {
      setItems(prev => prev.map(i => (i.id === id ? { ...i, seenByMgr: !next } : i)));
    }
  }

  async function toggleFlag(id: string, next: boolean) {
    const prevState = items.find(i => i.id === id);
    setItems(prev =>
      prev.map(i => (i.id === id ? { ...i, flagged: next, flaggedAt: next ? new Date().toISOString() : null } : i))
    );
    try {
      const res = await fetch(`/api/admin/v/${slug}/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Roll back on failure.
      setItems(prev =>
        prev.map(i =>
          i.id === id
            ? { ...i, flagged: prevState?.flagged ?? !next, flaggedAt: prevState?.flaggedAt ?? null }
            : i
        )
      );
    }
  }

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        days: String(days),
        cursor,
        take: "50",
        ...(flaggedOnly ? { flagged: "true" } : {}),
      });
      const res = await fetch(`/api/admin/v/${slug}/reviews?${qs.toString()}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setItems(prev => [...prev, ...(body.items as Review[])]);
      setCursor(body.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-umber">
          <span>Window</span>
          <select
            value={days}
            onChange={e => changeRange(Number(e.target.value))}
            disabled={pending}
            className="rounded border border-slate/15 bg-white px-2 py-1 font-mono text-xs uppercase tracking-wider text-slate disabled:opacity-50"
          >
            {RANGE_OPTIONS.map(o => (
              <option key={o.label} value={o.days}>{o.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={toggleFlaggedFilter}
          disabled={pending}
          className={[
            "rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] transition-colors disabled:opacity-50",
            flaggedOnly
              ? "border-coral bg-coral text-slate"
              : "border-coral/40 text-coral hover:border-coral",
          ].join(" ")}
        >
          {flaggedOnly ? "Showing flagged" : "Flagged only"}
        </button>
      </div>

      <ul className="space-y-3">
        {items.map(r => (
          <li
            key={r.id}
            className={[
              "rounded-2xl border bg-white p-5 transition-colors",
              // Flagged wins visually — coral border + subtle coral tint
              // even if also marked seen. Seen-only dims the card.
              r.flagged
                ? "border-coral bg-coral/5"
                : r.seenByMgr
                ? "border-slate/10 opacity-70"
                : "border-coral/40",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
                  {r.tableLabel} · {timeAgo(r.createdAt)}
                  {r.flagged ? (
                    <span className="ml-2 rounded-full bg-coral px-2 py-0.5 text-[10px] font-semibold text-slate">
                      FLAGGED
                    </span>
                  ) : null}
                </p>
                <p className="mt-2 flex items-center gap-2">
                  <Stars rating={r.rating} />
                  {r.aiCategory ? (
                    <span className="rounded-full border border-slate/15 bg-slate/5 px-2 py-0.5 text-[11px] text-slate/70">
                      {CATEGORY_LABEL[r.aiCategory] ?? r.aiCategory}
                    </span>
                  ) : null}
                  {r.aiServerName ? (
                    <span className="text-[11px] text-slate/55">· {r.aiServerName}</span>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleSeen(r.id, !r.seenByMgr)}
                  className="rounded-lg border border-slate/15 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate"
                >
                  {r.seenByMgr ? "Unmark seen" : "Mark seen"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleFlag(r.id, !r.flagged)}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-[11px] font-medium",
                    r.flagged
                      ? "border-coral bg-coral text-slate"
                      : "border-coral/40 text-coral hover:border-coral",
                  ].join(" ")}
                >
                  {r.flagged ? "Unflag" : "Flag"}
                </button>
              </div>
            </div>

            {r.note ? (
              <p className="mt-4 border-l-2 border-coral/40 pl-4 text-sm italic leading-relaxed text-slate/80">
                &ldquo;{r.note}&rdquo;
              </p>
            ) : null}

            {r.aiSuggestion ? (
              <p className="mt-4 rounded-lg bg-sea/30 px-3 py-2 text-[12px] leading-relaxed text-slate/80">
                <span className="font-medium">Suggestion:</span> {r.aiSuggestion}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {error ? (
        <p className="rounded border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">{error}</p>
      ) : null}

      {cursor ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-full border border-slate/15 bg-white px-4 py-2 text-xs font-medium text-slate/70 hover:text-slate disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} stars`} className="text-base text-coral">
      {"★".repeat(rating)}
      <span className="text-slate/15">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
