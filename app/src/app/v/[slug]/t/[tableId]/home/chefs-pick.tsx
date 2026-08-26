"use client";

import { useState } from "react";
import { useTrack, useTrackOnce } from "@/components/guest/track";

/**
 * Guess tonight's pick.
 *
 * The only game in the guest experience, and it earns its place by being
 * true: the answer is the item guests at this venue actually saved most,
 * or — when there isn't enough of that to call anything popular — the
 * venue's own featured choice, worded as a choice.
 *
 * Restrained on purpose. The spec's line is "playful in a restrained way,
 * premium, hospitality-focused" and explicitly not casino-style: so a
 * reveal, a colour change and a short lift, and nothing that rains
 * confetti on someone mid-conversation. A wrong guess is met with "great
 * choice" rather than a buzzer, because the guest is a customer in a
 * restaurant, not a contestant.
 *
 * Played once per visit. A second round would be a quiz.
 */

type Choice = { id: string; name: string; imageUrl: string | null; priceCents: number };

export function ChefsPick({
  choices,
  answerId,
  basis,
  onView,
}: {
  choices: Choice[];
  answerId: string;
  basis: "popular" | "featured";
  onView: (id: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const track = useTrack();
  // How many guests were offered the round, so "completed" has a
  // denominator that isn't invented.
  useTrackOnce("chef_pick_started");
  const answer = choices.find(c => c.id === answerId);
  const correct = picked === answerId;

  if (!answer) return null;

  return (
    <section className="overflow-hidden rounded-3xl bg-white p-5 shadow-card ring-1 ring-umber-soft/30">
      <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
        {basis === "popular" ? "Tonight's favourite" : "The kitchen's pick"}
      </p>

      {picked === null ? (
        <>
          <h2 className="mt-2 text-[19px] font-semibold leading-snug tracking-tight text-slate">
            {basis === "popular"
              ? "Can you guess what everyone's ordering?"
              : "Can you guess what the kitchen would pick?"}
          </h2>
          <ul className="mt-4 space-y-2">
            {choices.map(choice => (
              <li key={choice.id}>
                <button
                  type="button"
                  onClick={() => {
                    track("chef_pick_completed", { menuItemId: choice.id });
                    setPicked(choice.id);
                  }}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-umber-soft/40 bg-white px-3 text-left transition-all hover:border-slate/30 active:scale-[0.99]"
                >
                  {choice.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={choice.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : null}
                  <span className="text-[15px] font-medium text-slate">{choice.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="motion-safe:animate-[pickReveal_420ms_cubic-bezier(0.16,1,0.3,1)]">
          <h2 className="mt-2 text-[22px] font-semibold leading-snug tracking-tight text-slate">
            {correct
              ? "You got it."
              : basis === "popular"
                ? "Great choice — but tonight it's…"
                : "Great choice — the kitchen says…"}
          </h2>

          <div
            className={[
              "mt-4 flex items-center gap-3 rounded-2xl p-3 transition-colors",
              correct ? "bg-chartreuse/30" : "bg-oat",
            ].join(" ")}
          >
            {answer.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={answer.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
            ) : (
              <span
                aria-hidden
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white text-xl"
              >
                {correct ? "✓" : "★"}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[16px] font-semibold text-slate">{answer.name}</p>
              <p className="font-mono text-[13px] tabular-nums text-slate/60">
                ${(answer.priceCents / 100).toFixed(2)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onView(answer.id)}
            className="mt-4 min-h-[48px] w-full rounded-2xl bg-slate text-[15px] font-semibold text-oat"
          >
            View the dish
          </button>
        </div>
      )}

      <style jsx global>{`
        @keyframes pickReveal {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
      `}</style>
    </section>
  );
}
