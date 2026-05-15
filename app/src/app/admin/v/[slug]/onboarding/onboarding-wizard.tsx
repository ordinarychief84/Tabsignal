"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Props = {
  slug: string;
  venueName: string;
  zipCode: string | null;
  timezone: string;
  brandColor: string | null;
  logoUrl: string | null;
  welcomeMessage: string | null;
  tableCount: number;
  staffCount: number;
  stripeReady: boolean;
  stripeAttached: boolean;
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

const FEATURE_TOGGLES = [
  { id: "qr_ordering", label: "QR ordering", desc: "Browse menu, place orders from the table", default: true },
  { id: "qr_payments", label: "QR payments", desc: "Pay and split bills from the phone", default: true },
  { id: "call_waiter", label: "Call waiter", desc: "Tap to call the closest server", default: true },
  { id: "reviews", label: "Reviews & ratings", desc: "Capture private feedback before public reviews", default: true },
  { id: "pos_integration", label: "POS integration", desc: "Sync orders with Toast, Square, or Clover", default: false },
] as const;

/* ---------------------------------------------------------------------- */
/* Wizard shell                                                           */
/* ---------------------------------------------------------------------- */

const STEPS = [
  { n: 1, key: "venue",    label: "Venue" },
  { n: 2, key: "branding", label: "Branding" },
  { n: 3, key: "tables",   label: "Tables" },
  { n: 4, key: "features", label: "Features" },
  { n: 5, key: "ready",    label: "You're ready" },
] as const;

export function OnboardingWizard(props: Props) {
  // Tracking the highest step the user has reached so the progress dots
  // light up. Each step's "Continue" handler bumps this. Editing an
  // earlier step does not regress the indicator.
  const initialStep = pickInitialStep(props);
  const [step, setStep] = useState<number>(initialStep);
  const [maxStep, setMaxStep] = useState<number>(initialStep);

  // Shared wizard state, persisted to localStorage between page reloads
  // (autosave). Server-side persistence happens on each step's "Save &
  // continue" so a refresh doesn't lose work.
  const [state, setState] = useWizardState(props);

  function next() {
    const target = Math.min(step + 1, STEPS.length);
    setStep(target);
    setMaxStep(prev => Math.max(prev, target));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function back() {
    setStep(s => Math.max(1, s - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
      <ProgressIndicator current={step} reached={maxStep} />

      <div className="mt-7 rounded-3xl border border-slate/10 bg-white p-5 shadow-card sm:p-8">
        <div key={step} className="onboarding-step-enter">
          {step === 1 && <Step1Venue state={state} setState={setState} slug={props.slug} onContinue={next} />}
          {step === 2 && <Step2Branding state={state} setState={setState} slug={props.slug} onContinue={next} onBack={back} />}
          {step === 3 && <Step3Tables state={state} setState={setState} slug={props.slug} initialCount={props.tableCount} onContinue={next} onBack={back} />}
          {step === 4 && <Step4Features state={state} setState={setState} onContinue={next} onBack={back} />}
          {step === 5 && <Step5Ready
              slug={props.slug}
              venueName={state.venueName}
              tableCount={state.tableCount}
              staffCount={props.staffCount}
              stripeReady={props.stripeReady}
              stripeAttached={props.stripeAttached}
              onBack={back}
            />}
        </div>
      </div>

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

/** Where to drop the user when they (re)open onboarding. Sentinel ZIP
 *  "00000" left at signup means step 1 still needs the real value.
 *  Otherwise jump to the lowest unfinished step. */
function pickInitialStep(p: Props): number {
  if (!p.zipCode || p.zipCode === "00000") return 1;
  if (!p.brandColor && !p.logoUrl && !p.welcomeMessage) return 2;
  if (p.tableCount === 0) return 3;
  return 5; // assume features are set or skipped, drop on the success screen
}

/* ---------------------------------------------------------------------- */
/* Wizard state                                                           */
/* ---------------------------------------------------------------------- */

type WizardState = {
  venueName: string;
  venueType: VenueTypeId;
  zipCode: string;
  tableCount: number;
  brandColor: string;
  welcomeMessage: string;
  features: Record<string, boolean>;
};

const LS_KEY = "tabcall:onboarding";

function useWizardState(props: Props): [WizardState, (patch: Partial<WizardState>) => void] {
  const [state, setStateRaw] = useState<WizardState>(() => ({
    venueName: props.venueName,
    venueType: "restaurant",
    zipCode: props.zipCode && props.zipCode !== "00000" ? props.zipCode : "",
    tableCount: props.tableCount || 6,
    brandColor: props.brandColor ?? "#232130",
    welcomeMessage: props.welcomeMessage ?? "",
    features: Object.fromEntries(FEATURE_TOGGLES.map(f => [f.id, f.default])),
  }));

  // Hydrate from localStorage on mount. We want server-state to win for
  // fields the server already has (zipCode, brandColor, welcomeMessage,
  // tableCount) and localStorage to win for client-only fields
  // (venueType, features).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<WizardState>;
      setStateRaw(prev => ({
        ...prev,
        ...(parsed.venueType ? { venueType: parsed.venueType } : {}),
        ...(parsed.features ? { features: { ...prev.features, ...parsed.features } } : {}),
      }));
    } catch { /* corrupt JSON — ignore */ }
  }, []);

  function setState(patch: Partial<WizardState>) {
    setStateRaw(prev => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          venueType: next.venueType,
          features: next.features,
        }));
      } catch { /* private mode — ignore */ }
      return next;
    });
  }

  return [state, setState];
}

