"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ONBOARDING_STEPS,
  deriveOnboarding,
  type OnboardingProgress,
  type OnboardingStateShape,
} from "@/lib/onboarding";

/**
 * The launchpad: five persisted steps from fresh account to live floor.
 * Server derives initial status; every interaction PATCHes the venue so
 * progress survives device switches and browser resets.
 */

const VENUE_TYPES = [
  { id: "restaurant",       label: "Restaurant",  icon: "🍽️" },
  { id: "cafe",             label: "Café",        icon: "☕" },
  { id: "bar",              label: "Bar",         icon: "🍸" },
  { id: "lounge",           label: "Lounge",      icon: "🛋️" },
  { id: "nightclub",        label: "Nightclub",   icon: "🪩" },
  { id: "food-court",       label: "Food court",  icon: "🏬" },
  { id: "hotel-restaurant", label: "Hotel dining", icon: "🏨" },
] as const;

const BRAND_SWATCHES = [
  "#C8634F", "#8A6F2E", "#6F9586", "#4E6E8E", "#7B5C46", "#232130", "#A34E68", "#527A5C",
];

type Props = {
  slug: string;
  venueName: string;
  initialState: OnboardingStateShape;
  initialProgress: OnboardingProgress;
  venueType: string | null;
  brandColor: string | null;
  welcomeMessage: string | null;
  tableCount: number;
  staffCount: number;
  stripeChargesEnabled: boolean;
  stripeStarted: boolean;
  previewPath: string | null;
};

