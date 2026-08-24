"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Motion for the guest surface.
 *
 * Two rules the whole file follows.
 *
 * Everything degrades under `prefers-reduced-motion`. A guest who has
 * asked their phone for less movement gets the finished state instantly —
 * never a half-faded element they have to wait for. That's why every
 * animation here is an ENTRANCE from a visible resting state rather than
 * an opacity-0 default: if the animation never runs, the content is still
 * there.
 *
 * And nothing loops. A restaurant table is not a slot machine; movement
 * happens in response to something the guest did, then stops.
 */

/** True once, on the client, when the guest hasn't asked for less motion. */
export function useMotionOk(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOk(!mq.matches);
    const onChange = () => setOk(!mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return ok;
}

/**
 * Reveal children one after another as they enter the viewport.
 *
 * Observer-driven rather than on mount, so a guest scrolling to the
 * bottom of a long menu sees rows arrive there too instead of finding
 * everything already settled.
 */
export function Stagger({
  children,
  step = 45,
  className = "",
}: {
  children: React.ReactNode[];
  /** Milliseconds between siblings. */
  step?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const motionOk = useMotionOk();

  useEffect(() => {
    if (!motionOk) { setShown(true); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [motionOk]);

  return (
    <div ref={ref} className={className}>
      {children.map((child, i) => (
        <div
          key={i}
          style={{ transitionDelay: shown && motionOk ? `${i * step}ms` : "0ms" }}
          className={[
            "transition-all duration-500 ease-out motion-reduce:transition-none",
            shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          ].join(" ")}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/**
 * A short scale-pop, for confirming a tap landed.
 *
 * `trigger` is a counter the caller bumps. Using a counter rather than a
 * boolean means two taps in a row both animate, instead of the second one
 * silently doing nothing.
 */
export function Pop({
  trigger,
  children,
  className = "",
}: {
  trigger: number;
  children: React.ReactNode;
  className?: string;
}) {
  const [on, setOn] = useState(false);
  const motionOk = useMotionOk();

  useEffect(() => {
    if (trigger === 0 || !motionOk) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 320);
    return () => clearTimeout(t);
  }, [trigger, motionOk]);

  return (
    <span
      className={[
        className,
        "inline-block transition-transform duration-300 ease-out motion-reduce:transition-none",
        on ? "scale-125" : "scale-100",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

/**
 * A ring that fills as the guest works through the menu.
 *
 * Deliberately not a score. No points, no coins, no streak to protect —
 * just a quiet indication that there's more to look at, which is the one
 * honest thing progress can mean on a menu. It disappears at 100% rather
 * than congratulating anyone.
 */
export function ProgressRing({
  value,
  total,
  color,
  label,
}: {
  value: number;
  total: number;
  color: string;
  label: string;
}) {
  const motionOk = useMotionOk();
  const pct = total === 0 ? 0 : Math.min(1, value / total);
  const R = 13;
  const C = 2 * Math.PI * R;

  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden className="-rotate-90">
        <circle cx="16" cy="16" r={R} fill="none" stroke="currentColor" strokeWidth="3" className="text-slate/10" />
        <circle
          cx="16" cy="16" r={R} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          style={{ transition: motionOk ? "stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)" : "none" }}
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
