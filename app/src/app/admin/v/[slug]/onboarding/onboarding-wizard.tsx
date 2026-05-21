"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  STEPS,
  TOTAL_STEPS,
  pickInitialStep,
  progressPercent,
  recordStepComplete,
  type OnboardingState,
} from "@/lib/onboarding/wizard-state";

type Props = {
  slug: string;
  venueName: string;
  zipCode: string | null;
  timezone: string;
  brandColor: string | null;
  logoUrl: string | null;
  welcomeMessage: string | null;
  venueType: string | null;
  tableCount: number;
  staffCount: number;
  stripeReady: boolean;
  stripeAttached: boolean;
  state: OnboardingState;
};

const VENUE_TYPES = [
  { id: "restaurant", label: "Restaurant" },
  { id: "cafe", label: "Café" },
  { id: "bar", label: "Bar" },
  { id: "lounge", label: "Lounge" },
  { id: "nightclub", label: "Nightclub" },
  { id: "food-court", label: "Food court" },
  { id: "hotel-restaurant", label: "Hotel restaurant" },
] as const;

type VenueTypeId = (typeof VENUE_TYPES)[number]["id"];

/* ---------------------------------------------------------------------- */
/* Wizard shell                                                           */
/* ---------------------------------------------------------------------- */

export function OnboardingWizard(props: Props) {
  // initialStep comes from the pure helper that reads server-persisted
  // state first, then falls back to inferring from venue completeness.
  const initialStep = useMemo(
    () =>
      pickInitialStep({
        zipCode: props.zipCode,
        brandColor: props.brandColor,
        logoUrl: props.logoUrl,
        welcomeMessage: props.welcomeMessage,
        venueType: props.venueType,
        tableCount: props.tableCount,
        staffCount: props.staffCount,
        solo: props.state.solo,
        state: props.state,
        onboardingCompletedAt: null,
      }),
    [props],
  );
  const [step, setStep] = useState<number>(initialStep);
  const [serverState, setServerState] = useState<OnboardingState>(props.state);
  const [form, setForm] = useState<WizardForm>(() => initialForm(props));
  const [savingExit, setSavingExit] = useState(false);

  // PATCH the server state JSON whenever a step is marked complete.
  // Local state is the canonical truth between server roundtrips; the
  // server is one writer behind by at most a single step transition.
  const persistState = useRef(async (next: OnboardingState) => {
    try {
      await fetch(`/api/admin/v/${props.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingState: next }),
      });
    } catch {
      /* swallow — next save attempt will reconcile */
    }
  });

  function goTo(target: number) {
    const next = Math.min(Math.max(1, target), TOTAL_STEPS);
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function advance(fromStep: number) {
    const newState = recordStepComplete(serverState, fromStep);
    setServerState(newState);
    void persistState.current(newState);
    goTo(fromStep + 1);
  }

  async function saveAndExit() {
    if (savingExit) return;
    setSavingExit(true);
    // Keep the cursor on the current step so they land here on return.
    const next = { ...serverState, currentStep: step };
    await persistState.current(next);
    if (typeof window !== "undefined") {
      window.location.href = `/admin/v/${props.slug}`;
    }
  }

  // Allow jumping back to any *completed* step or the current cursor
  // by clicking the progress dots. Disallow jumping forward into
  // unvisited territory — those steps may have unmet requirements.
  function canJumpTo(target: number): boolean {
    if (target === step) return true;
    if (serverState.completedSteps.includes(target)) return true;
    if (target < step) return true;
    return false;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-6 sm:px-6 sm:pt-10 sm:pb-16">
      <ProgressIndicator
        current={step}
        completedSteps={serverState.completedSteps}
        onJump={target => canJumpTo(target) && goTo(target)}
      />

      <div className="mt-6 rounded-3xl border border-slate/10 bg-white p-5 shadow-card sm:mt-7 sm:p-8">
        <div key={step} className="onboarding-step-enter">
          {step === 1 && (
            <Step1Venue
              slug={props.slug}
              form={form}
              setForm={setForm}
              onContinue={() => advance(1)}
            />
          )}
          {step === 2 && (
            <Step2Brand
              slug={props.slug}
              form={form}
              setForm={setForm}
              onBack={() => goTo(1)}
              onContinue={() => advance(2)}
            />
          )}
          {step === 3 && (
            <Step3Tables
              slug={props.slug}
              form={form}
              setForm={setForm}
              initialCount={props.tableCount}
              onBack={() => goTo(2)}
              onContinue={() => advance(3)}
            />
          )}
          {step === 4 && (
            <Step4Team
              solo={serverState.solo}
              staffCount={props.staffCount}
              onBack={() => goTo(3)}
              onContinue={() => advance(4)}
              onChooseSolo={() => {
                // Mark complete with solo:true in a SINGLE state dispatch
                // so the follow-up advance() can't read a stale closure
                // and clobber the solo flag back to false.
                const next = recordStepComplete(
                  { ...serverState, solo: true },
                  4,
                );
                setServerState(next);
                void persistState.current(next);
                goTo(5);
              }}
            />
          )}
          {step === 5 && (
            <Step5Launch
              slug={props.slug}
              venueName={form.venueName}
              tableCount={form.tableCount}
              staffCount={props.staffCount}
              solo={serverState.solo}
              stripeReady={props.stripeReady}
              stripeAttached={props.stripeAttached}
              onBack={() => goTo(4)}
            />
          )}
        </div>
      </div>

      {/* Sticky bottom bar on mobile — keeps the primary action thumb-
       *  reachable on phones where the form scrolls past the fold. On
       *  desktop the action sits inline at the bottom of the card so
       *  the bar collapses to a slim "Save & finish later" anchor. */}
      <MobileExitBar onSaveExit={saveAndExit} saving={savingExit} step={step} />

      <style jsx global>{`
        .onboarding-step-enter {
          animation: stepFade 200ms ease-out;
        }
        @keyframes stepFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .onboarding-step-enter { animation: none; }
        }
      `}</style>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Form state                                                             */
/* ---------------------------------------------------------------------- */

type WizardForm = {
  venueName: string;
  venueType: VenueTypeId;
  zipCode: string;
  tableCount: number;
  brandColor: string;
  welcomeMessage: string;
};

function initialForm(p: Props): WizardForm {
  return {
    venueName: p.venueName,
    venueType: (p.venueType as VenueTypeId) ?? "restaurant",
    zipCode: p.zipCode && p.zipCode !== "00000" ? p.zipCode : "",
    tableCount: p.tableCount || 6,
    brandColor: p.brandColor ?? "#232130",
    welcomeMessage: p.welcomeMessage ?? "",
  };
}

/* ---------------------------------------------------------------------- */
/* Progress indicator                                                     */
/* ---------------------------------------------------------------------- */

function ProgressIndicator({
  current,
  completedSteps,
  onJump,
}: {
  current: number;
  completedSteps: number[];
  onJump: (target: number) => void;
}) {
  const pct = Math.round((completedSteps.length / TOTAL_STEPS) * 100);
  return (
    <div>
      <div className="flex items-end justify-between">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
          Set up · {pct}%
        </p>
        <p className="text-[11px] text-slate/55">
          Step {current} of {TOTAL_STEPS}
        </p>
      </div>
      <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate/10">
        <div
          className="h-full rounded-full bg-chartreuse transition-all duration-500 ease-out"
          style={{ width: `${(current / TOTAL_STEPS) * 100}%` }}
        />
      </div>
      <ol className="mt-3 flex items-center justify-between gap-1 text-[10px] font-medium uppercase tracking-[0.14em] sm:text-[11px]">
        {STEPS.map(s => {
          const done = completedSteps.includes(s.n);
          const active = current === s.n;
          const jumpable = done || s.n < current || s.n === current;
          return (
            <li key={s.key} className="flex flex-1 items-center justify-start">
              <button
                type="button"
                onClick={() => onJump(s.n)}
                disabled={!jumpable}
                aria-current={active ? "step" : undefined}
                className={[
                  "flex items-center gap-1.5 rounded-md py-1 pr-2 transition-colors",
                  jumpable ? "hover:text-slate" : "cursor-default",
                  active ? "text-slate" : done ? "text-umber" : "text-slate/45",
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className={[
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                    done ? "bg-chartreuse text-slate" : active ? "bg-slate text-oat" : "bg-slate/10 text-slate/45",
                  ].join(" ")}
                >
                  {done ? "✓" : s.n}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Sticky mobile exit bar                                                 */
/* ---------------------------------------------------------------------- */

function MobileExitBar({
  onSaveExit,
  saving,
  step,
}: {
  onSaveExit: () => void;
  saving: boolean;
  step: number;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate/10 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 sm:justify-end">
        <p className="hidden text-[11px] text-slate/55 sm:inline">
          We auto-save your progress.
        </p>
        <button
          type="button"
          onClick={onSaveExit}
          disabled={saving || step === TOTAL_STEPS}
          className="text-[12px] font-medium text-umber underline-offset-4 hover:underline disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save & finish later"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Step 1 — Venue basics                                                  */
/* ---------------------------------------------------------------------- */

function Step1Venue({
  slug,
  form,
  setForm,
  onContinue,
}: {
  slug: string;
  form: WizardForm;
  setForm: (next: WizardForm) => void;
  onContinue: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid =
    form.venueName.trim().length > 0 && /^\d{5}(-\d{4})?$/.test(form.zipCode);

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.venueName.trim(),
          zipCode: form.zipCode,
          venueType: form.venueType,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || body?.error || `HTTP ${res.status}`);
      }
      onContinue();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <StepHeader
        eyebrow="Step 1 of 5"
        title="Tell us about your venue"
        sub="The basics so we can label your guest-facing pages. Anything here you can change later from settings."
      />

      <div className="space-y-4">
        <Input
          id="venueName"
          label="Venue name"
          value={form.venueName}
          onChange={v => setForm({ ...form, venueName: v })}
          autoComplete="organization"
          placeholder="Luna Lounge"
        />

        <div>
          <p className="block text-[12px] font-medium text-slate/70">Venue type</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {VENUE_TYPES.map(vt => {
              const selected = form.venueType === vt.id;
              return (
                <button
                  key={vt.id}
                  type="button"
                  onClick={() => setForm({ ...form, venueType: vt.id })}
                  className={[
                    "rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors",
                    selected
                      ? "border-slate bg-slate text-oat"
                      : "border-slate/15 bg-white text-slate/75 hover:border-slate/30",
                  ].join(" ")}
                >
                  {vt.label}
                </button>
              );
            })}
          </div>
        </div>

        <Input
          id="zipCode"
          label="ZIP / postal code"
          value={form.zipCode}
          onChange={v => setForm({ ...form, zipCode: v })}
          autoComplete="postal-code"
          inputMode="numeric"
          placeholder="77002"
          hint="5 digits, or ZIP+4. Used for tax + reporting."
        />
      </div>

      {err ? <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">{err}</p> : null}

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
        <ContinueBtn disabled={!valid || saving} onClick={save}>
          {saving ? "Saving…" : "Continue"}
        </ContinueBtn>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Step 2 — Brand                                                         */
/* ---------------------------------------------------------------------- */

const COLOR_SWATCHES = [
  "#232130", "#7B5C46", "#6F9586", "#C8634F", "#8A6F2E",
  "#4F6C9C", "#8C5A8F", "#3C6E47", "#A04848",
];

const WELCOME_DEFAULTS: Record<VenueTypeId, (venueName: string) => string> = {
  restaurant: name => `Welcome to ${name}. Tap any option below — we'll take it from here.`,
  cafe: () => `Welcome in. Order, ask for help, or pay whenever you're ready.`,
  bar: name => `Cheers from ${name}. Order, call your bartender, settle up — your call.`,
  lounge: name => `Welcome to ${name}. We'll be over the moment you tap.`,
  nightclub: name => `You're at ${name}. Order from the table, pay when you're done.`,
  "food-court": () => `Welcome. Order from your seat — we'll bring it over when it's ready.`,
  "hotel-restaurant": name => `Welcome to ${name}. Order, pay, or call us anytime during your stay.`,
};

function Step2Brand({
  slug,
  form,
  setForm,
  onBack,
  onContinue,
}: {
  slug: string;
  form: WizardForm;
  setForm: (next: WizardForm) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const suggestedWelcome = useMemo(() => {
    if (form.welcomeMessage.trim()) return form.welcomeMessage;
    return WELCOME_DEFAULTS[form.venueType](form.venueName);
  }, [form.venueType, form.venueName, form.welcomeMessage]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandColor: form.brandColor,
          guestWelcomeMessage: form.welcomeMessage.trim() || suggestedWelcome,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || body?.error || `HTTP ${res.status}`);
      }
      onContinue();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const previewWelcome = (form.welcomeMessage || suggestedWelcome).slice(0, 240);

  return (
    <div className="space-y-6">
      <StepHeader
        eyebrow="Step 2 of 5"
        title="Customize your guest experience"
        sub="Brand color and welcome message land on every guest's QR table page. Logo upload is optional from settings later."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <div>
            <p className="block text-[12px] font-medium text-slate/70">Brand color</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {COLOR_SWATCHES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, brandColor: c })}
                  aria-label={`Brand color ${c}`}
                  className={[
                    "h-8 w-8 rounded-full ring-offset-2 transition",
                    form.brandColor === c ? "ring-2 ring-slate" : "ring-1 ring-slate/10 hover:ring-slate/30",
                  ].join(" ")}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label className="ml-1 inline-flex items-center gap-2 rounded-full border border-slate/15 bg-white px-3 py-2 text-[12px] text-slate/70">
                Custom
                <input
                  type="color"
                  value={form.brandColor}
                  onChange={e => setForm({ ...form, brandColor: e.target.value })}
                  className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0"
                />
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="welcome" className="block text-[12px] font-medium text-slate/70">
              Welcome message <span className="text-slate/45">(shown on the table page)</span>
            </label>
            <textarea
              id="welcome"
              value={form.welcomeMessage}
              onChange={e => setForm({ ...form, welcomeMessage: e.target.value })}
              placeholder={suggestedWelcome}
              maxLength={240}
              rows={3}
              className="mt-1.5 block w-full rounded-xl border border-slate/15 bg-white px-3.5 py-2.5 text-[14px] text-slate placeholder-slate/35 outline-none transition-shadow focus:border-slate/40 focus:ring-4 focus:ring-slate/[0.08]"
            />
            <p className="mt-1.5 text-[11px] text-slate/55">
              {form.welcomeMessage.length}/240 — leave blank for our suggestion.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-oat p-4 ring-1 ring-slate/5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-umber">Live preview</p>
          <div className="mt-3 rounded-2xl bg-white p-4 shadow-soft">
            <div
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: form.brandColor }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
              </svg>
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-umber">Table 12</p>
            <p className="mt-1 text-[15px] font-semibold leading-tight text-slate">{form.venueName}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-slate/65">{previewWelcome}</p>
            <div className="mt-3 space-y-1.5">
              {["Call waiter", "View menu", "Pay bill"].map(s => (
                <div
                  key={s}
                  className="rounded-lg px-2.5 py-2 text-[11px] font-medium text-slate"
                  style={{ backgroundColor: form.brandColor + "18" }}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {err ? <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">{err}</p> : null}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <BackBtn onClick={onBack}>Back</BackBtn>
        <ContinueBtn disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Continue"}
        </ContinueBtn>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Step 3 — Tables                                                        */
/* ---------------------------------------------------------------------- */

function Step3Tables({
  slug,
  form,
  setForm,
  initialCount,
  onBack,
  onContinue,
}: {
  slug: string;
  form: WizardForm;
  setForm: (next: WizardForm) => void;
  initialCount: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The /tables POST endpoint is add-only — the bulk-create body
  // schema rejects count < 1. Removing tables lives on the QR-tents
  // page where the destructive-delete confirmation belongs. The
  // input below lets the user PREVIEW a smaller floor, but Continue
  // only POSTs when delta > 0; a smaller count is a no-op + pointer
  // to QR tents in the helper copy.
  const delta = form.tableCount - initialCount;
  const wantsFewer = delta < 0;

  async function save() {
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      if (delta > 0) {
        const res = await fetch(`/api/admin/v/${slug}/tables`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: delta }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.detail || body?.error || `HTTP ${res.status}`);
        }
      }
      onContinue();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <StepHeader
        eyebrow="Step 3 of 5"
        title="Create your tables"
        sub={`We already generated ${initialCount} table${initialCount === 1 ? "" : "s"} for you. Adjust the count to match your floor.`}
      />

      <div className="rounded-2xl bg-oat p-4 ring-1 ring-slate/5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-umber">Number of tables</p>
          <p className="font-mono text-[12px] tabular-nums text-slate/55">
            {initialCount} → {form.tableCount}
          </p>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setForm({ ...form, tableCount: Math.max(1, form.tableCount - 1) })}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate/15 bg-white text-slate hover:border-slate/30"
            aria-label="Decrease tables"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            max={120}
            value={form.tableCount}
            onChange={e => {
              const v = Math.max(1, Math.min(120, Number(e.target.value) || 1));
              setForm({ ...form, tableCount: v });
            }}
            className="w-20 rounded-xl border border-slate/15 bg-white px-3 py-2 text-center text-[16px] tabular-nums text-slate outline-none focus:border-slate/40 focus:ring-4 focus:ring-slate/[0.08]"
          />
          <button
            type="button"
            onClick={() => setForm({ ...form, tableCount: Math.min(120, form.tableCount + 1) })}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate/15 bg-white text-slate hover:border-slate/30"
            aria-label="Increase tables"
          >
            +
          </button>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-slate/60">
          {wantsFewer
            ? `Want fewer than ${initialCount}? Continue with what's here, then remove tables from QR tents after launch — that's where the destructive confirmation lives.`
            : delta > 0
            ? `We'll add ${delta} new table${delta === 1 ? "" : "s"} labelled in sequence.`
            : `No changes — your existing ${initialCount} tables are good to go.`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: Math.min(form.tableCount, 12) }, (_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate/10 bg-white p-3 text-center"
          >
            <p className="text-[10px] uppercase tracking-wider text-slate/45">Table</p>
            <p className="text-base font-semibold text-slate">{i + 1}</p>
          </div>
        ))}
        {form.tableCount > 12 ? (
          <div className="col-span-3 rounded-xl border border-dashed border-slate/15 bg-oat p-3 text-center text-[12px] text-slate/55 sm:col-span-4">
            + {form.tableCount - 12} more tables
          </div>
        ) : null}
      </div>

      {err ? <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">{err}</p> : null}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <BackBtn onClick={onBack}>Back</BackBtn>
        <ContinueBtn disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Continue"}
        </ContinueBtn>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Step 4 — Team                                                          */
/* ---------------------------------------------------------------------- */

function Step4Team({
  solo,
  staffCount,
  onBack,
  onContinue,
  onChooseSolo,
}: {
  solo: boolean;
  staffCount: number;
  onBack: () => void;
  onContinue: () => void;
  onChooseSolo: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"MANAGER" | "SERVER" | "HOST">("SERVER");
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const invitedSoFar = staffCount - 1 + invited.length; // exclude the owner

  async function invite() {
    if (inviting) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr("Enter a valid email.");
      return;
    }
    if (!name.trim()) {
      setErr("Enter a name so the invite reads naturally.");
      return;
    }
    setInviting(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          role,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || body?.error || `HTTP ${res.status}`);
      }
      setInvited(prev => [...prev, email.trim().toLowerCase()]);
      setEmail("");
      setName("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not invite");
    } finally {
      setInviting(false);
    }
  }

  // No local writes — the parent's onChooseSolo does the merged
  // setState+PATCH+goTo in one shot so we can't race the solo flag.
  function chooseSolo() {
    onChooseSolo();
  }

  return (
    <div className="space-y-6">
      <StepHeader
        eyebrow="Step 4 of 5"
        title="Invite your team"
        sub="Each teammate gets a magic-link to set up their own login. You can keep adding people from the Staff page after launch."
      />

      <div className="rounded-2xl border border-slate/10 bg-white p-4 ring-1 ring-slate/5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-umber">
          Add a teammate
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            id="teamName"
            label="Full name"
            value={name}
            onChange={setName}
            placeholder="Maria Lopez"
            autoComplete="name"
          />
          <Input
            id="teamEmail"
            label="Work email"
            value={email}
            onChange={setEmail}
            placeholder="maria@luna-lounge.com"
            autoComplete="email"
            inputMode="email"
          />
        </div>
        <div className="mt-3">
          <p className="text-[12px] font-medium text-slate/70">Role</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              { id: "MANAGER", label: "Manager", desc: "Full venue access" },
              { id: "SERVER", label: "Server",  desc: "Live requests + bills" },
              { id: "HOST",   label: "Host",    desc: "Reservations + seating" },
            ] as const).map(r => {
              const selected = role === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  className={[
                    "rounded-xl border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-slate bg-slate text-oat"
                      : "border-slate/15 bg-white text-slate/75 hover:border-slate/30",
                  ].join(" ")}
                >
                  <p className="text-[13px] font-semibold">{r.label}</p>
                  <p className={["mt-0.5 text-[11px]", selected ? "text-oat/75" : "text-slate/55"].join(" ")}>
                    {r.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {err ? (
          <p className="mt-3 rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">{err}</p>
        ) : null}

        <div className="mt-4">
          <button
            type="button"
            onClick={invite}
            disabled={inviting || !email.trim() || !name.trim()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-chartreuse px-5 text-[14px] font-semibold text-slate shadow-soft hover:-translate-y-0.5 hover:shadow-lift disabled:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {inviting ? "Sending invite…" : "Send invite"}
          </button>
        </div>
      </div>

      {invited.length > 0 ? (
        <ul className="rounded-2xl bg-oat p-3 ring-1 ring-slate/5">
          {invited.map(addr => (
            <li key={addr} className="flex items-center gap-2 px-2 py-1.5 text-[13px] text-slate">
              <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-chartreuse">
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Invite sent to <span className="font-mono text-xs">{addr}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BackBtn onClick={onBack}>Back</BackBtn>
          <button
            type="button"
            onClick={chooseSolo}
            className="text-[12px] text-slate/55 underline-offset-4 hover:text-slate hover:underline"
          >
            {solo ? "Solo operator (selected)" : "I'm running solo for now"}
          </button>
        </div>
        <ContinueBtn
          disabled={false}
          onClick={onContinue}
        >
          {invitedSoFar > 0 ? `Continue with ${invitedSoFar} teammate${invitedSoFar === 1 ? "" : "s"}` : "Continue"}
        </ContinueBtn>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Step 5 — Launch                                                        */
/* ---------------------------------------------------------------------- */

function Step5Launch({
  slug,
  venueName,
  tableCount,
  staffCount,
  solo,
  stripeReady,
  stripeAttached,
  onBack,
}: {
  slug: string;
  venueName: string;
  tableCount: number;
  staffCount: number;
  solo: boolean;
  stripeReady: boolean;
  stripeAttached: boolean;
  onBack: () => void;
}) {
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function launch() {
    if (launching) return;
    setLaunching(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/onboarding/complete`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || body?.error || `HTTP ${res.status}`);
      setLaunched(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not launch");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <span
          aria-hidden
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-chartreuse text-slate"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5 9-11" />
          </svg>
        </span>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-umber">Step 5 of 5</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate sm:text-3xl">
          {venueName} is ready to launch
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-slate/65">
          Print the QR tents, place them on tables, and you&rsquo;re open for service.
        </p>
      </div>

      <ul className="space-y-2 rounded-2xl bg-oat p-4 ring-1 ring-slate/5">
        <ChecklistItem done>Venue created</ChecklistItem>
        <ChecklistItem done>{tableCount} table{tableCount === 1 ? "" : "s"} generated</ChecklistItem>
        <ChecklistItem done>QR codes ready</ChecklistItem>
        <ChecklistItem done={stripeReady} pending={!stripeReady && stripeAttached}>
          Payments {stripeReady ? "live" : stripeAttached ? "pending verification" : "not connected yet"}
        </ChecklistItem>
        <ChecklistItem done={staffCount > 1 || solo}>
          {staffCount > 1
            ? `${staffCount} staff member${staffCount - 1 === 1 ? "" : "s"} on the team`
            : solo
            ? "Solo operator — flying alone for now"
            : "Staff: just you for now"}
        </ChecklistItem>
      </ul>

      {!stripeReady ? (
        <div className="rounded-2xl border border-chartreuse/40 bg-chartreuse/10 p-4">
          <p className="text-[14px] font-semibold text-slate">Want guests to pay from the table?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate/70">
            Connect Stripe to enable in-table payments. The rest of the flow
            works without it — bills can still close on your existing POS.
          </p>
          <ConnectStripeButton slug={slug} attached={stripeAttached} />
        </div>
      ) : null}

      {err ? <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral">{err}</p> : null}

      {!launched ? (
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <BackBtn onClick={onBack}>Back</BackBtn>
          <button
            type="button"
            onClick={launch}
            disabled={launching}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-chartreuse px-6 text-[15px] font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto"
          >
            {launching ? "Launching…" : "Launch venue →"}
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl bg-chartreuse/15 p-4">
          <p className="text-center text-[14px] font-semibold text-slate">You&rsquo;re live 🎉</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link
              href={`/admin/v/${slug}`}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-slate px-4 text-center text-[14px] font-semibold text-oat hover:-translate-y-0.5"
            >
              Open dashboard
            </Link>
            <Link
              href={`/admin/v/${slug}/qr-tents`}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate/15 bg-white px-4 text-center text-[14px] font-semibold text-slate hover:border-slate/30"
            >
              Download QR codes
            </Link>
            <Link
              href={`/admin/v/${slug}/staff`}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate/15 bg-white px-4 text-center text-[14px] font-semibold text-slate hover:border-slate/30"
            >
              Manage team
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistItem({ done, pending, children }: { done: boolean; pending?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-[13px] text-slate/75">
      <span
        aria-hidden
        className={[
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          done ? "bg-chartreuse text-slate" : pending ? "bg-coral-soft text-coral" : "bg-slate/10 text-slate/45",
        ].join(" ")}
      >
        {done ? (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : pending ? "…" : ""}
      </span>
      {children}
    </li>
  );
}

function ConnectStripeButton({ slug, attached }: { slug: string; attached: boolean }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/stripe/connect`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || body?.error || `HTTP ${res.status}`);
      if (!body.url) throw new Error("Stripe didn't return a URL");
      window.location.href = body.url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not open Stripe");
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate px-5 text-[14px] font-semibold text-oat disabled:opacity-60"
      >
        {loading ? "Opening Stripe…" : attached ? "Finish Stripe verification →" : "Connect Stripe →"}
      </button>
      {err ? <p className="mt-2 text-[12px] text-coral">{err}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Shared atoms                                                           */
/* ---------------------------------------------------------------------- */

function StepHeader({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <header>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-umber">{eyebrow}</p>
      <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-slate sm:text-[26px]">{title}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-slate/65">{sub}</p>
    </header>
  );
}

function Input({
  id,
  label,
  value,
  onChange,
  autoComplete,
  inputMode,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  inputMode?: "numeric" | "text" | "email";
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-medium text-slate/70">
        {label}
      </label>
      <input
        id={id}
        type="text"
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 block w-full rounded-xl border border-slate/15 bg-white px-3.5 py-3 text-[15px] text-slate placeholder-slate/35 outline-none transition-shadow focus:border-slate/40 focus:ring-4 focus:ring-slate/[0.08]"
      />
      {hint ? <p className="mt-1.5 text-[11px] text-slate/55">{hint}</p> : null}
    </div>
  );
}

function ContinueBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-chartreuse px-6 text-[15px] font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto"
    >
      {children}
    </button>
  );
}

function BackBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate/15 bg-white px-5 text-[14px] font-medium text-slate/70 hover:border-slate/30 hover:text-slate"
    >
      ← {children}
    </button>
  );
}
