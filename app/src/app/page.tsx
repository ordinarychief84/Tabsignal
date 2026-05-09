/**
 * TabCall — landing page.
 *
 * Brand palette (use ONLY these — see tailwind.config.ts):
 *   slate     #2B2539   dark surfaces, navbar, hero, footer
 *   slate.light #3A3346 cards over slate
 *   oat       #EBE9E4   light surfaces
 *   chartreuse #EEEFC8  primary action + active signals
 *   coral     #EFC8C8   alerts + delays
 *   sea       #BED3CC   secondary accents
 *   umber     #7B6767   section accent (CTA band)
 *
 * Section rule: a single section uses one accent at most. No gradients.
 */

import Link from "next/link";

export default function Landing() {
  return (
    <>
      <Navbar />
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <Product />
      <Benefits />
      <Pricing />
      <Faq />
      <CtaBand />
      <Footer />
    </>
  );
}

/* ------------------------------ logo ------------------------------- */

function Logo({
  variant = "light",
  iconOnly = false,
}: {
  variant?: "light" | "dark";
  iconOnly?: boolean;
}) {
  const wordColor = variant === "light" ? "#FFFFFF" : "#2B2539";
  return (
    <span className="inline-flex items-center gap-2 leading-none">
      <span
        aria-hidden
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate"
      >
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path
            d="M 6 11 Q 12 6, 18 11"
            fill="none"
            stroke="#EEEFC8"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16" r="2" fill="#EEEFC8" />
        </svg>
      </span>
      {iconOnly ? null : (
        <span
          className="text-lg font-medium tracking-tight"
          style={{ color: wordColor }}
        >
          TabCall
        </span>
      )}
    </span>
  );
}

/* ------------------------------ navbar ----------------------------- */

function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-light/40 bg-slate">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Logo variant="light" />
        <nav className="hidden items-center gap-8 text-sm text-oat/80 md:flex">
          <a href="#product" className="hover:text-oat">Product</a>
          <a href="#how" className="hover:text-oat">How it works</a>
          <a href="#pricing" className="hover:text-oat">Pricing</a>
          <Link href="/staff/login" className="hover:text-oat">Login</Link>
        </nav>
        <Link
          href="/signup"
          className="rounded-lg bg-chartreuse px-4 py-2 text-sm font-medium text-slate transition-colors hover:bg-chartreuse/90"
        >
          Start free
        </Link>
      </div>
    </header>
  );
}

/* ------------------------------ hero ------------------------------- */

function Hero() {
  return (
    <section className="bg-slate">
      <div className="mx-auto grid max-w-7xl gap-16 px-6 py-20 md:grid-cols-2 md:items-center md:py-28">
        {/* LEFT */}
        <div className="text-oat">
          <h1 className="text-[40px] font-medium leading-[1.05] tracking-tight md:text-[56px]">
            Know about the bad review before it goes public.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-oat/75">
            TabCall sits on top of your POS — Toast, Square, Clover, anything.
            Guests scan a QR, tap a request, the closest server&rsquo;s phone
            buzzes in under a second. And when a 1-star is brewing, our AI
            sends it to your inbox — not Google.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <Link
              href="/signup"
              className="rounded-lg bg-chartreuse px-6 py-3 text-base font-medium text-slate transition-colors hover:bg-chartreuse/90"
            >
              Start free → 3 minutes
            </Link>
            <a
              href="#how"
              className="text-base font-medium text-oat underline-offset-4 hover:underline"
            >
              See how it works →
            </a>
          </div>
          <p className="mt-4 text-[12px] text-oat/45">
            Starter is free — 0.5% per transaction. Growth + Pro venues book a 15-min setup call with us first.
          </p>
        </div>

        {/* RIGHT — the AI bad-review email mock (the wedge) */}
        <HeroCard />
      </div>
    </section>
  );
}

function HeroCard() {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl bg-slate-light p-6 ring-1 ring-white/5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-oat/50">
            From: alerts@tabcall.app
          </p>
          <span className="font-mono text-[11px] text-oat/40">10:14 PM</span>
        </div>

        <p className="mt-4 text-sm font-medium text-oat">
          Table 7 · 2 stars
        </p>

        <p className="mt-3 border-l-2 border-coral/40 pl-4 text-sm italic leading-relaxed text-oat/70">
          &ldquo;Waited 8 min for second drink, server seemed annoyed when I
          asked again.&rdquo;
        </p>

        <div className="mt-5 space-y-2 text-sm">
          <Row k="Likely cause" v="Service speed" />
          <Row k="Server on table" v="Marcus" />
          <Row k="Suggested" v="Comp the next round; talk to Marcus before close." last />
        </div>

        <p className="mt-5 inline-flex items-center gap-2 text-[11px] tracking-wide text-oat/45">
          <span className="h-1.5 w-1.5 rounded-full bg-chartreuse" />
          Routed privately. We never email the guest.
        </p>
      </div>
    </div>
  );
}

