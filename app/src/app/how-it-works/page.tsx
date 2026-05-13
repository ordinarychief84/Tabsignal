import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "../marketing-chrome";

/**
 * /how-it-works. Written in About-us page format (Mission, What we do, the
 * Flow, Principles, By the numbers, Where we are). Scoped to nav + content +
 * footer. No marketing CTAs, no upsell blocks. Same click-to-detail pattern
 * as /features and /pricing.
 *
 * Voice: plain, operator-facing, hospitality direct. No em dashes. No
 * AI-slop language.
 */

export const metadata: Metadata = {
  title: "TabCall · How it works",
  description:
    "TabCall is the hospitality platform that sits on top of your POS. Guests scan a QR. Staff get pinged. Operations run on data, not vibes.",
};

export default function HowItWorksPage() {
  return (
    <main className="bg-oat text-slate">
      <MarketingNav />

      <Intro />
      <Mission />
      <WhatWeDo />
      <Flow />
      <Principles />
      <ByTheNumbers />
      <WhereWeAre />

      <MarketingFooter />
    </main>
  );
}

/* ---------------------------------------------------------------------- */
/* Intro                                                                  */
/* ---------------------------------------------------------------------- */

function Intro() {
  return (
    <section className="relative overflow-hidden border-b border-umber-soft/30">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(50% 50% at 80% 20%, rgba(199, 214, 207, 0.4) 0%, rgba(247, 245, 242, 0) 60%), radial-gradient(40% 40% at 10% 90%, rgba(242, 231, 183, 0.28) 0%, rgba(247, 245, 242, 0) 65%)",
        }}
      />
      <div className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 md:py-24">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sea-soft/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate/75">
          How TabCall works
        </span>
        <h1 className="mt-5 text-[34px] font-semibold leading-[1.05] tracking-[-0.01em] text-slate md:text-[44px] lg:text-[52px]">
          We help restaurants serve faster.
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-slate/65 md:text-[18px]">
          TabCall is the hospitality platform that sits on top of your POS.
          Guests scan a QR at the table. Staff get pinged. Operations run
          on data, not vibes.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Mission                                                                */
/* ---------------------------------------------------------------------- */

function Mission() {
  return (
    <Block eyebrow="Our mission" title="Take the friction out of service.">
      <p>
        Paper tabs are slow. Servers spend half their shift walking checks
        back and forth. Bad reviews land on Google before a manager can fix
        the room. We built TabCall to close that gap.
      </p>
      <p className="mt-4">
        Every part of the platform exists to do one of two things: shorten
        the time between a guest&rsquo;s need and a staff response, or
        catch a problem before it ends up public. That is the whole job.
      </p>
    </Block>
  );
}

/* ---------------------------------------------------------------------- */
/* What we do                                                             */
/* ---------------------------------------------------------------------- */

function WhatWeDo() {
  return (
    <Block eyebrow="What we do" title="One platform, the entire guest interaction.">
      <p>
        Guests scan, browse the menu, order, split the bill, pay, and
        leave a review without flagging a server. Servers run a live
        queue on their phones with sub-second push and three-minute
        escalation. Managers get real-time analytics, a heatmap of the
        floor, and an inbox for the bad ratings that never went public.
      </p>
      <p className="mt-4">
        TabCall sits on top of your existing setup. We do not replace
        your POS, your printer chain, or your tax configuration.
      </p>
    </Block>
  );
}

/* ---------------------------------------------------------------------- */
/* The Flow (3 steps)                                                     */
/* ---------------------------------------------------------------------- */

const FLOW_STEPS = [
  {
    n: "01",
    title: "Scan",
    body:
      "Guest points their phone camera at the QR on the table tent. The table page loads in under a second. No app to download.",
  },
  {
    n: "02",
    title: "Act",
    body:
      "Call a waiter, view the menu, order, split, pay, or leave a review. The closest server's phone buzzes within a second of the tap.",
  },
  {
    n: "03",
    title: "Resolve",
    body:
      "Server taps Got it, then Done with a reason. If three minutes pass without a response, the request turns coral and a manager is notified.",
  },
];

