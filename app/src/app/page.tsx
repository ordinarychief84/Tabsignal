/**
 * TabCall — landing page.
 *
 * Visual language inspired by nory.ai's editorial pacing:
 *  - dark hero with a huge headline + floating product mockups
 *  - trust strip of brand cards on cream
 *  - big-stat row with vertical dividers ("Results you can take to the bank")
 *  - two-up feature cards with embedded UI fragments
 *  - massive bold sentence as a lead-in to CTA bands
 *
 * Brand palette (use ONLY these — see tailwind.config.ts):
 *   slate     #0E0F1A   dark surfaces, navbar, hero, footer
 *   slate.light #1A1C2C cards over slate
 *   oat       #F8F6F1   light surfaces
 *   chartreuse #C9F61C  primary action + active signals
 *   coral     #F25C42   alerts + delays
 *   sea       #5BD0B3   secondary accents
 *   umber     #8B6F4E   warm CTA / divider accent
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
      <SectionTitle />
      <ResultsBand />
      <OnePlatform />
      <TwoUpFeatures />
      <HowItWorks />
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
  const wordColor = variant === "light" ? "#FFFFFF" : "#0E0F1A";
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
            stroke="#C9F61C"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16" r="2" fill="#C9F61C" />
        </svg>
      </span>
      {iconOnly ? null : (
        <span
          className="text-lg font-semibold tracking-tight"
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
    <header className="sticky top-0 z-30 border-b border-slate-light/40 bg-slate/95 backdrop-blur">
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
          className="rounded-full bg-oat px-5 py-2 text-sm font-medium text-slate transition-colors hover:bg-oat/90"
        >
          Book a demo
        </Link>
      </div>
    </header>
  );
}

/* ------------------------------ hero ------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden bg-slate">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 md:grid-cols-[1.05fr_1fr] md:py-28 lg:py-32">
        {/* LEFT — headline column */}
        <div className="text-oat">
          <span className="inline-flex items-center gap-2 rounded-full border border-oat/15 bg-slate-light/60 px-3.5 py-1.5 text-[12px] text-oat/80">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-chartreuse text-[10px] font-bold text-slate">
              ★
            </span>
            Top performer · Restaurant ops · 4.8 from Houston operators
          </span>

          <h1 className="mt-6 text-[52px] font-semibold leading-[0.95] tracking-[-0.025em] text-oat md:text-[72px] lg:text-[88px]">
            <span className="block">The bad review</span>
            <span className="block text-chartreuse">never goes public.</span>
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-relaxed text-oat/70">
            TabCall sits on top of your POS — Toast, Square, Clover, anything.
            Guests scan a QR. The closest server&rsquo;s phone buzzes. And the
            second a 1-star is brewing, our AI mails it to you — not Google.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-chartreuse px-6 py-3.5 text-[15px] font-semibold text-slate transition-colors hover:bg-chartreuse/90"
            >
              Start free
            </Link>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-full border border-oat/15 bg-transparent px-6 py-3.5 text-[15px] font-medium text-oat transition-colors hover:bg-oat/5"
            >
              <span
                aria-hidden
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-oat/10"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M2 1l5 3.5L2 8V1z" fill="#F8F6F1" />
                </svg>
              </span>
              Watch the 60-sec tour
            </a>
          </div>

          <p className="mt-5 text-[12px] text-oat/45">
            Starter free, 0.5%/transaction. No contract. Cancel by text.
          </p>
        </div>

        {/* RIGHT — layered hero mockup */}
        <HeroMockup />
      </div>
    </section>
  );
}

