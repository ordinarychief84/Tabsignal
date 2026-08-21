"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The first thing a guest sees after scanning.
 *
 * Not a utility menu. Someone has just sat down in a room they chose, and
 * the product's first move should feel like being greeted rather than
 * being handed a form. So: the venue's name, where they're sitting, and —
 * when the table has one — the actual person looking after them.
 *
 * The server introduction is the reason this screen exists. "Meet Sarah"
 * changes what the rest of the session feels like: every later prompt is
 * asking a named person for something, not operating an app.
 *
 * Everything degrades. No assigned server means no introduction and
 * generic service wording, and the screen still reads as a welcome rather
 * than as something with a hole in it.
 */

export function WelcomeScreen({
  venueName,
  tableLabel,
  server,
  homeHref,
  onNeedServer,
  brandColor,
}: {
  venueName: string;
  tableLabel: string;
  server: { displayName: string; photoUrl: string | null; welcomeMessage: string } | null;
  homeHref: string;
  onNeedServer: () => void;
  brandColor: string | null;
}) {
  // Staged entrance. Restrained on purpose — a slow fade in sequence reads
  // as hospitality; anything springier reads as a game.
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 120),
      setTimeout(() => setStage(2), 620),
      setTimeout(() => setStage(3), 1100),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const accent = brandColor || "#F2E7B7";

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-oat px-6 text-slate">
      {/* Ambient wash in the venue's own colour. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background: `radial-gradient(70% 50% at 50% 0%, ${accent}55 0%, transparent 65%)`,
        }}
      />

      <div className="flex flex-1 flex-col justify-center py-12">
        <Reveal show={stage >= 1}>
          <p className="text-[11px] uppercase tracking-[0.2em] text-umber">Welcome to</p>
          <h1 className="mt-2 text-[40px] font-semibold leading-[1.05] tracking-tight text-slate">
            {venueName}
          </h1>
          <p className="mt-3 text-[15px] text-slate/60">You&rsquo;re at {tableLabel}</p>
        </Reveal>

        {server ? (
          <Reveal show={stage >= 2} className="mt-10">
            <div className="rounded-3xl bg-white/80 p-6 shadow-card ring-1 ring-umber-soft/30 backdrop-blur">
              <div className="flex items-center gap-4">
                {server.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={server.photoUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[24px] font-semibold text-slate"
                    style={{ background: `${accent}` }}
                  >
                    {server.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Meet</p>
                  <p className="text-[22px] font-semibold leading-tight tracking-tight text-slate">
                    {server.displayName}
                  </p>
                  <p className="text-[13px] text-slate/55">Your server tonight</p>
                </div>
              </div>

              <p className="mt-5 text-[15px] leading-relaxed text-slate/75">
                {server.welcomeMessage}
              </p>
            </div>
          </Reveal>
        ) : null}
      </div>

      <Reveal show={stage >= 3} className="pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Link
          href={homeHref}
          className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-slate text-[16px] font-semibold text-oat shadow-lift transition-transform active:scale-[0.99]"
        >
          Explore the menu
        </Link>
        <button
          type="button"
          onClick={onNeedServer}
          className="mt-3 min-h-[48px] w-full text-[14px] text-slate/60 underline-offset-4 hover:underline"
        >
          {server ? `Need ${server.displayName} now?` : "Need a server now?"}
        </button>
      </Reveal>
    </main>
  );
}

/** Fade + lift, and nothing at all for anyone who asked for less motion. */
function Reveal({
  show,
  children,
  className = "",
}: {
  show: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        className,
        "transition-all duration-700 ease-out motion-reduce:transition-none",
        show ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0 motion-reduce:opacity-100",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