function Flow() {
  return (
    <section className="bg-oat py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Eyebrow text="The flow" />
        <Title>From scan to served to settled.</Title>
        <p className="mx-auto mt-4 max-w-2xl text-center text-[15px] leading-relaxed text-slate/65 md:text-[16px]">
          Three steps, every time. Nothing in between asks the guest to
          install anything or asks the server to do anything twice.
        </p>

        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {FLOW_STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-2xl border border-umber-soft/30 bg-white p-6 shadow-card md:p-7"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-chartreuse text-[14px] font-semibold text-slate">
                {s.n}
              </span>
              <p className="mt-4 text-[18px] font-semibold text-slate md:text-[20px]">
                {s.title}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-slate/65 md:text-[15px]">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Principles                                                             */
/* ---------------------------------------------------------------------- */

const PRINCIPLES = [
  {
    title: "We sit on top, not in the way",
    body:
      "TabCall runs alongside your POS, your printer chain, and your menu. No data migration. No staff retraining. If you stop using us, your floor still works.",
  },
  {
    title: "Speed beats polish",
    body:
      "Sub-second request delivery. Three-minute escalation timer. 1 minute 32 seconds median bill close. A slow tool on the floor is worse than no tool.",
  },
  {
    title: "Reviews route by rating",
    body:
      "Four and five stars get nudged to your Google profile. One to three stars route privately to your manager email with an AI category. The bad rating arrives before the public one does.",
  },
  {
    title: "Built with the floor, not for the floor",
    body:
      "Every change ships behind a flag and gets a week on a real Friday night before it goes wide. Bartenders and servers are co-builders, not test subjects.",
  },
];

function Principles() {
  return (
    <section className="bg-linen py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Eyebrow text="What we stand for" />
        <Title>How we build TabCall.</Title>

        <ul className="mt-12 grid gap-5 md:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <li
              key={p.title}
              className="rounded-2xl border border-umber-soft/30 bg-white p-6 shadow-card md:p-7"
            >
              <p className="text-[16px] font-semibold text-slate md:text-[18px]">
                {p.title}
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-slate/65 md:text-[15px]">
                {p.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* By the numbers                                                         */
/* ---------------------------------------------------------------------- */

const STATS = [
  {
    value: "1m 32s",
    label: "Median bill close, down from 8 minutes on a paper tab",
  },
  {
    value: "3×",
    label: "Fewer 1-star reviews landing on Google",
  },
  {
    value: "+1.3%",
    label: "Digital tip lift versus paper, per server",
  },
  {
    value: "10K+",
    label: "Restaurants and venues run TabCall",
  },
];

function ByTheNumbers() {
  return (
    <section className="bg-oat py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Eyebrow text="By the numbers" />
        <Title>What the floor looks like with TabCall.</Title>

        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl bg-sea-soft/55 p-6 text-center md:p-7"
            >
              <p className="text-[28px] font-semibold tracking-tight text-slate md:text-[36px]">
                {s.value}
              </p>
              <p className="mx-auto mt-3 max-w-[180px] text-[12px] leading-snug text-slate/70 md:text-[13px]">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Where we are                                                           */
/* ---------------------------------------------------------------------- */

function WhereWeAre() {
  return (
    <Block eyebrow="Where we are" title="Houston first.">
      <p>
        TabCall is built in Houston, Texas. Our first venues are Houston
        bars and lounges that did not want a new POS, they wanted their
        floor to move faster. We pick up the phone, and we show up for
        the Saturday-night shifts that ship our work.
      </p>
      <p className="mt-4">
        After Houston: Austin, Dallas, San Antonio. After Texas:
        wherever a hospitality operator wants to read a 2-star rating in
        their inbox before it reaches Google.
      </p>
    </Block>
  );
}

/* ---------------------------------------------------------------------- */
/* Layout helpers                                                         */
/* ---------------------------------------------------------------------- */

function Block({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-oat py-16 md:py-20">
      <div className="mx-auto max-w-3xl px-5 md:px-8">
        <Eyebrow text={eyebrow} align="left" />
        <Title align="left">{title}</Title>
        <div className="mt-6 text-[15px] leading-relaxed text-slate/70 md:text-[16px]">
          {children}
        </div>
      </div>
    </section>
  );
}

function Eyebrow({ text, align = "center" }: { text: string; align?: "center" | "left" }) {
  return (
    <p className={align === "center" ? "text-center" : ""}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sea-soft/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate/75">
        {text}
      </span>
    </p>
  );
}

function Title({
  children,
  align = "center",
}: {
  children: React.ReactNode;
  align?: "center" | "left";
}) {
  const wrap =
    align === "center"
      ? "mx-auto mt-4 max-w-3xl text-center"
      : "mt-4";
  return (
    <h2
      className={`text-[28px] font-semibold leading-[1.1] tracking-tight text-slate md:text-[36px] lg:text-[40px] ${wrap}`}
    >
      {children}
    </h2>
  );
}
