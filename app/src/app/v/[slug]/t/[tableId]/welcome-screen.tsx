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
  welcomeBack,
}: {
  venueName: string;
  tableLabel: string;
  /**
   * Replaces "Welcome to" for someone who has been here before and told
   * us so. Says nothing about what they did last time — a guest greeted
   * with their own order history is being told the venue keeps notes on
   * them, which is a conversation nobody asked them to have.
   */
  welcomeBack: string | null;
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

  // The venue's colour still personalises the page, but the brand palette
  // now sets the structure — Warm Ivory canvas, white card, Saffron CTA.
  const accent = brandColor || "#F4C95D";

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-ivory px-6 text-plum">
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
          {/* Small decorative Saffron accent, per §9. */}
          <span aria-hidden className="mb-4 block h-1 w-10 rounded-full bg-saffron" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-graphite">
            {welcomeBack ?? "Welcome to"}
          </p>
          <h1 className="mt-2 text-[40px] font-semibold leading-[1.05] tracking-tight text-plum">
            {venueName}
          </h1>
          <p className="mt-3 text-[15px] text-graphite">You&rsquo;re at {tableLabel}</p>
        </Reveal>

        {server ? (
          <Reveal show={stage >= 2} className="mt-10">
            {/* §8: white card on the ivory canvas, Sandstone border. */}
            <div className="rounded-2xl border border-sandstone bg-surface p-6 shadow-soft">
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
                    // §9: warm Apricot→Saffron treatment, not a flat fill.
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-apricot to-saffron text-[24px] font-semibold text-plum"
                  >
                    {server.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-graphite">
                    Meet
                  </p>
                  <p className="text-[22px] font-semibold leading-tight tracking-tight text-plum">
                    {server.displayName}
                  </p>
                  <p className="text-[13px] text-graphite">Your server tonight</p>
                </div>
              </div>

              <p className="mt-5 text-[15px] leading-relaxed text-graphite">
                {server.welcomeMessage}
              </p>
            </div>
          </Reveal>
        ) : null}
      </div>

      <Reveal show={stage >= 3} className="pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* §31: Saffron background, Deep Plum text. The primary CTA of the
            whole product, so it gets the signature colour. */}
        <Link
          href={homeHref}
          className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-saffron text-[16px] font-semibold text-plum shadow-soft transition-all hover:brightness-[0.97] active:scale-[0.99]"
        >
          Explore the menu
        </Link>
        <button
          type="button"
          onClick={onNeedServer}
          className="mt-3 min-h-[48px] w-full text-[14px] text-graphite underline-offset-4 hover:underline"
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