/* ---------------------------------------------------------------------- */
/* Progress indicator                                                     */
/* ---------------------------------------------------------------------- */

function ProgressIndicator({ current, reached }: { current: number; reached: number }) {
  return (
    <div>
      {/* Bar with filled portion. Animated width. */}
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-slate/10">
        <div
          className="h-full rounded-full bg-chartreuse transition-all duration-500 ease-out"
          style={{ width: `${(current / STEPS.length) * 100}%` }}
        />
      </div>
      <ol className="mt-3 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.14em] text-slate/45 sm:text-[11px]">
        {STEPS.map(s => {
          const done = reached > s.n;
          const active = current === s.n;
          return (
            <li
              key={s.key}
              className={[
                "flex flex-1 items-center gap-1.5 transition-colors",
                active ? "text-slate" : done ? "text-umber" : "",
                s.n === STEPS.length ? "justify-end" : "",
              ].join(" ")}
            >
              <span
                aria-hidden
                className={[
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  done ? "bg-chartreuse text-slate" : active ? "bg-slate text-oat" : "bg-slate/10 text-slate/45",
                ].join(" ")}
              >
                {done ? "✓" : s.n}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Step 1 — Venue                                                         */
/* ---------------------------------------------------------------------- */

function Step1Venue({
  state,
  setState,
  slug,
  onContinue,
}: {
  state: WizardState;
  setState: (p: Partial<WizardState>) => void;
  slug: string;
  onContinue: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = state.venueName.trim().length > 0 && /^\d{5}(-\d{4})?$/.test(state.zipCode);

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.venueName.trim(),
          zipCode: state.zipCode,
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
          value={state.venueName}
          onChange={v => setState({ venueName: v })}
          autoComplete="organization"
          placeholder="Luna Lounge"
        />

        <div>
          <p className="block text-[12px] font-medium text-slate/70">Venue type</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {VENUE_TYPES.map(vt => {
              const selected = state.venueType === vt.id;
              return (
                <button
                  key={vt.id}
                  type="button"
                  onClick={() => setState({ venueType: vt.id })}
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
          value={state.zipCode}
          onChange={v => setState({ zipCode: v })}
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
/* Step 2 — Branding                                                      */
/* ---------------------------------------------------------------------- */

const COLOR_SWATCHES = [
  "#232130", "#7B5C46", "#6F9586", "#C8634F", "#8A6F2E",
  "#4F6C9C", "#8C5A8F", "#3C6E47", "#A04848",
];

function Step2Branding({
  state,
  setState,
  slug,
  onContinue,
  onBack,
}: {
  state: WizardState;
  setState: (p: Partial<WizardState>) => void;
  slug: string;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const suggestedWelcome = useMemo(() => {
    if (state.welcomeMessage.trim()) return state.welcomeMessage;
    const map: Record<VenueTypeId, string> = {
      restaurant: `Welcome to ${state.venueName}. Tap any option below — we'll take it from here.`,
      cafe: `Welcome in. Order, ask for help, or pay whenever you're ready.`,
      bar: `Cheers from ${state.venueName}. Order, call your bartender, settle up — your call.`,
      lounge: `Welcome to ${state.venueName}. We'll be over the moment you tap.`,
      nightclub: `You're at ${state.venueName}. Order from the table, pay when you're done.`,
      "food-court": `Welcome. Order from your seat — we'll bring it over when it's ready.`,
      "hotel-restaurant": `Welcome to ${state.venueName}. Order, pay, or call us anytime during your stay.`,
    };
    return map[state.venueType];
  }, [state.venueType, state.venueName, state.welcomeMessage]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandColor: state.brandColor,
          guestWelcomeMessage: state.welcomeMessage.trim() || suggestedWelcome,
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

  const previewWelcome = (state.welcomeMessage || suggestedWelcome).slice(0, 240);

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
                  onClick={() => setState({ brandColor: c })}
                  aria-label={`Brand color ${c}`}
                  className={[
                    "h-8 w-8 rounded-full ring-offset-2 transition",
                    state.brandColor === c ? "ring-2 ring-slate" : "ring-1 ring-slate/10 hover:ring-slate/30",
                  ].join(" ")}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label className="ml-1 inline-flex items-center gap-2 rounded-full border border-slate/15 bg-white px-3 py-2 text-[12px] text-slate/70">
                Custom
                <input
                  type="color"
                  value={state.brandColor}
                  onChange={e => setState({ brandColor: e.target.value })}
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
              value={state.welcomeMessage}
              onChange={e => setState({ welcomeMessage: e.target.value })}
              placeholder={suggestedWelcome}
              maxLength={240}
              rows={3}
              className="mt-1.5 block w-full rounded-xl border border-slate/15 bg-white px-3.5 py-2.5 text-[14px] text-slate placeholder-slate/35 outline-none transition-shadow focus:border-slate/40 focus:ring-4 focus:ring-slate/[0.08]"
            />
            <p className="mt-1.5 text-[11px] text-slate/55">
              {state.welcomeMessage.length}/240 — leave blank to use our suggestion for {VENUE_TYPES.find(v => v.id === state.venueType)?.label}s.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-oat p-4 ring-1 ring-slate/5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-umber">Live preview</p>
          <div className="mt-3 rounded-2xl bg-white p-4 shadow-soft">
            <div
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: state.brandColor }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
              </svg>
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-umber">Table 12</p>
            <p className="mt-1 text-[15px] font-semibold leading-tight text-slate">{state.venueName}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-slate/65">{previewWelcome}</p>
            <div className="mt-3 space-y-1.5">
              {["Call waiter", "View menu", "Pay bill"].map(s => (
                <div
                  key={s}
                  className="rounded-lg px-2.5 py-2 text-[11px] font-medium text-slate"
                  style={{ backgroundColor: hexToBg(state.brandColor) }}
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

/** Convert a hex color to a soft tinted background. Pure clientside —
 *  rough HSL approximation to keep dependencies zero. */
function hexToBg(hex: string): string {
  return hex + "18"; // append ~10% alpha
}

/* ---------------------------------------------------------------------- */
/* Step 3 — Tables                                                        */
/* ---------------------------------------------------------------------- */

function Step3Tables({
  state,
  setState,
  slug,
  initialCount,
  onContinue,
  onBack,
}: {
  state: WizardState;
  setState: (p: Partial<WizardState>) => void;
  slug: string;
  initialCount: number;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // We already auto-create 6 tables at signup. Let the user adjust:
  // if they bump count up, POST to bulk add. If down, we let them know
  // they can prune from /admin/v/[slug]/qr-tents — destructive deletes
  // need confirmation we don't want to bury inside a wizard.
  const wantsMore = state.tableCount > initialCount;

  async function save() {
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      if (wantsMore) {
        const res = await fetch(`/api/admin/v/${slug}/tables`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: state.tableCount - initialCount }),
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
        sub={`We already generated ${initialCount} table${initialCount === 1 ? "" : "s"} for you. Adjust the count if your floor is larger.`}
      />

      <div className="rounded-2xl bg-oat p-4 ring-1 ring-slate/5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-umber">Number of tables</p>
          <p className="font-mono text-[12px] tabular-nums text-slate/55">{initialCount} → {state.tableCount}</p>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setState({ tableCount: Math.max(1, state.tableCount - 1) })}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate/15 bg-white text-slate hover:border-slate/30"
            aria-label="Decrease tables"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            max={120}
            value={state.tableCount}
            onChange={e => {
              const v = Math.max(1, Math.min(120, Number(e.target.value) || 1));
              setState({ tableCount: v });
            }}
            className="w-20 rounded-xl border border-slate/15 bg-white px-3 py-2 text-center text-[16px] tabular-nums text-slate outline-none focus:border-slate/40 focus:ring-4 focus:ring-slate/[0.08]"
          />
          <button
            type="button"
            onClick={() => setState({ tableCount: Math.min(120, state.tableCount + 1) })}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate/15 bg-white text-slate hover:border-slate/30"
            aria-label="Increase tables"
          >
            +
          </button>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-slate/60">
          {state.tableCount < initialCount
            ? `To remove tables, head to QR tents after onboarding. We won't destroy any historical session data.`
            : state.tableCount > initialCount
            ? `We'll add ${state.tableCount - initialCount} new table${state.tableCount - initialCount === 1 ? "" : "s"} labeled in sequence.`
            : `No changes — your existing ${initialCount} tables are good to go.`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: Math.min(state.tableCount, 12) }, (_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate/10 bg-white p-3 text-center"
          >
            <p className="text-[10px] uppercase tracking-wider text-slate/45">Table</p>
            <p className="text-base font-semibold text-slate">{i + 1}</p>
          </div>
        ))}
        {state.tableCount > 12 ? (
          <div className="col-span-3 rounded-xl border border-dashed border-slate/15 bg-oat p-3 text-center text-[12px] text-slate/55 sm:col-span-4">
            + {state.tableCount - 12} more tables
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
/* Step 4 — Features                                                      */
/* ---------------------------------------------------------------------- */

function Step4Features({
  state,
  setState,
  onContinue,
  onBack,
}: {
  state: WizardState;
  setState: (p: Partial<WizardState>) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  function toggle(id: string) {
    setState({ features: { ...state.features, [id]: !state.features[id] } });
  }

  return (
    <div className="space-y-6">
      <StepHeader
        eyebrow="Step 4 of 5"
        title="Choose your setup"
        sub="Turn on what you want guests to see today. You can change these from settings anytime."
      />

      <ul className="space-y-2.5">
        {FEATURE_TOGGLES.map(f => {
          const on = state.features[f.id];
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => toggle(f.id)}
                className={[
                  "flex w-full items-start gap-3 rounded-2xl border bg-white px-4 py-3 text-left transition-colors",
                  on ? "border-chartreuse bg-chartreuse/10" : "border-slate/10 hover:border-slate/20",
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className={[
                    "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
                    on ? "bg-chartreuse text-slate" : "bg-slate/10 text-slate/45",
                  ].join(" ")}
                >
                  {on ? (
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-slate">{f.label}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-slate/60">{f.desc}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-[12px] text-slate/55">You can change these later.</p>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <BackBtn onClick={onBack}>Back</BackBtn>
        <ContinueBtn onClick={onContinue}>Continue</ContinueBtn>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Step 5 — Ready / activation                                            */
/* ---------------------------------------------------------------------- */

function Step5Ready({
  slug,
  venueName,
  tableCount,
  staffCount,
  stripeReady,
  stripeAttached,
  onBack,
}: {
  slug: string;
  venueName: string;
  tableCount: number;
  staffCount: number;
  stripeReady: boolean;
  stripeAttached: boolean;
  onBack: () => void;
}) {
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
          {venueName} is ready 🎉
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
        <ChecklistItem done={staffCount > 1}>
          {staffCount > 1 ? `${staffCount} staff member${staffCount - 1 === 1 ? "" : "s"} on the team` : "Staff: just you for now"}
        </ChecklistItem>
      </ul>

      {!stripeReady ? (
        <div className="rounded-2xl border border-chartreuse/40 bg-chartreuse/10 p-4">
          <p className="text-[14px] font-semibold text-slate">Before guests can pay from the table</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate/70">
            Connect Stripe to enable in-table payments. The rest of the flow
            works without it — bills can still close on your existing POS.
          </p>
          <ConnectStripeButton slug={slug} attached={stripeAttached} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link
          href={`/admin/v/${slug}`}
          className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-chartreuse px-4 text-center text-[14px] font-semibold text-slate shadow-soft hover:-translate-y-0.5 hover:shadow-lift"
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
          Invite staff
        </Link>
      </div>

      <div className="flex justify-start pt-2">
        <BackBtn onClick={onBack}>Back</BackBtn>
      </div>
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
/* Shared UI atoms                                                        */
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