function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Floating tag — top-left */}
      <div className="absolute -left-2 top-3 z-20 inline-flex items-center gap-2 rounded-full bg-slate-light/95 px-3 py-1.5 text-[11px] text-oat/85 ring-1 ring-white/10 backdrop-blur md:-left-8">
        <span className="h-1.5 w-1.5 rounded-full bg-sea" />
        Live floor — Otto&rsquo;s Lounge
      </div>

      {/* Email card — main */}
      <div className="rounded-3xl bg-slate-light p-6 shadow-2xl ring-1 ring-white/5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.18em] text-oat/50">
            From: alerts@tab-call.com
          </p>
          <span className="font-mono text-[11px] text-oat/40">10:14 PM</span>
        </div>

        <p className="mt-4 text-[15px] font-medium text-oat">
          Table 7 · 2 stars
        </p>

        <p className="mt-3 border-l-2 border-coral/50 pl-4 text-sm italic leading-relaxed text-oat/70">
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

      {/* Floating "0% public" badge — bottom-right */}
      <div className="absolute -bottom-5 right-2 z-20 flex items-center gap-3 rounded-2xl bg-oat px-4 py-3 text-slate shadow-xl ring-1 ring-slate/5 md:-right-8">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-chartreuse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l5 5L20 7"
              stroke="#0E0F1A"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="leading-tight">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate/55">
            1★ this week
          </p>
          <p className="text-base font-semibold">3 caught · 0 public</p>
        </div>
      </div>

      {/* Floating "live request" pill — top-right */}
      <div className="absolute -right-3 top-20 z-20 hidden rounded-2xl bg-oat px-4 py-3 text-slate shadow-xl ring-1 ring-slate/5 md:-right-12 md:block">
        <p className="text-[10px] uppercase tracking-[0.16em] text-slate/55">
          Avg close
        </p>
        <p className="mt-0.5 text-2xl font-semibold leading-none">
          1<span className="text-base font-medium text-slate/55">m</span>32
          <span className="text-base font-medium text-slate/55">s</span>
        </p>
        <p className="mt-1 text-[10px] text-sea">↓ 84% vs Toast</p>
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

/* ------------------------- trust strip ----------------------------- */

