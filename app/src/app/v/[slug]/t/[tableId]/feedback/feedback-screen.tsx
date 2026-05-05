"use client";

import { useState } from "react";

type Phase = "rating" | "note" | "google" | "thanks" | "submitting";

export function FeedbackScreen({ sessionId }: { sessionId: string }) {
  const [phase, setPhase] = useState<Phase>("rating");
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickRating(n: number) {
    setRating(n);
    if (n >= 4) {
      submit(n, null);
    } else {
      setPhase("note");
    }
  }

  async function submit(stars: number, noteText: string | null) {
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch(`/api/session/${sessionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: stars, note: noteText ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (data.reviewUrl) {
        setReviewUrl(data.reviewUrl);
        setPhase("google");
      } else {
        setPhase("thanks");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase(stars >= 4 ? "rating" : "note");
    }
  }

  if (phase === "submitting") {
    return <Centered>Sending…</Centered>;
  }

  if (phase === "google" && reviewUrl) {
    return (
      <Centered>
        <p className="text-3xl">🙌</p>
        <h2 className="mt-3 text-xl font-semibold text-slate-900">Thanks!</h2>
        <p className="mt-2 text-sm text-slate-600">Enjoyed your visit? A review helps us a lot.</p>
        <a
          href={reviewUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-block rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white"
        >
          Leave a Google review
        </a>
      </Centered>
    );
  }

  if (phase === "thanks") {
    return (
      <Centered>
        <p className="text-3xl">🙏</p>
        <h2 className="mt-3 text-xl font-semibold text-slate-900">Thanks for letting us know.</h2>
        <p className="mt-2 text-sm text-slate-600">A manager will follow up if needed.</p>
      </Centered>
    );
  }

  if (phase === "note") {
    return (
      <div>
        <button onClick={() => setPhase("rating")} className="mb-4 text-sm text-slate-500 underline">← back</button>
        <p className="text-base text-slate-700">Sorry to hear that.</p>
        <p className="mt-1 text-sm text-slate-500">What could we have done better?</p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={400}
          rows={4}
          placeholder="Optional — but more helpful than stars alone"
          className="mt-3 block w-full rounded-lg border border-slate-300 px-3 py-3 text-base outline-none focus:border-brand-accent"
        />
        <p className="mt-1 text-right text-xs text-slate-400">{note.length}/400</p>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <button
          onClick={() => submit(rating!, note.trim() || null)}
          className="mt-4 w-full rounded-xl bg-brand py-4 text-base font-semibold text-white"
        >
          Send to manager
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-base text-slate-700">How was your visit?</p>
      <div className="mt-6 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => pickRating(n)}
            className="text-4xl transition active:scale-90"
            aria-label={`${n} stars`}
          >
            {rating != null && n <= rating ? "★" : "☆"}
          </button>
        ))}
      </div>
      {error ? <p className="mt-4 text-center text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center py-10 text-center">{children}</div>;
}
