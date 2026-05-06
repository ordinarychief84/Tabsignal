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
        <a
          href="mailto:hello@tabcall.app?subject=TabCall%20setup"
          className="rounded-lg bg-chartreuse px-4 py-2 text-sm font-medium text-slate transition-colors hover:bg-chartreuse/90"
        >
          Talk to us
        </a>
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
            TabCall sits on top of your POS — Toast, Square, Clover, anything —
            and tells you, by table and by server, exactly which guest was about
            to leave a 1-star tonight. So you can fix it before they hit Yelp.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <a
              href="mailto:hello@tabcall.app?subject=TabCall%20setup"
              className="rounded-lg bg-chartreuse px-6 py-3 text-base font-medium text-slate transition-colors hover:bg-chartreuse/90"
            >
              Talk to TabCall
            </a>
            <a
              href="#how"
              className="text-base font-medium text-oat underline-offset-4 hover:underline"
            >
              See how it works →
            </a>
          </div>
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
      title: "Guest taps, server moves.",
      body:
        "Four buttons. One phone. No app to download. The closest staff member's phone lights up under a second.",
    },
    {
      n: "02",
      title: "Bill closes at the table.",
      body:
        "Apple Pay, Google Pay, card. Tip preselected. Average close time: 90 seconds. (Average POS close time: 8 minutes.)",
    },
    {
      n: "03",
      title: "Bad reviews stop at your inbox.",
      body:
        "5★ goes to Google. 1–3★ gets classified by our AI and emailed to you — by table, by server — so you can fix the cause, not the public score.",
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
    "Real-time queue that updates faster than your staff can tap.",
    "Tip-aware bill view — Apple Pay, Google Pay, card. 90 seconds, end to end.",
    "Auto-routes 1–3★ reviews to the manager, never to the public.",
    "Works on top of Toast, Square, Clover or no POS at all.",
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
      body: "Our AI reads every private feedback note in under a minute and emails you with the table, the server, and the likely cause. Owners using TabCall report ~3× fewer 1-star reviews going public.",
    },
    {
      title: "Stripe rates. Not Toast rates.",
      body: "TabCall passes Stripe through at 2.9% + 30¢. Toast charges 2.49% + 15¢ but locks you into hardware that costs $849 to install. Your call.",
    },
    {
      title: "Five-minute install. No POS rip-out.",
      body: "Set up your venue, print your QR tents, hand a phone to a server. We don't talk to your POS. You don't have to talk to your POS vendor.",
    },
    {
      title: "Tip percentage, by server, by week.",
      body: "Average digital tip is 17.1% versus 15.8% on paper. Watch yours rise. Watch which servers earn the lift.",
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

/* ------------------------------ CTA band --------------------------- */

function CtaBand() {
  return (
    <section style={{ backgroundColor: "#7B6767" }}>
      <div className="mx-auto max-w-3xl px-6 py-20 text-center md:py-24">
        <h2 className="text-[32px] font-medium leading-tight text-oat md:text-[44px]">
          Be the bar that gets the email at 10:14, not the Yelp at 10:42.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-oat/80">
          $199/month. Five-minute install. Cancel by text.
        </p>
        <a
          href="mailto:hello@tabcall.app?subject=TabCall%20setup"
          className="mt-10 inline-block rounded-lg bg-chartreuse px-7 py-3.5 text-base font-medium text-slate transition-colors hover:bg-chartreuse/90"
        >
          Email hello@tabcall.app
        </a>
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
            <li><a href="mailto:hello@tabcall.app" className="hover:text-oat">Set up a venue</a></li>
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
