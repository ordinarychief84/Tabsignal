"use client";

import { useState } from "react";
import { Panel } from "@/components/admin/ui";
import type { GuestExperienceConfig } from "@/lib/guest-experience";
import {
  MAX_LABEL,
  MAX_VISITS,
  MIN_VISITS,
  type VisitProgramConfig,
} from "@/lib/visit-progress";

/**
 * Toggles for the guest journey.
 *
 * Grouped the way an owner thinks about it — what they see, what we ask
 * them, what happens afterwards — rather than by which table the flag
 * lives in.
 */

const GROUPS: { heading: string; items: { key: keyof GuestExperienceConfig; label: string; hint: string }[] }[] = [
  {
    heading: "What guests see",
    items: [
      { key: "welcome", label: "Welcome screen", hint: "Greets the table and introduces their server before the menu." },
      { key: "serverPhoto", label: "Server photo", hint: "Shows the assigned server's photo, when one is set." },
      { key: "menuDiscovery", label: "Menu discovery", hint: "“What are you in the mood for?” prompts, driven by your menu tags." },
      { key: "specials", label: "Specials", hint: "Live promotions, as a card the guest taps to reveal." },
      { key: "myPicks", label: "My Picks", hint: "Guests shortlist items to show their server. Not an order." },
      { key: "tablePicks", label: "Table Picks", hint: "Aggregated picks across the table. No names, counts only." },
    ],
  },
  {
    heading: "What you ask them",
    items: [
      { key: "feedback", label: "Post-visit feedback", hint: "Four-face rating, then tags and an optional note." },
      { key: "serviceRecovery", label: "Service recovery", hint: "Offers a manager check-in after a poor rating. Only if the guest says yes." },
      { key: "phoneCapture", label: "Phone capture", hint: "Optional, after feedback. Skipping is always available." },
      { key: "marketingConsent", label: "Marketing consent", hint: "The opt-in checkbox. Off means you collect numbers but never market to them." },
    ],
  },
  {
    heading: "After the visit",
    items: [
      { key: "thankYouMessage", label: "Thank-you message", hint: "Automatic post-visit message. Needs a messaging provider." },
    ],
  },
];