function TrustStrip() {
  // Real Houston-flavoured venue names placed as wordmarks. When real partner
  // logos arrive, swap each tile for an <Image>.
  const tiles = [
    { name: "Otto's Lounge", style: "italic" },
    { name: "Bar Reyna", style: "uppercase" },
    { name: "Anvil", style: "tracking-[0.3em]" },
    { name: "Captain Foxheart's", style: "italic" },
    { name: "Better Luck", style: "uppercase" },
    { name: "Tongue-Cut Sparrow", style: "tracking-[0.3em]" },
    { name: "Rudyard's", style: "italic" },
    { name: "Notsuoh", style: "uppercase" },
  ];
  return (
    <section className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 pb-8 pt-20 text-center md:pt-24">
        <h2 className="mx-auto max-w-3xl text-[34px] font-semibold leading-[1.05] tracking-tight text-slate md:text-[52px]">
          Trusted by the rooms that get loud after 10.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate/65">
          Houston bars and lounges that don&rsquo;t want a new POS — they want
          their floor to move faster.
        </p>

        <div className="mx-auto mt-12 grid max-w-6xl grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t) => (
            <div
              key={t.name}
              className="flex h-20 items-center justify-center rounded-2xl bg-white px-4 ring-1 ring-slate/5"
            >
              <span
                className={`text-base font-semibold text-slate/70 ${t.style ?? ""}`}
              >
                {t.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------- centered section title --------------------- */

function SectionTitle() {
  return (
    <section className="bg-oat">
      <div className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <p className="text-[11px] uppercase tracking-[0.22em] text-umber">
          Why bars switch
        </p>
        <h2 className="mt-5 text-[40px] font-semibold leading-[1.02] tracking-tight text-slate md:text-[64px]">
          Why operators love TabCall.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate/65">
          We don&rsquo;t replace your POS, your printer, or your menu. We sit on
          top — and free your floor up to do what it&rsquo;s actually there for:
          serve faster, save the rating, hold the regular.
        </p>
        <a
          href="#product"
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-slate/20 bg-white px-6 py-3 text-sm font-medium text-slate transition-colors hover:border-slate/40"
        >
          Learn about the product
          <span aria-hidden>→</span>
        </a>
      </div>
    </section>
  );
}

/* ------------------ results-you-can-take-to-the-bank --------------- */

function ResultsBand() {
  const stats = [
    {
      tag: "Bad-rating intercept",
      dot: "bg-coral",
      value: "3×",
      label: "Fewer 1-star reviews landing on Google",
    },
    {
      tag: "Floor speed",
      dot: "bg-sea",
      value: "1m 32s",
      label: "Average bill close vs 8m on Toast",
    },
    {
      tag: "Tip lift",
      dot: "bg-chartreuse",
      value: "+1.3%",
      label: "Digital vs paper tip percentage, by server",
    },
  ];
  return (
    <section className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 pb-20 md:pb-28">
        <h2 className="mx-auto max-w-3xl text-center text-[36px] font-semibold leading-[1.02] tracking-tight text-slate md:text-[56px]">
          Results you can take to the bank.
        </h2>

        <div className="mt-16 grid grid-cols-1 gap-y-12 md:grid-cols-3 md:gap-y-0">
          {stats.map((s, i) => (
            <div
              key={s.tag}
              className={[
                "px-2 text-center md:px-8",
                i > 0 ? "md:border-l md:border-slate/10" : "",
              ].join(" ")}
            >
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-medium text-slate ring-1 ring-slate/5">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                {s.tag}
              </span>
              <p className="mt-8 text-[72px] font-semibold leading-[0.9] tracking-[-0.02em] text-slate md:text-[96px]">
                {s.value}
              </p>
              <p className="mx-auto mt-6 max-w-[220px] text-sm leading-relaxed text-slate/65">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-20 max-w-4xl text-center text-[36px] font-semibold leading-[1.02] tracking-tight text-slate md:text-[56px]">
          Thicken up the thinnest of margins.
        </p>
      </div>
    </section>
  );
}

/* -------------------- the power of one platform -------------------- */

function OnePlatform() {
  return (
    <section id="product" className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 pb-24">
        <div className="overflow-hidden rounded-[32px] bg-white p-8 ring-1 ring-slate/5 md:p-14">
          <div className="grid items-center gap-12 md:grid-cols-2">
            {/* Left — copy */}
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-umber">
                One surface
              </p>
              <h3 className="mt-4 text-[36px] font-semibold leading-[1.02] tracking-tight text-slate md:text-[48px]">
                The power of one quiet feed.
              </h3>
              <p className="mt-5 max-w-md text-base leading-relaxed text-slate/65">
                Every table, every signal, every server. Live queue, ranked by
                age and urgency. The 3-minute red flag finds itself before the
                guest does.
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  "Live request queue, sub-second routing",
                  "Tip-aware bill view, Apple/Google/card",
                  "AI bad-rating intercept on every star prompt",
                  "Works on top of any POS — or no POS at all",
                ].map((b) => (
                  <li key={b} className="flex gap-3 text-[15px] text-slate/80">
                    <span
                      aria-hidden
                      className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-chartreuse"
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — venue stat panel */}
            <VenuePanelMock />
          </div>
        </div>
      </div>
    </section>
  );
}

function VenuePanelMock() {
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="rounded-3xl bg-oat p-6 ring-1 ring-slate/5">
        {/* Location pill */}
        <div className="inline-flex items-center gap-2 rounded-2xl bg-sea/30 px-4 py-2.5 text-[13px] font-semibold text-slate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 2C8 2 5 5 5 9c0 5.5 7 13 7 13s7-7.5 7-13c0-4-3-7-7-7z"
              stroke="#0E0F1A"
              strokeWidth="1.6"
            />
            <circle cx="12" cy="9" r="2.2" fill="#0E0F1A" />
          </svg>
          Otto&rsquo;s Lounge — Houston
        </div>

        {/* Sales card */}
        <div className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate/5">
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-slate/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate/70">
              Tabs
            </span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-chartreuse">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M7 17L17 7M17 7H9M17 7v8" stroke="#0E0F1A" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <p className="mt-4 text-[26px] font-semibold leading-none text-slate">
            $4,712.40
          </p>
          <p className="mt-1 text-xs text-slate/55">
            Friday · 21:42 · 47 served
          </p>
        </div>

        {/* Rating intercept card */}
        <div className="mt-3 rounded-2xl bg-white p-5 ring-1 ring-slate/5">
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-slate/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate/70">
              1★ caught
            </span>
            <span className="rounded-full bg-coral/15 px-2.5 py-1 text-[11px] font-semibold text-coral">
              ↗ −67%
            </span>
          </div>
          <p className="mt-4 text-[26px] font-semibold leading-none text-slate">
            3<span className="text-base font-medium text-slate/55"> /4</span>
          </p>
          <p className="mt-1 text-xs text-slate/55">
            Privately routed before going public
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------- two-up feature cards ----------------------- */

function TwoUpFeatures() {
  return (
    <section className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-2">
          <FeatureCard
            tag="AI intercept"
            title="Save the bad review for the lottery."
            body="Our AI reads every private feedback note in under a minute and emails you the table, the server, and the likely cause. The guest never sees a public review form."
          >
            <NotificationStack />
          </FeatureCard>

          <FeatureCard
            tag="Plays nice"
            title="Straightforward integrations."
            body="From POS to payouts to the bartender's PWA, plug TabCall on top of what you already pay for. Toast, Square, Clover, Stripe, Apple Pay, Google Pay. No rip-out."
          >
            <IntegrationOrbit />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  tag,
  title,
  body,
  children,
}: {
  tag: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-8 rounded-[32px] bg-white p-8 ring-1 ring-slate/5 md:p-10">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-umber">
          {tag}
        </p>
        <h3 className="mt-3 text-[28px] font-semibold leading-[1.05] tracking-tight text-slate md:text-[34px]">
          {title}
        </h3>
        <p className="mt-4 max-w-md text-base leading-relaxed text-slate/65">
          {body}
        </p>
      </div>
      <div className="mt-auto rounded-3xl bg-oat p-6 md:p-8">{children}</div>
    </article>
  );
}

function NotificationStack() {
  const items = [
    {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z"
            fill="#0E0F1A"
          />
        </svg>
      ),
      bg: "bg-coral/20",
      label: "Table 7 · 2★ before posting",
    },
    {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="#0E0F1A" strokeWidth="1.8" />
          <path d="M12 7v5l3 2" stroke="#0E0F1A" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
      bg: "bg-sea/30",
      label: "Bar 2 · waited 4:12 — escalate",
    },
    {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 12h18M12 3v18" stroke="#0E0F1A" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
      bg: "bg-chartreuse/40",
      label: "Marcus — 2nd flag this shift",
    },
  ];
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-center gap-3 rounded-2xl bg-white p-3 pr-4 ring-1 ring-slate/5"
        >
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${it.bg}`}
          >
            {it.icon}
          </span>
          <span className="text-[14px] font-medium text-slate">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function IntegrationOrbit() {
  // 8 satellite tiles + 1 centre brand tile arranged on a 3-row grid.
  const tiles: { label: string; tone: "white" | "sea" | "chartreuse" | "coral" | "umber" }[] = [
    { label: "Toast", tone: "white" },
    { label: "Square", tone: "sea" },
    { label: "Stripe", tone: "white" },
    { label: "Apple Pay", tone: "umber" },
    { label: "—", tone: "white" }, // brand center placeholder, replaced below
    { label: "Google Pay", tone: "chartreuse" },
    { label: "Clover", tone: "white" },
    { label: "Yelp", tone: "coral" },
    { label: "Toast KDS", tone: "white" },
  ];
  const tone = (t: string) => {
    switch (t) {
      case "sea":        return "bg-sea/30";
      case "chartreuse": return "bg-chartreuse/40";
      case "coral":      return "bg-coral/15";
      case "umber":      return "bg-umber/20";
      default:           return "bg-white";
    }
  };
  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map((t, i) => {
        if (i === 4) {
          // Centre brand tile
          return (
            <div
              key={i}
              className="flex aspect-square items-center justify-center rounded-2xl bg-slate text-chartreuse ring-1 ring-slate/10"
            >
              <span className="text-base font-semibold lowercase tracking-tight">
                tabcall
              </span>
            </div>
          );
        }
        return (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center rounded-2xl text-center text-[12px] font-semibold text-slate/85 ring-1 ring-slate/5 ${tone(t.tone)}`}
          >
            {t.label}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ how it works ----------------------- */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      tone: "bg-sea/30",
      title: "Guest taps. Closest server’s phone buzzes.",
      body:
        "Four buttons on the QR page: drink, bill, refill, help. No app to download, no waving, no eye contact across a packed room. Sub-second routing.",
    },
    {
      n: "02",
      tone: "bg-chartreuse/30",
      title: "Bill closes at the table. 90 seconds, end to end.",
      body:
        "Apple Pay, Google Pay, card. Tip preselected. Average POS close: 8 minutes. Yours: 90 seconds. That’s another turn before last call.",
    },
    {
      n: "03",
      tone: "bg-coral/20",
      title: "1–3★? It comes to you, not Google.",
      body:
        "Every guest rates after payment. 5★ gets nudged to Google. 1–3★ gets classified by our AI and emailed to you — table, server, likely cause — before it lands public.",
    },
  ];
  return (
    <section id="how" className="bg-slate">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] uppercase tracking-[0.22em] text-chartreuse/80">
            How it works
          </p>
          <h2 className="mt-4 text-[40px] font-semibold leading-[1.02] tracking-tight text-oat md:text-[60px]">
            Three steps, scan to served.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <article
              key={s.n}
              className="rounded-3xl bg-slate-light p-8 ring-1 ring-white/5"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold text-slate ${s.tone}`}
                >
                  {s.n}
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-oat/40">
                  Step {Number(s.n)}
                </span>
              </div>
              <h3 className="mt-7 text-[22px] font-semibold leading-snug text-oat">
                {s.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-oat/70">
                {s.body}
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
    <section id="pricing" className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] uppercase tracking-[0.22em] text-umber">
            Pricing
          </p>
          <h2 className="mt-4 text-[40px] font-semibold leading-[1.02] tracking-tight text-slate md:text-[60px]">
            Three tiers. No contracts.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate/65">
            Starter is self-serve and live in 3 minutes. Growth and Pro include
            a 15-minute setup call so we can wire up payouts, menu, and staff
            with you.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {tiers.map((t) => (
            <article
              key={t.name}
              className={[
                "flex flex-col rounded-3xl p-8",
                t.highlight
                  ? "bg-slate text-oat ring-1 ring-slate"
                  : "bg-white text-slate ring-1 ring-slate/10",
              ].join(" ")}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl font-semibold">{t.name}</h3>
                {t.highlight ? (
                  <span className="rounded-full bg-chartreuse px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate">
                    Most picked
                  </span>
                ) : null}
              </div>

              <p
                className={[
                  "mt-6 text-[44px] font-semibold leading-none tracking-tight",
                  t.highlight ? "text-oat" : "text-slate",
                ].join(" ")}
              >
                {t.price}
              </p>
              <p
                className={[
                  "mt-1 text-xs",
                  t.highlight ? "text-oat/55" : "text-slate/55",
                ].join(" ")}
              >
                {t.sub}
              </p>

              <p
                className={[
                  "mt-5 text-sm leading-relaxed",
                  t.highlight ? "text-oat/70" : "text-slate/70",
                ].join(" ")}
              >
                {t.tagline}
              </p>

              <ul
                className={[
                  "mt-7 space-y-3 text-[14px]",
                  t.highlight ? "text-oat/85" : "text-slate/80",
                ].join(" ")}
              >
                {t.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <span
                      aria-hidden
                      className={[
                        "mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                        t.highlight ? "bg-chartreuse" : "bg-slate",
                      ].join(" ")}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={t.ctaHref}
                className={[
                  "mt-8 inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-colors",
                  t.highlight
                    ? "bg-chartreuse text-slate hover:bg-chartreuse/90"
                    : "bg-slate text-oat hover:bg-slate/90",
                ].join(" ")}
              >
                {t.cta}
              </Link>
            </article>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-slate/45">
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
      <div className="mx-auto max-w-3xl px-6 pb-24 md:pb-32">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-[0.22em] text-umber">
            FAQ
          </p>
          <h2 className="mt-4 text-[36px] font-semibold leading-[1.02] tracking-tight text-slate md:text-[52px]">
            The questions every owner asks on the call.
          </h2>
        </div>

        <div className="mt-12 divide-y divide-slate/10 rounded-3xl bg-white ring-1 ring-slate/5">
          {qs.map((item) => (
            <details
              key={item.q}
              className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left">
                <span className="text-[15px] font-semibold text-slate">
                  {item.q}
                </span>
                <span
                  aria-hidden
                  className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate/20 text-slate/60 transition-transform group-open:rotate-45"
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
              <p className="mt-3 text-[15px] leading-relaxed text-slate/70">
                {item.a}
              </p>
            </details>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-umber">
          Still have a question?{" "}
          <Link href="/signup" className="underline-offset-4 hover:underline">
            Start free
          </Link>{" "}
          and ask us on the setup call — or email hello@tab-call.com.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------ CTA band --------------------------- */

function CtaBand() {
  return (
    <section className="bg-slate">
      <div className="mx-auto max-w-5xl px-6 py-24 text-center md:py-32">
        <h2 className="text-[44px] font-semibold leading-[0.98] tracking-[-0.02em] text-oat md:text-[80px]">
          Be the bar that gets the email at <span className="text-chartreuse">10:14</span>,
          <br className="hidden md:inline" /> not the Yelp at <span className="text-coral">10:42</span>.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base text-oat/70">
          Free to start. $99/mo for menu, pre-order, analytics. $299/mo for
          multi-location, regulars dossier, reservations. Cancel by text.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-chartreuse px-7 py-3.5 text-[15px] font-semibold text-slate transition-colors hover:bg-chartreuse/90"
          >
            Start free
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full border border-oat/15 px-7 py-3.5 text-[15px] font-medium text-oat transition-colors hover:bg-oat/5"
          >
            Book a setup call
          </Link>
        </div>
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
            <li>hello@tab-call.com</li>
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
