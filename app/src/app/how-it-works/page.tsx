import Link from "next/link";
import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "../marketing-chrome";

export const metadata: Metadata = {
  title: "TabCall · How it works",
  description:
    "Three simple steps to a better hospitality experience. Guests scan a QR. Staff get notified. Your operations run smoothly.",
};

const STEPS = [
  {
    n: "01",
    title: "Scan QR Code",
    body:
      "Guests scan the QR code on their table to access the menu and services. No app to download. Works on any phone with a camera.",
    detail: [
      "Print one tent per table — letter paper, place tonight",
      "Each QR is bound to a specific table; the staff app knows where the request came from",
      "Tents include the brand mark, scan headline, and a trust line",
    ],
  },
  {
    n: "02",
    title: "Order, Call or Pay",
    body:
      "They can place orders, call a waiter, request the bill, or make payments. Everything in one tap, no app friction.",
    detail: [
      "Order from a digital menu with photos, categories, and modifiers",
      "Call waiter / request bill / ask for refill / ask for help",
      "Pay with Apple Pay, Google Pay, or any major card or wallet",
    ],
  },
  {
    n: "03",
    title: "We handle the rest",
    body:
      "Your staff gets notified instantly and your operations run smoothly. Requests escalate automatically if nobody responds.",
    detail: [
      "Closest server's phone buzzes within a second of the tap",
      "Requests waiting 3 minutes turn coral and re-route to a manager",
      "Manager dashboard shows live queue, response times, and table heatmap",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <main className="bg-oat text-slate">
      <MarketingNav />

      <section className="relative overflow-hidden border-b border-umber-soft/30">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50% 50% at 80% 20%, rgba(199, 214, 207, 0.4) 0%, rgba(247, 245, 242, 0) 60%), radial-gradient(40% 40% at 10% 90%, rgba(242, 231, 183, 0.28) 0%, rgba(247, 245, 242, 0) 65%)",
          }}
        />
        <div className="mx-auto max-w-7xl px-5 py-14 text-center md:px-8 md:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sea-soft/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate/75">
            Simple for everyone
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-[34px] font-semibold leading-[1.05] tracking-[-0.01em] text-slate md:text-[44px] lg:text-[56px]">
            How TabCall works
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-slate/65 md:text-[17px]">
            Three simple steps to a better hospitality experience. No app
            download. No new POS. Live tonight.
          </p>
        </div>
      </section>

      <section className="bg-oat py-16 md:py-20">
        <div className="mx-auto max-w-7xl space-y-12 px-5 md:space-y-16 md:px-8">
          {STEPS.map((s, i) => (
            <article
              key={s.n}
              className={`grid items-center gap-10 md:grid-cols-2 md:gap-14 ${
                i % 2 === 1 ? "md:[&>div:first-child]:order-2" : ""
              }`}
            >
              <div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-chartreuse text-slate text-[15px] font-semibold">
                  {s.n}
                </span>
                <h2 className="mt-5 text-[28px] font-semibold leading-tight tracking-tight text-slate md:text-[36px]">
                  {s.title}
                </h2>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-slate/65 md:text-[16px]">
                  {s.body}
                </p>
                <ul className="mt-5 space-y-2.5">
                  {s.detail.map((d) => (
                    <li key={d} className="flex gap-3 text-[14px] leading-relaxed text-slate/80">
                      <span
                        aria-hidden
                        className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-chartreuse"
                      />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <StepVisual step={s.n} />
            </article>
          ))}
        </div>
      </section>

      <section className="bg-oat pb-20 md:pb-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="rounded-[28px] border border-umber-soft/30 bg-white p-8 shadow-card md:p-12">
            <h2 className="text-[24px] font-semibold tracking-tight text-slate md:text-[34px]">
              Live on your floor tonight.
            </h2>
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-slate/65 md:text-[15px]">
              Free Starter plan up to 5 tables. Growth and Pro both include a
              14-day free trial. No card needed to start.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-full bg-chartreuse px-5 py-3 text-sm font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                Get Started Free
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center justify-center rounded-full border border-umber-soft/50 bg-white px-5 py-3 text-sm font-medium text-slate transition-colors hover:border-slate/30"
              >
                Explore all features
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

function StepVisual({ step }: { step: string }) {
  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 rounded-[36px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 40%, rgba(199, 214, 207, 0.4) 0%, rgba(247, 245, 242, 0) 75%)",
        }}
      />
      <div className="rounded-[28px] bg-linen p-6 ring-1 ring-umber-soft/30 md:p-8">
        {step === "01" ? <ScanVisual /> : step === "02" ? <OrderVisual /> : <QueueVisual />}
      </div>
    </div>
  );
}

