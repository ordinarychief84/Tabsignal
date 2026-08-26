"use client";

import { useState } from "react";
import {
  RATING_CHOICES,
  POSITIVE_TAGS,
  NEGATIVE_TAGS,
  SERVER_TAG,
  isPositive,
} from "@/lib/feedback";

/**
 * Post-visit feedback.
 *
 * Four faces, then a branch. A guest who had a good time is asked what
 * stood out; a guest who didn't is asked what went wrong and — only then —
 * whether they'd like a manager. Both paths are short, and every step
 * after the rating is skippable, because a rating you actually get is
 * worth more than a form you don't.
 *
 * The manager question is asked, never assumed. A two-star rating does not
 * summon someone to the table on its own: plenty of people would rather
 * finish their evening and leave, and overriding that is how you teach
 * guests to stop rating honestly.
 *
 * Phone capture comes last, after the feedback is already saved, so
 * declining it costs nothing and the rating is never held hostage to it.
 */

type Phase = "rating" | "tags" | "recovery" | "contact" | "thanks";

export function FeedbackScreen({
  venueName,
  venueSlug,
  sessionId,
  sessionToken,
  serverName,
  consentText,
  phoneCaptureEnabled,
  marketingConsentEnabled,
  serviceRecoveryEnabled,
}: {
  venueName: string;
  venueSlug: string;
  sessionId: string;
  sessionToken: string;
  serverName: string | null;
  consentText: string;
  phoneCaptureEnabled: boolean;
  marketingConsentEnabled: boolean;
  serviceRecoveryEnabled: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("rating");
  const [rating, setRating] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const positive = rating !== null && isPositive(rating);
  const vocabulary = positive ? POSITIVE_TAGS : NEGATIVE_TAGS;

  function toggleTag(id: string) {
    setTags(curr => (curr.includes(id) ? curr.filter(t => t !== id) : [...curr, id]));
  }

  async function submit(managerRecovery: boolean) {
    if (rating === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${sessionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          sessionToken,
          note: note.trim() || undefined,
          tags,
          managerRecovery,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
      if (body?.reviewUrl) setReviewUrl(body.reviewUrl);
      setPhase(phoneCaptureEnabled ? "contact" : "thanks");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that");
      setBusy(false);
    }
  }

  /* ------------------------------ rating ----------------------------- */

  if (phase === "rating") {
    return (
      <Shell>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-plum">
          How was your experience tonight?
        </h1>
        <ul className="mt-8 space-y-2.5">
          {RATING_CHOICES.map(choice => (
            <li key={choice.value}>
              <button
                type="button"
                onClick={() => {
                  setRating(choice.value);
                  setTags([]);
                  setPhase("tags");
                }}
                className="flex min-h-[64px] w-full items-center gap-4 rounded-2xl border border-sandstone bg-surface px-5 text-left transition-all hover:border-saffron hover:bg-surface-hover active:scale-[0.99]"
              >
                <span aria-hidden className="text-[30px]">{choice.face}</span>
                <span className="text-[17px] font-medium text-plum">{choice.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </Shell>
    );
  }

  /* ------------------------------- tags ------------------------------ */

  if (phase === "tags") {
    return (
      <Shell>
        <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-plum">
          {positive ? "Glad to hear it!" : "We're sorry we missed the mark."}
        </h1>
        <p className="mt-2 text-[15px] text-graphite">
          {positive ? "What stood out?" : "What could we have done better?"}
        </p>

        <ul className="mt-5 flex flex-wrap gap-2">
          {vocabulary.map(tag => {
            const selected = tags.includes(tag.id);
            const label =
              tag.id === SERVER_TAG && serverName ? `${serverName} was amazing` : tag.label;
            return (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  aria-pressed={selected}
                  className={[
                    "min-h-[44px] rounded-full border px-4 text-[14px] transition-all active:scale-95",
                    selected
                      ? positive
                        // §14: positive selections read as Fresh Mint.
                        ? "border-mint bg-mint font-medium text-mint-deep"
                        // §15: negative uses Rose Clay softly — an
                        // indicator, never a punishment.
                        : "border-clay-soft bg-clay-soft font-medium text-clay-deep"
                      : "border-sandstone bg-surface text-graphite hover:border-line-strong",
                  ].join(" ")}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>

        <label className="mt-6 block">
          <span className="text-[12px] text-slate/55">Tell us more (optional)</span>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={400}
            rows={3}
            className="mt-1.5 w-full rounded-2xl border border-sandstone bg-surface p-3.5 text-[15px] text-plum outline-none focus:border-plum focus:ring-2 focus:ring-saffron"
          />
        </label>

        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-coral/10 px-3 py-2 text-[13px] text-coral">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            // A negative rating goes on to the manager question — but only
            // if the venue runs recovery. Otherwise it submits as-is.
            if (!positive && serviceRecoveryEnabled) setPhase("recovery");
            else void submit(false);
          }}
          className="mt-7 min-h-[56px] w-full rounded-2xl bg-saffron text-[16px] font-semibold text-plum transition-all hover:brightness-[0.97] disabled:opacity-60"
        >
          {busy ? "Sending…" : "Continue"}
        </button>
      </Shell>
    );
  }

  /* ----------------------------- recovery ---------------------------- */

  if (phase === "recovery") {
    return (
      <Shell>
        <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-plum">
          Would you like a manager to check in before you leave?
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-graphite">
          Only if you&rsquo;d like to — either answer is completely fine.
        </p>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-coral/10 px-3 py-2 text-[13px] text-coral">
            {error}
          </p>
        ) : null}

        <div className="mt-8 space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit(true)}
            className="min-h-[56px] w-full rounded-2xl bg-saffron text-[16px] font-semibold text-plum transition-all hover:brightness-[0.97] disabled:opacity-60"
          >
            {busy ? "Sending…" : "Yes, please"}
          </button>
          {/* Same visual weight as yes — declining must not feel discouraged. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit(false)}
            className="min-h-[56px] w-full rounded-2xl border border-sandstone bg-surface text-[16px] font-medium text-plum disabled:opacity-60"
          >
            No, thank you
          </button>
        </div>
      </Shell>
    );
  }

  /* ------------------------------ contact ---------------------------- */

  if (phase === "contact") {
    return (
      <ContactCapture
        venueName={venueName}
        venueSlug={venueSlug}
        sessionToken={sessionToken}
        consentText={consentText}
        marketingConsentEnabled={marketingConsentEnabled}
        onDone={() => setPhase("thanks")}
      />
    );
  }

  /* ------------------------------ thanks ----------------------------- */

  return (
    <Shell>
      <div className="text-center">
        <span
          aria-hidden
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mint text-3xl text-mint-deep"
        >
          ✓
        </span>
        <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-tight">
          Thanks for visiting {venueName}.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-graphite">
          We hope to see you again soon.
        </p>
        {reviewUrl ? (
          <a
            href={reviewUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-8 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-white text-[15px] font-medium text-slate ring-1 ring-umber-soft/40"
          >
            Leave a public review
          </a>
        ) : null}
      </div>
    </Shell>
  );
}

/* ------------------------- phone + consent ------------------------- */

function ContactCapture({
  venueName,
  venueSlug,
  sessionToken,
  consentText,
  marketingConsentEnabled,
  onDone,
}: {
  venueName: string;
  venueSlug: string;
  sessionToken: string;
  consentText: string;
  marketingConsentEnabled: boolean;
  onDone: () => void;
}) {
  const [phone, setPhone] = useState("");
  // Unticked. Always. Consent has to be something the guest did.
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy || !phone.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v/${venueSlug}/guest-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          phone: phone.trim(),
          marketingConsent: marketingConsentEnabled ? consent : false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.detail ?? "That doesn't look like a phone number.");
        setBusy(false);
        return;
      }
      onDone();
    } catch {
      setError("Couldn't save that. You can skip — nothing is lost.");
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-plum">
        Want to stay connected with {venueName}?
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-graphite">
        Get occasional updates about special events, new menus and offers.
      </p>

      <label className="mt-6 block">
        <span className="text-[12px] text-slate/55">Phone number</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="mt-1.5 min-h-[52px] w-full rounded-2xl border border-sandstone bg-surface px-4 text-[16px] text-plum outline-none focus:border-plum focus:ring-2 focus:ring-saffron"
        />
      </label>

      {marketingConsentEnabled ? (
        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={e => setConsent(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-umber-soft/60 accent-slate"
          />
          <span className="text-[12px] leading-relaxed text-slate/60">{consentText}</span>
        </label>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-coral/10 px-3 py-2 text-[13px] text-coral">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy || !phone.trim()}
        onClick={save}
        className="mt-6 min-h-[56px] w-full rounded-2xl bg-saffron text-[16px] font-semibold text-plum transition-all hover:brightness-[0.97] disabled:opacity-50"
      >
        {busy ? "Saving…" : "Keep me in the loop"}
      </button>

      {/* Full width, full height, plainly worded. Skipping is a real
          option, not a link hidden in small grey text. */}
      <button
        type="button"
        onClick={onDone}
        className="mt-3 min-h-[52px] w-full rounded-2xl border border-sandstone bg-surface text-[15px] font-medium text-plum"
      >
        No thanks
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-ivory px-6 text-plum">
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center py-12">
        {children}
      </div>
    </main>
  );
}
