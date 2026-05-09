"use client";

import { useState } from "react";

type Phase = "rating" | "note" | "google" | "thanks" | "submitting";

export function FeedbackScreen({
  slug,
  sessionId,
  sessionToken,
  showIdentify = false,
}: {
  slug: string;
  sessionId: string;
  sessionToken: string;
  showIdentify?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("rating");
  const [rating, setRating] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickRating(n: number) {
    setRating(n);
    if (n >= 4) submit(n, null);
    else setPhase("note");
  }

  async function submit(stars: number, noteText: string | null) {
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch(`/api/session/${sessionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: stars, note: noteText ?? undefined, sessionToken }),
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
    return (
      <Centered>
        <p className="text-sm text-slate/60">Sending…</p>
      </Centered>
    );
  }

  if (phase === "google" && reviewUrl) {
    return (
      <>
        <Centered>
          <p className="text-3xl">★</p>
          <h2 className="mt-3 text-2xl font-medium">Thanks!</h2>
          <p className="mt-2 max-w-xs text-sm text-slate/60">
            Glad you enjoyed it. Mind sharing on Google? Takes 30 seconds.
          </p>
          <a
            href={reviewUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-7 inline-block rounded-xl bg-chartreuse px-6 py-3 text-base font-medium text-slate"
          >
            Leave a Google review
          </a>
          <p className="mt-3 text-[11px] tracking-wide text-slate/40">
            We never email or message guests.
          </p>
        </Centered>
        {showIdentify ? <IdentifyCta slug={slug} /> : null}
      </>
    );
  }

  if (phase === "thanks") {
    return (
      <>
        <Centered>
          <p className="text-3xl">·</p>
          <h2 className="mt-3 text-2xl font-medium">Thanks for letting us know.</h2>
          <p className="mt-2 max-w-xs text-sm text-slate/60">
            A manager will see your note and follow up if needed.
          </p>
        </Centered>
        {showIdentify ? <IdentifyCta slug={slug} /> : null}
      </>
    );
  }

  if (phase === "note") {
    return (
      <div>
        <button
          onClick={() => setPhase("rating")}
          className="text-sm text-slate/50 underline-offset-4 hover:text-slate hover:underline"
        >
          ← back
        </button>
        <p className="mt-6 text-base text-slate">Sorry to hear that.</p>
        <p className="mt-1 text-sm text-slate/60">
          What could we have done better? The manager sees this — guests don&rsquo;t.
        </p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={400}
          rows={5}
          placeholder="Optional, but more helpful than stars alone."
          className="mt-4 block w-full rounded-2xl border border-slate/15 bg-white px-4 py-3 text-base text-slate placeholder-slate/35 outline-none focus:border-sea focus:ring-1 focus:ring-sea"
        />
        <p className="mt-1 text-right font-mono text-[10px] text-slate/40">{note.length}/400</p>
        {error ? (
          <p className="mt-3 rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">{error}</p>
        ) : null}
        <button
          onClick={() => submit(rating!, note.trim() || null)}
          className="mt-5 w-full rounded-xl bg-chartreuse py-4 text-base font-medium text-slate"
        >
          Send privately to the manager
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-base text-slate">How was your visit?</p>
      <div
        className="mt-8 flex justify-between"
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map(n => {
          const filled = (hover ?? rating ?? 0) >= n;
          return (
            <button
              key={n}
              onClick={() => pickRating(n)}
              onMouseEnter={() => setHover(n)}
              className="text-5xl text-slate transition-transform active:scale-90"
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
            >
              <span className={filled ? "text-slate" : "text-slate/20"}>{filled ? "★" : "☆"}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-6 text-center text-[11px] tracking-wide text-slate/40">
        4–5 stars: leave a Google review. 1–3 stars: tell the manager privately.
      </p>
      {error ? (
        <p className="mt-4 rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">{error}</p>
      ) : null}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      {children}
    </div>
  );
}

type IdentifyPhase = "cta" | "phone" | "code" | "saving" | "saved" | "skipped";

function IdentifyCta({ slug }: { slug: string }) {
  const [phase, setPhase] = useState<IdentifyPhase>("cta");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!phone.trim()) return;
    setPhase("saving");
    setError(null);
    try {
      const res = await fetch(`/api/v/${slug}/profile/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setPhase("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t send code");
      setPhase("phone");
    }
  }

  async function verify() {
    if (!/^\d{6}$/.test(code)) {
      setError("6-digit code only.");
      return;
    }
    setPhase("saving");
    setError(null);
    try {
      const res = await fetch(`/api/v/${slug}/profile/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          code,
          displayName: displayName.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setPhase("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify");
      setPhase("code");
    }
  }

  if (phase === "skipped") return null;

  if (phase === "saved") {
    return (
      <div className="mt-6 rounded-2xl border border-chartreuse/40 bg-chartreuse/15 px-5 py-4 text-sm text-slate">
        Saved. Next time you scan, your bartender will know your usual.
      </div>
    );
  }

  if (phase === "cta") {
    return (
      <div className="mt-8 rounded-2xl border border-slate/15 bg-white px-5 py-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Become a regular</p>
        <p className="mt-1 text-sm text-slate">
          Save your preferences and the bartender will know your usual next time.
          Just a phone number — no app, no spam.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setPhase("phone")}
            className="rounded-full bg-slate px-4 py-1.5 text-sm text-oat hover:bg-slate/90"
          >
            Yes, save
          </button>
          <button
            onClick={() => setPhase("skipped")}
            className="rounded-full border border-slate/15 px-4 py-1.5 text-sm text-slate/60 hover:border-slate/40"
          >
            No thanks
          </button>
        </div>
      </div>
    );
  }

  if (phase === "phone" || phase === "saving") {
    return (
      <div className="mt-8 rounded-2xl border border-slate/15 bg-white px-5 py-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Phone</p>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="(555) 555-5555"
          className="mt-2 block w-full rounded border border-slate/15 bg-white px-3 py-2 text-base"
          autoFocus
        />
        <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-umber">Name (optional)</p>
        <input
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="What should staff call you?"
          className="mt-2 block w-full rounded border border-slate/15 bg-white px-3 py-2 text-base"
        />
        {error ? <p className="mt-3 text-xs text-coral">{error}</p> : null}
        <div className="mt-4 flex justify-between">
          <button
            onClick={() => setPhase("skipped")}
            className="text-[12px] text-slate/55 hover:text-slate"
          >
            cancel
          </button>
          <button
            onClick={sendCode}
            disabled={phase === "saving" || !phone.trim()}
            className="rounded-full bg-slate px-4 py-1.5 text-sm text-oat hover:bg-slate/90 disabled:opacity-50"
          >
            {phase === "saving" ? "Sending…" : "Send 6-digit code"}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "code") {
    return (
      <div className="mt-8 rounded-2xl border border-slate/15 bg-white px-5 py-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Enter code</p>
        <p className="mt-1 text-xs text-slate/55">
          Sent to {phone}. Expires in 5 minutes.
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={e => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          placeholder="123456"
          className="mt-3 block w-full rounded border border-slate/15 bg-white px-3 py-2 text-center font-mono text-2xl tracking-widest"
          autoFocus
        />
        {error ? <p className="mt-3 text-xs text-coral">{error}</p> : null}
        <div className="mt-4 flex justify-between">
          <button
            onClick={() => { setPhase("phone"); setCode(""); setError(null); }}
            className="text-[12px] text-slate/55 hover:text-slate"
          >
            ← back
          </button>
          <button
            onClick={verify}
            disabled={code.length !== 6}
            className="rounded-full bg-slate px-4 py-1.5 text-sm text-oat hover:bg-slate/90 disabled:opacity-50"
          >
            Verify
          </button>
        </div>
      </div>
    );
  }

  return null;
}
