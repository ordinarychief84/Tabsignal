"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  slug: string;
  initialStripeReady: boolean;
  initialStripeAttached: boolean;
  initialHasInvitedStaff: boolean;
  initialHasTables: boolean;
  tableCount: number;
};

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

  const stripeStep = stripeReady ? "done" : "current";
  const tablesStep = !initialHasTables ? "current" : stripeReady ? (staffInvited ? "done" : "done") : "done";
  // Linear gating: Stripe must be done before "Go to dashboard" lights up,
  // since the bill flow won't work otherwise. Staff is optional.
  const canFinish = stripeReady;

  return (
    <ol className="space-y-4">
      <Step
        n={1}
        state={stripeStep}
        title="Connect Stripe"
        body="Stripe Connect handles guest payments, payouts to your bank, and dram-shop-defensible records. ID verification takes 3–5 minutes; do it on a phone if you have your driver's license handy."
      >
        {stripeReady ? (
          <p className="text-sm text-slate/65">
            Stripe is connected and your account can accept charges. You&rsquo;re
            ready to take a bill.
          </p>
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
        state={staffInvited ? "done" : "optional"}
        title="Invite a staff member"
        body="They sign in by magic link from their phone — no app to install, no password to remember. You can do this later from Staff."
      >
        <InviteStaffInline slug={slug} onInvited={() => setStaffInvited(true)} done={staffInvited} />
      </Step>

      <div className="pt-4">
        <Link
          href={`/admin/v/${slug}`}
          className={[
            "block w-full rounded-xl py-4 text-center text-base font-medium transition-colors",
            canFinish
              ? "bg-chartreuse text-slate hover:bg-chartreuse/90"
              : "bg-slate/10 text-slate/45 pointer-events-none",
          ].join(" ")}
        >
          {canFinish ? "Go to dashboard →" : "Finish Stripe to continue"}
        </Link>
        {!canFinish ? (
          <p className="mt-2 text-center text-[11px] text-slate/45">
            Stripe is required because guest bills route through your account.
            Skip the rest, but not this.
          </p>
        ) : null}
      </div>
    </ol>
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
  state: "done" | "current" | "optional";
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
    <li className={`rounded-2xl border p-5 ${cardClass}`}>
      <div className="flex items-start gap-4">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-medium ${colorRing}`}>
          {state === "done" ? "✓" : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium">
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
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/stripe/connect`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (!data.url) throw new Error("no_url");
      window.location.href = data.url;
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
        <p className="mt-3 text-sm text-coral">Couldn&rsquo;t open Stripe: {error}.</p>
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
          email: String(fd.get("email") ?? "").trim(),
          name: String(fd.get("name") ?? "").trim(),
          send: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? data?.error ?? `HTTP ${res.status}`);
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
    return <p className="text-sm text-slate/70">{success}</p>;
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
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Their name</span>
          <input
            name="name"
            required
            className="mt-1 block w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
            placeholder="Sarah"
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Their email</span>
          <input
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
            placeholder="sarah@yourbar.com"
          />
        </label>
      </div>
      {error ? <p className="text-xs text-coral">{error}</p> : null}
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
          className="text-[12px] text-slate/55 hover:text-slate"
        >
          cancel
        </button>
      </div>
    </form>
  );
}