function ScanVisual() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-umber-soft/30 shadow-card">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
            </svg>
          </span>
          <span className="text-[11px] font-semibold text-slate">TabCall</span>
        </div>
        <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-umber">Scan to</p>
        <p className="text-[16px] font-semibold leading-tight text-slate">Order &amp; Pay</p>
        <div className="relative mt-3 rounded-lg bg-white p-2 ring-1 ring-umber-soft/30">
          <QRGrid />
        </div>
        <p className="mt-2 text-center text-[9px] text-slate/55">Point camera · No app needed</p>
      </div>
    </div>
  );
}

function OrderVisual() {
  return (
    <div className="mx-auto w-full max-w-[260px] rounded-[36px] bg-slate p-2 shadow-lift">
      <div className="rounded-[28px] bg-white p-4">
        <div className="flex items-center justify-between text-[10px] text-slate/55">
          <span>9:41</span>
          <span className="font-medium text-slate/70">Table 12</span>
          <span aria-hidden className="opacity-0">9:41</span>
        </div>
        <p className="mt-3 text-[10px] text-slate/50">Hello</p>
        <p className="text-[18px] font-semibold leading-tight text-slate">What can we bring?</p>
        <ul className="mt-3 space-y-2">
          {[
            { label: "Call Waiter", active: true },
            { label: "View Menu" },
            { label: "Request Bill" },
            { label: "Pay Bill" },
          ].map((r) => (
            <li
              key={r.label}
              className={`rounded-xl px-3 py-2 text-[11px] font-semibold text-slate ${
                r.active ? "bg-chartreuse" : "bg-oat"
              }`}
            >
              {r.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function QueueVisual() {
  const items = [
    { table: "Table 7", type: "Call waiter", state: "yours" },
    { table: "Table 4", type: "Request bill", state: "delayed" },
    { table: "Table 12", type: "Refill", state: "ok" },
  ];
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-umber-soft/30 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-umber">Live queue</p>
      <ul className="mt-3 space-y-2">
        {items.map((i) => (
          <li
            key={i.table}
            className={`rounded-xl border bg-white p-3 ${
              i.state === "delayed"
                ? "border-coral ring-1 ring-coral/30"
                : i.state === "yours"
                ? "border-chartreuse"
                : "border-umber-soft/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-slate">{i.table}</p>
              {i.state === "yours" ? (
                <span className="rounded-full bg-chartreuse px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate">
                  yours
                </span>
              ) : i.state === "delayed" ? (
                <span className="rounded-full bg-coral px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-oat">
                  delayed
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-slate/60">{i.type}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Compact 11x11 QR grid for the scan visual. */
function QRGrid() {
  const SIZE = 11;
  const modules: boolean[][] = Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => {
      const inLocator =
        (y < 3 && (x < 3 || x > SIZE - 4)) || (y > SIZE - 4 && x < 3);
      if (inLocator) {
        const ly = y < 3 ? y : y - (SIZE - 3);
        const lx = x < 3 ? x : x > SIZE - 4 ? x - (SIZE - 3) : x;
        if (ly === 1 && lx === 1) return true;
        return ly === 0 || ly === 2 || lx === 0 || lx === 2;
      }
      return ((x * 7 + y * 13 + x * y) % 3 === 0) || ((x + y) % 5 === 0);
    })
  );
  return (
    <div
      aria-hidden
      className="grid aspect-square w-full gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
    >
      {modules.map((row, y) =>
        row.map((on, x) => (
          <span
            key={`${x}-${y}`}
            className={`block aspect-square rounded-[1px] ${on ? "bg-slate" : "bg-transparent"}`}
          />
        ))
      )}
    </div>
  );
}
