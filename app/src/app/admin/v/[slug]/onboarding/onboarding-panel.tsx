"use client";

import Link from "next/link";
import { useId, useState } from "react";

type Props = {
  slug: string;
  initialStripeReady: boolean;
  initialStripeAttached: boolean;
  initialHasInvitedStaff: boolean;
  initialHasTables: boolean;
  tableCount: number;
};

type StepState = "done" | "current" | "optional";

export function OnboardingPanel({
  slug,
  initialStripeReady,
  initialStripeAttached,
  initialHasInvitedStaff,
  initialHasTables,
  tableCount,
}: Props) {
  const [stripeReady] = useState(initialStripeReady);
  const [stripeAttached] = useState(initialStripeAttached);
  const [staffInvited, setStaffInvited] = useState(initialHasInvitedStaff);

  // Stripe gates everything: it must be done before bills work.
  const stripeStep: StepState = stripeReady ? "done" : "current";

  // Tables: done if pre-created (the signup flow always seeds them, so this
  // is the common path); otherwise it's the current/active step once Stripe
  // is in. Before Stripe is done, leave it visually inactive.
  const tablesStep: StepState = initialHasTables
    ? "done"
    : stripeReady
      ? "current"
      : "optional";

  // Staff: never required. Just done vs. optional.
  const staffStep: StepState = staffInvited ? "done" : "optional";

  // Linear gating: Stripe must be done before "Go to dashboard" lights up,
  // since the bill flow won't work otherwise. Staff is optional.
  const canFinish = stripeReady;
  const allDone = stripeReady && initialHasTables && staffInvited;

  return (
    <div>
      {/* Skip link only when Stripe is satisfied. New venues without Stripe
          MUST NOT be able to bypass — bills will fail. */}
      {stripeReady ? (
        <p className="-mt-2 mb-4 text-right">
          <Link
            href={`/admin/v/${slug}`}
            className="text-[11px] uppercase tracking-[0.16em] text-slate/55 underline-offset-4 hover:text-slate hover:underline"
          >
            Skip onboarding for now →
          </Link>
        </p>
      ) : null}

      <ol className="space-y-4">
        <Step
          n={1}
          state={stripeStep}
          title="Connect Stripe"
          body="Stripe Connect handles guest payments, payouts to your bank, and dram-shop-defensible records. ID verification takes 3–5 minutes; do it on a phone if you have your driver's license handy."
        >
          {stripeReady ? (
            <p className="flex items-center gap-2 text-sm text-slate/70">
              <span className="inline-flex items-center rounded-full bg-chartreuse/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate">
                Live
              </span>
              <span>Stripe is connected and your account can accept charges.</span>
            </p>
          ) : stripeAttached ? (
            <div className="space-y-2">
              <p className="text-sm text-slate/70">
                Stripe account attached, but charges aren&rsquo;t enabled yet —
                ID verification is still pending in Stripe. Reopen the dashboard
                to finish.
              </p>
              <ConnectStripeInline slug={slug} attached={stripeAttached} />
            </div>
          ) : (
            <ConnectStripeInline slug={slug} attached={stripeAttached} />
          )}
        </Step>

        <Step
          n={2}
          state={tablesStep}
          title="Print your QR tents"
          body={
            initialHasTables
              ? `Your venue has ${tableCount} table${tableCount === 1 ? "" : "s"} pre-created. Print the tents and place one per table.`
              : "Add tables from Settings. Each gets a printable QR tent for your tables."
          }
        >
          <Link
            href={`/admin/v/${slug}/qr-tents`}
            className="inline-block rounded-full border border-slate/20 px-4 py-1.5 text-sm text-slate hover:border-slate/40"
          >
            {initialHasTables ? "Open printer →" : "Add tables →"}
          </Link>
        </Step>

        <Step
          n={3}
          state={staffStep}
          title="Invite a staff member"
          body="They sign in by magic link from their phone — no app to install, no password to remember. You can do this later from Staff."
        >
          <InviteStaffInline slug={slug} onInvited={() => setStaffInvited(true)} done={staffInvited} />
        </Step>
      </ol>

      <div className="pt-4">
        {allDone ? (
          <p className="mb-2 flex justify-center">
            <span className="inline-flex items-center rounded-full bg-chartreuse/40 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate">
              All set
            </span>
          </p>
        ) : null}
        <Link
          href={`/admin/v/${slug}`}
          className={[
            "block w-full rounded-xl py-4 text-center text-base font-medium transition-colors",
            canFinish
              ? "bg-chartreuse text-slate hover:bg-chartreuse/90"
              : "bg-slate text-oat hover:bg-slate/90",
          ].join(" ")}
        >
          {canFinish ? "Go to dashboard →" : "Tour the dashboard →"}
        </Link>
        {!canFinish ? (
          <p className="mt-2 text-center text-[11px] text-slate/55">
            You can poke around the manager dashboard before connecting Stripe.
            Bills won&rsquo;t close yet — finish Stripe from <span className="underline">Settings</span> when you have your business docs handy.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Step({
  n,
  state,
  title,
  body,
  children,
}: {
  n: number;
  state: StepState;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  const colorRing =
    state === "done" ? "border-chartreuse bg-chartreuse text-slate"
    : state === "current" ? "border-slate bg-slate text-oat"
    : "border-slate/15 bg-white text-slate/40";
  const cardClass =
    state === "done" ? "border-chartreuse/40 bg-white"
    : state === "current" ? "border-slate/15 bg-white"
    : "border-slate/10 bg-white/60";
  return (
    <li
      className={`rounded-2xl border p-5 ${cardClass}`}
      aria-current={state === "current" ? "step" : undefined}
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-medium ${colorRing}`}
        >
          {state === "done" ? "✓" : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium">
            <span className="sr-only">Step {n}{state === "done" ? ", done. " : state === "current" ? ", in progress. " : ". "}</span>
            {title}
            {state === "optional" ? <span className="ml-2 text-[10px] uppercase tracking-wider text-slate/45">Optional</span> : null}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate/60">{body}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </li>
  );
}

function ConnectStripeInline({ slug, attached }: { slug: string; attached: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    // Always reset error before retrying so a second attempt isn't masked.
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/stripe/connect`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface Stripe's actual reason instead of a generic STRIPE_ERROR.
        throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
      }
      if (!data.url) throw new Error("no_url");
      window.location.href = data.url;
      // Note: leave loading=true while we redirect. If the navigation fails
      // the catch below resets it so the user can retry.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start onboarding");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="rounded-full bg-slate px-5 py-2 text-sm text-oat hover:bg-slate/90 disabled:opacity-60"
      >
        {loading ? "Opening Stripe…" : attached ? "Continue Stripe onboarding →" : "Connect Stripe →"}
      </button>
      {error ? (
        <div className="mt-3 flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-coral">Couldn&rsquo;t open Stripe: {error}.</p>
          <button
            type="button"
            onClick={start}
            disabled={loading}
            className="rounded-full border border-coral/40 px-3 py-1 text-xs text-coral hover:border-coral"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}

function InviteStaffInline({
  slug,
  onInvited,
  done,
}: {
  slug: string;
  onInvited: () => void;
  done: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const nameId = useId();
  const emailId = useId();
  const errorId = `${emailId}-err`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(fd.get("email") ?? "").trim().toLowerCase(),
          name: String(fd.get("name") ?? "").trim(),
          send: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface the API's specific error codes verbatim for clarity.
        // EMAIL_ALREADY_USED_AT_OTHER_VENUE (409) is the most common.
        const code = data?.error;
        const friendly =
          code === "EMAIL_ALREADY_USED_AT_OTHER_VENUE"
            ? "That email is already linked to another venue. Try a different one."
            : code === "INVALID_BODY"
              ? data?.detail ?? "Check the name and email and try again."
              : data?.detail ?? code ?? `HTTP ${res.status}`;
        throw new Error(friendly);
      }
      setSuccess(`Invitation sent to ${data.email}.`);
      onInvited();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (done && !open) {
    return (
      <p className="text-sm text-slate/65">
        At least one staff member is on the team.{" "}
        <Link href={`/admin/v/${slug}/staff`} className="text-umber underline-offset-4 hover:underline">
          Manage staff →
        </Link>
      </p>
    );
  }

  if (success) {
    return <p className="text-sm text-slate/70" role="status">{success}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-slate/20 px-4 py-1.5 text-sm text-slate hover:border-slate/40"
      >
        Invite a teammate
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-busy={submitting}>
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={nameId} className="block">
          <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Their name</span>
          <input
            id={nameId}
            name="name"
            required
            disabled={submitting}
            autoComplete="name"
            className="mt-1 block w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
            placeholder="Sarah"
          />
        </label>
        <label htmlFor={emailId} className="block">
          <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Their email</span>
          <input
            id={emailId}
            name="email"
            type="email"
            required
            disabled={submitting}
            autoComplete="email"
            spellCheck={false}
            autoCapitalize="none"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="mt-1 block w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
            placeholder="sarah@yourbar.com"
          />
        </label>
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-coral" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-slate px-4 py-1.5 text-sm text-oat disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send invite"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          className="text-[12px] text-slate/55 hover:text-slate disabled:opacity-50"
        >
          cancel
        </button>
      </div>
    </form>
  );
}