function Row({ k, v, last = false }: { k: string; v: string; last?: boolean }) {
  return (
    <div
      className={[
        "flex items-baseline justify-between gap-4",
        last ? "" : "border-b border-white/5 pb-2",
      ].join(" ")}
    >
      <span className="text-[11px] uppercase tracking-[0.16em] text-oat/40">{k}</span>
      <span className="text-right text-sm text-oat">{v}</span>
    </div>
  );
}

/* ------------------------------ trust ------------------------------ */

function TrustStrip() {
  return (
    <section className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 py-10 text-center">
        <p className="text-sm tracking-wide text-umber">
          Houston bars and lounges. We don&rsquo;t replace your Toast, Square,
          or Clover — we sit on top.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------ how it works ----------------------- */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Guest taps. Closest server’s phone buzzes.",
      body:
        "Four buttons on the QR page: drink, bill, refill, help. No app to download, no waving, no eye contact across a packed room. Sub-second routing.",
    },
    {
      n: "02",
      title: "Bill closes at the table. 90 seconds, end to end.",
      body:
        "Apple Pay, Google Pay, card. Tip preselected. Average POS close: 8 minutes. Yours: 90 seconds. That’s another turn before last call.",
    },
    {
      n: "03",
      title: "1–3★ rating? It comes to you, not Google.",
      body:
        "After payment, every guest rates. 5★ gets nudged to Google. 1–3★ gets classified by our AI and emailed to you — table, server, likely cause — before they post anywhere public.",
    },
  ];
  return (
    <section id="how" className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
        <header className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-umber">
            How it works
          </p>
          <h2 className="mt-3 text-[28px] font-medium leading-tight text-slate md:text-[36px]">
            Three steps, from scan to served.
          </h2>
        </header>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <article
              key={s.n}
              className="rounded-2xl border border-[#E5E5E5] bg-white p-7"
            >
              <StepIcon n={s.n} />
              <h3 className="mt-6 text-xl font-medium text-slate">{s.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-slate/70">
                {s.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function StepIcon({ n }: { n: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sea/60">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="#2B2539"
            strokeWidth="1.5"
          />
          <circle cx="12" cy="12" r="2.5" fill="#2B2539" />
        </svg>
      </span>
      <span className="font-mono text-xs tracking-wider text-umber">{n}</span>
    </div>
  );
}

/* ------------------------------ product ---------------------------- */

function Product() {
  const bullets = [
    "Live queue ordered by table, age, and urgency. The 3-minute red flag finds itself.",
    "Tip-aware bill view — Apple Pay, Google Pay, card. 90 seconds, end to end.",
    "AI intercept: 1–3★ ratings hit your inbox first; 4–5★ get nudged to Google.",
    "Works on top of Toast, Square, Clover — or no POS at all.",
    "Pro venues only: when a regular sits down, the bartender’s PWA buzzes with their name, usual drink, allergies, last note.",
  ];
  return (
    <section id="product" className="bg-slate">
      <div className="mx-auto grid max-w-7xl gap-16 px-6 py-20 md:grid-cols-2 md:items-center md:py-28">
        <div className="text-oat">
          <p className="text-xs uppercase tracking-[0.18em] text-oat/50">
            One surface for the floor
          </p>
          <h2 className="mt-3 text-[32px] font-medium leading-tight md:text-[40px]">
            Every table, every signal, in one quiet feed.
          </h2>
          <ul className="mt-8 space-y-4">
            {bullets.map((b) => (
              <li key={b} className="flex gap-3 text-base text-oat/80">
                <span
                  aria-hidden
                  className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-chartreuse"
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <DashboardMock />
      </div>
    </section>
  );
}

function DashboardMock() {
  type DashRow = {
    table: string;
    request: string;
    age: string;
    state: "pending" | "ack" | "delayed";
  };
  const rows: DashRow[] = [
    { table: "Table 4",  request: "Drink",  age: "0:18", state: "ack" },
    { table: "Bar 2",    request: "Bill",   age: "0:42", state: "pending" },
    { table: "Patio 7",  request: "Help",   age: "1:09", state: "pending" },
    { table: "Table 12", request: "Refill", age: "3:14", state: "delayed" },
    { table: "Bar 5",    request: "Drink",  age: "0:08", state: "pending" },
  ];

  return (
    <div className="rounded-2xl bg-slate-light p-6 ring-1 ring-white/5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-oat">Otto&rsquo;s Lounge</p>
          <p className="text-xs text-oat/50">Friday · 21:42</p>
        </div>
        <div className="text-right text-xs text-oat/60">
          <p>47 served</p>
          <p className="font-mono">4:12 avg</p>
        </div>
      </div>

      <ul className="mt-6 divide-y divide-white/5 rounded-xl bg-slate">
        {rows.map((r) => (
          <li
            key={r.table}
            className="flex items-center justify-between px-5 py-4"
          >
            <div>
              <p className="text-base font-medium text-oat">{r.table}</p>
              <p className="text-xs text-oat/50">{r.request}</p>
            </div>
            <div className="flex items-center gap-3">
              <StateChip state={r.state} />
              <span
                className={[
                  "font-mono text-sm",
                  r.state === "delayed" ? "text-coral" : "text-oat/70",
                ].join(" ")}
              >
                {r.age}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StateChip({ state }: { state: "pending" | "ack" | "delayed" }) {
  const map = {
    pending: { dot: "bg-oat/40", label: "Pending", text: "text-oat/60" },
    ack:     { dot: "bg-chartreuse", label: "On it",  text: "text-chartreuse" },
    delayed: { dot: "bg-coral",       label: "Delayed",text: "text-coral" },
  } as const;
  const v = map[state];
  return (
    <span className={`inline-flex items-center gap-2 text-xs ${v.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />
      {v.label}
    </span>
  );
}

/* ------------------------------ benefits --------------------------- */

function Benefits() {
  const items = [
    {
      title: "3 stars or below? You see it first.",
      body: "Our AI reads every private feedback note in under a minute and emails you the table, the server, and the likely cause. Bars running TabCall see roughly 3× fewer 1-star reviews land in public.",
    },
    {
      title: "Stripe rates. Not Toast rates.",
      body: "TabCall passes Stripe through at 2.9% + 30¢. Toast charges 2.49% + 15¢ but locks you into $849 of hardware and a 3-year contract. Your call.",
    },
    {
      title: "Five-minute install. No POS rip-out.",
      body: "Set up your venue, print your QR tents, hand a phone to a server. We don’t talk to your POS. You don’t have to talk to your POS vendor.",
    },
    {
      title: "Tip percentage, by server, by week.",
      body: "Average digital tip is 17.1% versus 15.8% on paper. Watch yours rise. Watch which servers earn the lift, and pool fairly when you want to.",
    },
    {
      title: "Treat regulars like regulars again.",
      body: "Pro venues get a regulars dossier: when a paired guest walks in, the bartender’s PWA buzzes with their name, usual drink, allergies, last-feedback note. The cheers-effect, every visit.",
    },
    {
      title: "Cancel by text. Keep your data.",
      body: "Month-to-month, no contract. If you leave, you keep your guest list, your reviews, your reports. We don’t hold floor data hostage.",
    },
  ];
  return (
    <section className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
        <header className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-umber">
            Benefits
          </p>
          <h2 className="mt-3 text-[28px] font-medium leading-tight text-slate md:text-[36px]">
            Fewer 1-stars. More turns. Less burnt-out staff.
          </h2>
        </header>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {items.map((b) => (
            <article
              key={b.title}
              className="rounded-2xl border border-[#E5E5E5] bg-white p-7"
            >
              <h3 className="text-xl font-medium text-slate">{b.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-slate/70">
                {b.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ pricing ---------------------------- */

function Pricing() {
  const tiers = [
    {
      name: "Starter",
      price: "Free",
      sub: "+ 0.5% per transaction",
      tagline: "For the bar that wants to try it tonight.",
      features: [
        "Realtime QR request queue",
        "AI bad-rating intercept",
        "Stripe Connect at 2.9% + 30¢",
        "Up to 1 staff seat",
      ],
      cta: "Start free",
      ctaHref: "/signup",
      highlight: false,
    },
    {
      name: "Growth",
      price: "$99",
      sub: "per month, per venue",
      tagline: "When the floor is full and the back office is messy.",
      features: [
        "Everything in Starter",
        "Menu + pre-order at QR",
        "Bill split (multi-card or named tabs)",
        "Tip pooling by shift or by server",
        "Per-server, per-shift analytics",
        "Unlimited staff seats",
      ],
      cta: "Book setup call",
      ctaHref: "/signup",
      highlight: true,
    },
    {
      name: "Pro",
      price: "$299",
      sub: "per month, per venue",
      tagline: "For groups, regulars, and the long game.",
      features: [
        "Everything in Growth",
        "Multi-location dashboard",
        "Custom branding on the QR page",
        "Regulars dossier (PWA buzz)",
        "Loyalty + reservations",
        "Benchmarking against peer venues",
      ],
      cta: "Book setup call",
      ctaHref: "/signup",
      highlight: false,
    },
  ];

  return (
    <section id="pricing" className="bg-slate">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
        <header className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-oat/50">
            Pricing
          </p>
          <h2 className="mt-3 text-[28px] font-medium leading-tight text-oat md:text-[36px]">
            Three tiers. No contracts. Start free.
          </h2>
          <p className="mt-4 max-w-xl text-base text-oat/70">
            Starter is self-serve and live in 3 minutes. Growth and Pro include a
            15-minute concierge call so we can wire up payouts, menu, and staff
            with you.
          </p>
        </header>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {tiers.map((t) => (
            <article
              key={t.name}
              className={[
                "flex flex-col rounded-2xl p-7",
                t.highlight
                  ? "bg-chartreuse text-slate ring-1 ring-chartreuse"
                  : "bg-slate-light text-oat ring-1 ring-white/5",
              ].join(" ")}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl font-medium">{t.name}</h3>
                {t.highlight ? (
                  <span className="rounded-full bg-slate px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-chartreuse">
                    Most picked
                  </span>
                ) : null}
              </div>

              <p
                className={[
                  "mt-5 text-4xl font-medium leading-none",
                  t.highlight ? "text-slate" : "text-oat",
                ].join(" ")}
              >
                {t.price}
              </p>
              <p
                className={[
                  "mt-1 text-xs",
                  t.highlight ? "text-slate/70" : "text-oat/55",
                ].join(" ")}
              >
                {t.sub}
              </p>

              <p
                className={[
                  "mt-5 text-sm leading-relaxed",
                  t.highlight ? "text-slate/80" : "text-oat/70",
                ].join(" ")}
              >
                {t.tagline}
              </p>

              <ul
                className={[
                  "mt-6 space-y-2.5 text-sm",
                  t.highlight ? "text-slate/85" : "text-oat/80",
                ].join(" ")}
              >
                {t.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <span
                      aria-hidden
                      className={[
                        "mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                        t.highlight ? "bg-slate" : "bg-chartreuse",
                      ].join(" ")}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={t.ctaHref}
                className={[
                  "mt-8 inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-medium transition-colors",
                  t.highlight
                    ? "bg-slate text-chartreuse hover:bg-slate/90"
                    : "bg-chartreuse text-slate hover:bg-chartreuse/90",
                ].join(" ")}
              >
                {t.cta}
              </Link>
            </article>
          ))}
        </div>

        <p className="mt-8 text-xs text-oat/45">
          All plans run month-to-month. No contracts. Cancel by text. Stripe
          processing (2.9% + 30¢) is passed through at cost.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------ faq -------------------------------- */

function Faq() {
  const qs = [
    {
      q: "Do I need to replace my POS?",
      a: "No. TabCall runs on top of Toast, Square, Clover, or anything else. We don’t touch your menu, your tax setup, or your printer chain. If you have no POS, we work on our own too.",
    },
    {
      q: "How long until we’re live?",
      a: "Starter is self-serve and takes about 3 minutes: connect Stripe, name your tables, print the QR tents. Growth and Pro include a 15-minute setup call so we can wire up payouts, menu sync, and staff seats with you.",
    },
    {
      q: "What about staff who don’t have phones?",
      a: "Buy a $80 Android off Amazon and clip it behind the bar. The PWA installs in one tap, no app store. Most venues run one shared phone for the bar and let servers use their own.",
    },
    {
      q: "Why a 0.5% transaction fee on Starter?",
      a: "Stripe Connect costs are real. The 0.5% covers our actual platform cost so we can keep Starter free. Growth and Pro flat-rate plans drop that to zero — Stripe is still passed through at 2.9% + 30¢, at cost.",
    },
    {
      q: "Will guests have to download an app?",
      a: "Never. The QR opens a regular webpage. Guests tap, request, pay, rate. No install, no account, no friction. About 60% of guests scan within the first 90 seconds of sitting down.",
    },
    {
      q: "What actually happens to bad reviews?",
      a: "After payment, every guest sees a star prompt. 4–5★ gets a one-tap link to your Google profile. 1–3★ goes private: our AI tags it (service speed, food, vibe, billing) and emails you the table, the server, and the likely cause. The guest never sees a public review form.",
    },
    {
      q: "Is my guest data safe?",
      a: "Yes. Guests opt in by phone number only — no name harvesting, no email scraping. Each venue’s data is isolated; we never sell, broker, or model on your floor data. If you cancel, we hand it to you and delete our copy.",
    },
    {
      q: "Can I upgrade to Growth or Pro on my own?",
      a: "Not yet. Growth and Pro require a 15-minute setup call so we can wire up Stripe payouts, menu sync, custom branding, and staff seats. It’s deliberately a real conversation — most owners use it to ask the questions they should have asked their POS rep three years ago.",
    },
  ];

  return (
    <section id="faq" className="bg-oat">
      <div className="mx-auto max-w-3xl px-6 py-20 md:py-24">
        <header className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-umber">
            FAQ
          </p>
          <h2 className="mt-3 text-[28px] font-medium leading-tight text-slate md:text-[36px]">
            The questions every owner asks on the call.
          </h2>
        </header>

        <div className="mt-10 divide-y divide-slate/10 rounded-2xl border border-slate/10 bg-white">
          {qs.map((item) => (
            <details
              key={item.q}
              className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left">
                <span className="text-base font-medium text-slate">
                  {item.q}
                </span>
                <span
                  aria-hidden
                  className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate/20 text-slate/60 transition-transform group-open:rotate-45"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12">
                    <path
                      d="M6 1v10M1 6h10"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </summary>
              <p className="mt-3 text-base leading-relaxed text-slate/70">
                {item.a}
              </p>
            </details>
          ))}
        </div>

        <p className="mt-8 text-sm text-umber">
          Still have a question?{" "}
          <Link href="/signup" className="underline-offset-4 hover:underline">
            Start free
          </Link>{" "}
          and ask us on the setup call — or email hello@tabcall.app.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------ CTA band --------------------------- */

function CtaBand() {
  return (
    <section style={{ backgroundColor: "#7B6767" }}>
      <div className="mx-auto max-w-3xl px-6 py-20 text-center md:py-24">
        <h2 className="text-[32px] font-medium leading-tight text-oat md:text-[44px]">
          Be the bar that gets the email at 10:14, not the Yelp at 10:42.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-oat/80">
          Free to start. $99/mo for menu, pre-order, analytics. $299/mo for multi-location, regulars dossier, and reservations. Cancel by text.
        </p>
        <Link
          href="/signup"
          className="mt-10 inline-block rounded-lg bg-chartreuse px-7 py-3.5 text-base font-medium text-slate transition-colors hover:bg-chartreuse/90"
        >
          Start free → 3 minutes
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------ footer ----------------------------- */

function Footer() {
  return (
    <footer className="bg-slate text-oat/70">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:grid-cols-3">
        <div>
          <Logo variant="light" />
          <p className="mt-4 max-w-xs text-sm text-oat/55">
            Built for the bars that respect the floor. Houston, then everywhere.
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-oat/40">
            Product
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            <li><a href="#how" className="hover:text-oat">How it works</a></li>
            <li><a href="#product" className="hover:text-oat">Live queue</a></li>
            <li><a href="#pricing" className="hover:text-oat">Pricing</a></li>
            <li><a href="#faq" className="hover:text-oat">FAQ</a></li>
            <li><Link href="/signup" className="hover:text-oat">Set up a venue</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-oat/40">
            Contact
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            <li>hello@tabcall.app</li>
            <li>Houston, TX</li>
            <li><Link href="/staff/login" className="hover:text-oat">Staff sign in</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-6 py-6 text-xs text-oat/40 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} TabCall.</p>
          <p>Built for restaurants, lounges, and clubs that respect their guests&rsquo; time.</p>
        </div>
      </div>
    </footer>
  );
}
