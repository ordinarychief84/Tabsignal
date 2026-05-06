"use client";

import { useState } from "react";

type Review = {
  id: string;
  rating: number;
  note: string | null;
  aiCategory: string | null;
  aiSuggestion: string | null;
  aiServerName: string | null;
  seenByMgr: boolean;
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

export function ReviewsList({ slug, initial }: { slug: string; initial: Review[] }) {
  const [items, setItems] = useState<Review[]>(initial);

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

  return (
    <ul className="space-y-3">
      {items.map(r => (
        <li
          key={r.id}
          className={[
            "rounded-2xl border bg-white p-5 transition-colors",
            r.seenByMgr ? "border-slate/10 opacity-70" : "border-coral/40",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
                {r.tableLabel} · {timeAgo(r.createdAt)}
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
            <button
              type="button"
              onClick={() => toggleSeen(r.id, !r.seenByMgr)}
              className="shrink-0 rounded-lg border border-slate/15 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate"
            >
              {r.seenByMgr ? "Unmark seen" : "Mark seen"}
            </button>
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