export function Launchpad(props: Props) {
  const [state, setState] = useState<OnboardingStateShape>(props.initialState);
  const [venueType, setVenueType] = useState<string | null>(props.venueType);
  const [brandColor, setBrandColor] = useState<string | null>(props.brandColor);
  const [welcome, setWelcome] = useState(props.welcomeMessage ?? "");
  const [staffCount, setStaffCount] = useState(props.staffCount);
  const [completedAt, setCompletedAt] = useState<string | null>(
    props.initialProgress.complete ? "done" : null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openStep, setOpenStep] = useState<number>(props.initialProgress.nextStep);

  const progress = useMemo(
    () =>
      deriveOnboarding({
        state,
        venueType,
        brandColor,
        staffCount,
        stripeChargesEnabled: props.stripeChargesEnabled,
        onboardingCompletedAt: completedAt ? new Date() : null,
      }),
    [state, venueType, brandColor, staffCount, props.stripeChargesEnabled, completedAt],
  );

  async function patchVenue(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/v/${props.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail ?? data?.error ?? `HTTP ${res.status}`);
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — try again.");
      return false;
    }
  }

  /** Persist a step check-off + advance the cursor. */
  async function completeStep(step: number, extra?: Partial<OnboardingStateShape>) {
    const nextState: OnboardingStateShape = {
      currentStep: Math.min(step + 1, 5),
      completedSteps: [...new Set([...state.completedSteps, step])].sort(),
      solo: extra?.solo ?? state.solo,
    };
    setState(nextState);
    setOpenStep(Math.min(step + 1, 5));
    await patchVenue({ onboardingState: nextState });
  }

  async function saveBrand() {
    setBusy("brand");
    setError(null);
    const ok = await patchVenue({
      venueType,
      ...(brandColor ? { brandColor } : {}),
      ...(welcome.trim() ? { guestWelcomeMessage: welcome.trim().slice(0, 240) } : {}),
    });
    if (ok) await completeStep(1);
    setBusy(null);
  }

  async function launch() {
    setBusy("launch");
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${props.slug}/onboarding/complete`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setCompletedAt(body.completedAt ?? "done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed — try again.");
    } finally {
      setBusy(null);
    }
  }

  const doneMap = new Map(progress.steps.map(s => [s.step, s.done]));

  if (progress.complete) {
    return <LaunchedScreen slug={props.slug} venueName={props.venueName} previewPath={props.previewPath} />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{props.venueName}</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Let&rsquo;s get you live.</h1>
        <p className="mt-2 text-sm text-slate/60">
          Five short steps. Your progress saves as you go — leave and pick up on any device.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate/10">
            <div
              className="h-full rounded-full bg-chartreuse transition-all duration-500"
              style={{ width: `${Math.max(progress.percent, 4)}%` }}
            />
          </div>
          <p className="w-12 text-right font-mono text-xs text-slate/60">{progress.percent}%</p>
        </div>
      </header>

      {error ? (
        <p className="mb-4 rounded-xl border border-coral/40 bg-coral/10 px-4 py-2.5 text-sm text-coral" role="alert">
          {error}
        </p>
      ) : null}

      <ol className="space-y-3">
        {/* Step 1 — Brand */}
        <StepCard
          step={1}
          title={ONBOARDING_STEPS[0].title}
          done={!!doneMap.get(1)}
          open={openStep === 1}
          onToggle={() => setOpenStep(openStep === 1 ? 0 : 1)}
          summary={venueType ? VENUE_TYPES.find(v => v.id === venueType)?.label ?? venueType : "What kind of place is this?"}
        >
          <p className="text-sm text-slate/60">
            This tunes the guest page wording and your analytics benchmarks.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {VENUE_TYPES.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVenueType(v.id)}
                className={[
                  "rounded-full border px-3.5 py-2 text-sm transition-colors",
                  venueType === v.id
                    ? "border-slate bg-slate text-oat"
                    : "border-slate/15 bg-white text-slate hover:border-slate/35",
                ].join(" ")}
              >
                <span aria-hidden className="mr-1.5">{v.icon}</span>
                {v.label}
              </button>
            ))}
          </div>
          <div className="mt-5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Brand color</p>
            <p className="mt-1 text-xs text-slate/55">Glows behind your guest page. Pick one that feels like the room.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {BRAND_SWATCHES.map(hex => (
                <button
                  key={hex}
                  type="button"
                  aria-label={`Brand color ${hex}`}
                  onClick={() => setBrandColor(hex)}
                  className={[
                    "h-9 w-9 rounded-full border-2 transition-transform",
                    brandColor === hex ? "scale-110 border-slate" : "border-transparent hover:scale-105",
                  ].join(" ")}
                  style={{ backgroundColor: hex }}
                />
              ))}
              <label className="ml-1 inline-flex cursor-pointer items-center gap-2 text-xs text-slate/60">
                <input
                  type="color"
                  value={brandColor ?? "#C8634F"}
                  onChange={e => setBrandColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded-full border border-slate/20 bg-white p-0.5"
                />
                Custom
              </label>
            </div>
          </div>
          <div className="mt-5">
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Welcome line (optional)</span>
              <input
                value={welcome}
                onChange={e => setWelcome(e.target.value)}
                maxLength={240}
                placeholder="Tap once. Your server will see it instantly."
                className="mt-2 block w-full rounded-xl border border-slate/15 bg-white px-4 py-3 text-sm text-slate placeholder-slate/35 outline-none focus:border-sea focus:ring-1 focus:ring-sea"
              />
            </label>
          </div>
          <StepActions>
            <button
              type="button"
              onClick={saveBrand}
              disabled={busy === "brand" || !venueType}
              className="rounded-xl bg-chartreuse px-5 py-2.5 text-sm font-medium text-slate disabled:opacity-50"
            >
              {busy === "brand" ? "Saving…" : "Save & continue"}
            </button>
            {!venueType ? <span className="text-xs text-slate/50">Pick a venue type to continue</span> : null}
          </StepActions>
        </StepCard>

        {/* Step 2 — Tables & QR */}
        <StepCard
          step={2}
          title={ONBOARDING_STEPS[1].title}
          done={!!doneMap.get(2)}
          open={openStep === 2}
          onToggle={() => setOpenStep(openStep === 2 ? 0 : 2)}
          summary={`${props.tableCount} table${props.tableCount === 1 ? "" : "s"} ready`}
        >
          <p className="text-sm text-slate/60">
            We created {props.tableCount} tables with unique QR codes. Print one tent per
            table — guests scan to reach you. Add or rename tables on the same page.
          </p>
          <StepActions>
            <a
              href={`/admin/v/${props.slug}/qr-tents`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-slate px-5 py-2.5 text-sm font-medium text-oat hover:bg-slate/90"
            >
              Open the print sheet ↗
            </a>
            <button
              type="button"
              onClick={() => completeStep(2)}
              className="rounded-xl border border-slate/15 bg-white px-5 py-2.5 text-sm font-medium text-slate hover:border-slate/35"
            >
              Done — they&rsquo;re on the tables
            </button>
          </StepActions>
        </StepCard>

        {/* Step 3 — Team */}
        <StepCard
          step={3}
          title={ONBOARDING_STEPS[2].title}
          done={!!doneMap.get(3)}
          open={openStep === 3}
          onToggle={() => setOpenStep(openStep === 3 ? 0 : 3)}
          summary={
            staffCount > 1
              ? `${staffCount - 1} teammate${staffCount === 2 ? "" : "s"} invited`
              : state.solo
                ? "Flying solo for now"
                : "Who's on the floor?"
          }
        >
          <p className="text-sm text-slate/60">
            Teammates get guest requests on their phone the moment they&rsquo;re sent.
            Invites are one link, valid 7 days — you can copy and text it from the People page.
          </p>
          <QuickInvite
            onInvited={() => {
              setStaffCount(c => c + 1);
              void completeStep(3);
            }}
            onError={setError}
          />
          <StepActions>
            <Link
              href={`/admin/v/${props.slug}/staff`}
              className="rounded-xl border border-slate/15 bg-white px-5 py-2.5 text-sm font-medium text-slate hover:border-slate/35"
            >
              Open the People page
            </Link>
            <button
              type="button"
              onClick={() => completeStep(3, { solo: true })}
              className="text-sm text-slate/55 underline-offset-4 hover:text-slate hover:underline"
            >
              It&rsquo;s just me for now
            </button>
          </StepActions>
        </StepCard>

        {/* Step 4 — Payments */}
        <StepCard
          step={4}
          title={ONBOARDING_STEPS[3].title}
          done={!!doneMap.get(4)}
          open={openStep === 4}
          onToggle={() => setOpenStep(openStep === 4 ? 0 : 4)}
          summary={
            props.stripeChargesEnabled
              ? "Stripe connected — payments on"
              : props.stripeStarted
                ? "Stripe started, not finished"
                : "Optional — guests can pay from their phone"
          }
        >
          <p className="text-sm text-slate/60">
            Connect Stripe and guests can view their tab, split it, tip, and pay
            without waiting for the card machine. Takes 3–5 minutes with ID + bank
            details handy. Requests and QR calls work fine without it.
          </p>
          <StepActions>
            <Link
              href={`/admin/v/${props.slug}/settings`}
              className="rounded-xl bg-slate px-5 py-2.5 text-sm font-medium text-oat hover:bg-slate/90"
            >
              {props.stripeStarted ? "Finish Stripe setup" : "Connect Stripe"}
            </Link>
            <button
              type="button"
              onClick={() => completeStep(4)}
              className="text-sm text-slate/55 underline-offset-4 hover:text-slate hover:underline"
            >
              Take payments later
            </button>
          </StepActions>
        </StepCard>

        {/* Step 5 — Launch */}
        <StepCard
          step={5}
          title={ONBOARDING_STEPS[4].title}
          done={false}
          open={openStep === 5}
          onToggle={() => setOpenStep(openStep === 5 ? 0 : 5)}
          summary="Flip the switch"
          accent
        >
          <p className="text-sm text-slate/60">
            {progress.percent === 100
              ? "Everything's ready. Launching marks your venue live and clears this checklist."
              : "You can launch now and finish the rest later — nothing here blocks guests from scanning."}
          </p>
          {props.previewPath ? (
            <p className="mt-3 text-sm">
              <a
                href={props.previewPath}
                target="_blank"
                rel="noreferrer"
                className="text-umber underline-offset-4 hover:underline"
              >
                Preview what guests will see ↗
              </a>
            </p>
          ) : null}
          <StepActions>
            <button
              type="button"
              onClick={launch}
              disabled={busy === "launch"}
              className="rounded-xl bg-chartreuse px-6 py-3 text-sm font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:translate-y-0 disabled:opacity-60"
            >
              {busy === "launch" ? "Launching…" : "Launch venue 🚀"}
            </button>
          </StepActions>
        </StepCard>
      </ol>

      <p className="mt-8 text-center text-xs text-slate/45">
        Skip around freely — every step stays editable from Settings after launch.
      </p>
    </div>
  );
}

function StepCard({
  step,
  title,
  summary,
  done,
  open,
  accent = false,
  onToggle,
  children,
}: {
  step: number;
  title: string;
  summary: string;
  done: boolean;
  open: boolean;
  accent?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <li
      className={[
        "overflow-hidden rounded-2xl border bg-white transition-colors",
        open ? "border-slate/25 shadow-soft" : "border-slate/10",
        accent && !done ? "border-chartreuse/60" : "",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors",
            done ? "bg-chartreuse text-slate" : "border border-slate/20 text-slate/50",
          ].join(" ")}
          aria-hidden
        >
          {done ? (
            <svg width="14" height="14" viewBox="0 0 12 12">
              <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            step
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium text-slate">{title}</span>
          <span className={["block truncate text-xs", done ? "text-sea" : "text-slate/50"].join(" ")}>
            {done ? "Done · " : ""}{summary}
          </span>
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden
          className={["shrink-0 text-slate/40 transition-transform", open ? "rotate-180" : ""].join(" ")}
        >
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? <div className="border-t border-slate/5 px-5 pb-5 pt-4">{children}</div> : null}
    </li>
  );
}

function StepActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex flex-wrap items-center gap-3">{children}</div>;
}

/** Minimal inline invite — one teammate, SERVER role. Full control lives
 *  on the People page; this exists so the launchpad never forces a detour. */
function QuickInvite({ onInvited, onError }: { onInvited: () => void; onError: (m: string | null) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role: "SERVER", send: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setSent(email);
      setName("");
      setEmail("");
      onInvited();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-[1fr,1.2fr,auto]">
      <input
        type="text"
        required
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Teammate's name"
        className="rounded-xl border border-slate/15 bg-white px-4 py-2.5 text-sm text-slate placeholder-slate/35 outline-none focus:border-sea focus:ring-1 focus:ring-sea"
      />
      <input
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="their@email.com"
        className="rounded-xl border border-slate/15 bg-white px-4 py-2.5 text-sm text-slate placeholder-slate/35 outline-none focus:border-sea focus:ring-1 focus:ring-sea"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-slate px-4 py-2.5 text-sm font-medium text-oat hover:bg-slate/90 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send invite"}
      </button>
      {sent ? (
        <p className="sm:col-span-3 text-xs text-sea" role="status">
          Invite sent to {sent}. They&rsquo;re listed on the People page.
        </p>
      ) : null}
    </form>
  );
}

function LaunchedScreen({ slug, venueName, previewPath }: { slug: string; venueName: string; previewPath: string | null }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-3xl border border-chartreuse/50 bg-chartreuse/15 p-10 text-center">
        <p aria-hidden className="text-4xl">🎉</p>
        <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-umber">Live</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight text-slate">{venueName} is on the floor.</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate/65">
          Guests who scan a table QR can reach your team instantly. Watch requests
          arrive on the dashboard — the first one always feels like magic.
        </p>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link
          href={`/admin/v/${slug}`}
          className="rounded-2xl bg-slate p-5 text-oat transition-colors hover:bg-slate-light"
        >
          <p className="text-sm font-medium">Live floor →</p>
          <p className="mt-1 text-xs text-oat/60">Requests as they land</p>
        </Link>
        <a
          href={`/admin/v/${slug}/qr-tents`}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl border border-slate/10 bg-white p-5 transition-colors hover:border-slate/30"
        >
          <p className="text-sm font-medium text-slate">Print more QRs ↗</p>
          <p className="mt-1 text-xs text-slate/55">Tents, replacements</p>
        </a>
        {previewPath ? (
          <a
            href={previewPath}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-slate/10 bg-white p-5 transition-colors hover:border-slate/30"
          >
            <p className="text-sm font-medium text-slate">Guest view ↗</p>
            <p className="mt-1 text-xs text-slate/55">See what they see</p>
          </a>
        ) : null}
      </div>
    </div>
  );
}