export function GuestExperienceForm({
  slug,
  config: initial,
  welcomeMessage: initialWelcome,
  consentPreview,
  consentVersion,
  messagingConfigured,
  visitProgram: initialProgram,
}: {
  slug: string;
  config: GuestExperienceConfig;
  welcomeMessage: string;
  consentPreview: string;
  consentVersion: string;
  messagingConfigured: boolean;
  visitProgram: VisitProgramConfig;
}) {
  const [config, setConfig] = useState(initial);
  const [welcome, setWelcome] = useState(initialWelcome);
  const [program, setProgram] = useState(initialProgram);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/v/${slug}/guest-experience`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          guestWelcomeMessage: welcome.trim() || null,
          visitProgram: program,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Welcome message">
        <p className="text-[13px] leading-relaxed text-slate/65">
          Shown when a guest scans, unless the server has their own. Leave it
          empty and TabCall writes one using the server&rsquo;s first name and
          your venue name.
        </p>
        <textarea
          value={welcome}
          onChange={e => setWelcome(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Welcome in. Have a look at tonight's menu while we make our way over."
          className="mt-3 w-full rounded-xl border border-umber-soft/40 bg-white p-3.5 text-sm outline-none focus:border-sea focus:ring-2 focus:ring-sea/25"
        />
        <p className="mt-1.5 text-[11px] text-slate/45">
          A server&rsquo;s own message takes priority over this one. You can edit
          any server&rsquo;s message on the People page.
        </p>
      </Panel>

      {GROUPS.map(group => (
        <Panel key={group.heading} title={group.heading}>
          <ul className="space-y-3">
            {group.items.map(item => {
              const blocked = item.key === "thankYouMessage" && !messagingConfigured;
              return (
                <li key={item.key} className="flex items-start gap-3">
                  <input
                    id={`ge-${item.key}`}
                    type="checkbox"
                    checked={config[item.key] && !blocked}
                    disabled={blocked}
                    onChange={e => setConfig(c => ({ ...c, [item.key]: e.target.checked }))}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-umber-soft/60 accent-slate disabled:opacity-40"
                  />
                  <label htmlFor={`ge-${item.key}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-sm font-medium text-slate">{item.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-slate/55">
                      {blocked
                        ? "Unavailable — no messaging provider is connected."
                        : item.hint}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}

      <Panel title="Regulars">
        <p className="text-[13px] leading-relaxed text-slate/65">
          Count a guest&rsquo;s visits and show them how close they are to
          something you&rsquo;ve promised. Only guests who have verified a
          phone number here are counted &mdash; TabCall never tries to
          recognise anyone who hasn&rsquo;t chosen to be recognised.
        </p>

        <label className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            checked={program.enabled}
            onChange={e => setProgram(p => ({ ...p, enabled: e.target.checked }))}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-umber-soft/60 accent-slate"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate">Show visit progress</span>
            <span className="mt-0.5 block text-[12px] leading-relaxed text-slate/55">
              Nothing appears until you fill in the reward below.
            </span>
          </span>
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-[7rem,1fr]">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Visits</span>
            <input
              type="number"
              min={MIN_VISITS}
              max={MAX_VISITS}
              value={program.visitsRequired}
              onChange={e =>
                setProgram(p => ({ ...p, visitsRequired: Number(e.target.value) || MIN_VISITS }))
              }
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-umber-soft/40 bg-white px-3.5 text-sm outline-none focus:border-sea focus:ring-2 focus:ring-sea/25"
            />
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.16em] text-umber">
              Scheme name
            </span>
            <span className="ml-2 text-[11px] text-slate/45">optional</span>
            <input
              type="text"
              maxLength={MAX_LABEL}
              value={program.programName}
              onChange={e => setProgram(p => ({ ...p, programName: e.target.value }))}
              placeholder="Regulars"
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-umber-soft/40 bg-white px-3.5 text-sm outline-none focus:border-sea focus:ring-2 focus:ring-sea/25"
            />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="text-[11px] uppercase tracking-[0.16em] text-umber">
            What they get
          </span>
          <input
            type="text"
            maxLength={MAX_LABEL}
            value={program.rewardLabel}
            onChange={e => setProgram(p => ({ ...p, rewardLabel: e.target.value }))}
            placeholder="A dessert on us"
            className="mt-1.5 min-h-[44px] w-full rounded-xl border border-umber-soft/40 bg-white px-3.5 text-sm outline-none focus:border-sea focus:ring-2 focus:ring-sea/25"
          />
          <span className="mt-1.5 block text-[11px] leading-relaxed text-slate/45">
            Your words, shown to the guest exactly as written. TabCall
            won&rsquo;t invent an offer, and it can&rsquo;t take anything off a
            bill &mdash; guests are told to mention it to their server.
          </span>
        </label>

        {program.enabled && !program.rewardLabel.trim() ? (
          <p className="mt-3 rounded-xl bg-chartreuse/15 px-3.5 py-2.5 text-[12px] leading-relaxed text-slate/70">
            Switched on, but nothing will show to guests until you say what
            they get. A progress bar leading nowhere implies a promise you
            haven&rsquo;t made.
          </p>
        ) : null}
      </Panel>

      <Panel title="Consent wording">
        <p className="text-[13px] leading-relaxed text-slate/65">
          Exactly what a guest agrees to when they tick the box. Stored with
          every consent so you can show what was shown.
        </p>
        <p className="mt-3 rounded-xl bg-oat p-3.5 text-[13px] leading-relaxed text-slate/75">
          {consentPreview}
        </p>
        <p className="mt-2 font-mono text-[11px] text-slate/45">version {consentVersion}</p>
      </Panel>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="min-h-[44px] rounded-xl bg-slate px-5 text-sm font-medium text-oat disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved ? <span role="status" className="text-[13px] text-slate/60">Saved.</span> : null}
        {error ? <span role="alert" className="text-[13px] text-coral">{error}</span> : null}
      </div>
    </div>
  );
}
