import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "../marketing-chrome";

/**
 * Scoped /how-it-works page. Renders only the walkthrough plus the shared
 * nav and footer. No CTAs, no marketing modules. Same click-to-detail
 * pattern as /features and /pricing.
 */

export const metadata: Metadata = {
  title: "TabCall · How it works",
  description:
    "A walkthrough of TabCall on a real service. Print the QR tents, place them, and the next time a guest scans, your floor moves faster.",
};

type Step = {
  n: string;
  title: string;
  lead: string;
  body: string;
  detail: string[];
  visual: "setup" | "scan" | "choose" | "respond" | "escalate" | "pay" | "rate" | "manage";
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Set up in one sitting",
    lead: "Sign up, print QR tents, place them, invite staff. Twenty minutes for most venues.",
    body:
      "TabCall sits on top of your existing setup. You do not replace your POS, your printer chain, or your tax configuration. After signing up, you generate one QR tent per table from the admin console and print them on letter paper. Each tent is bound to a specific table, so staff always know exactly which table a request came from. Invite your servers by email and they install the staff PWA on their phones in about a minute.",
    detail: [
      "Sign up free at tab-call.com/signup, no card needed to start",
      "Add your tables in the admin console (or bulk add Table 1 through Table N)",
      "Print one QR tent per table on standard letter paper",
      "Place a tent on each table before service",
      "Invite servers by email, they install the PWA in under a minute",
      "If you want, connect Stripe so guests can pay from the table tonight",
    ],
    visual: "setup",
  },
  {
    n: "02",
    title: "A guest scans the QR",
    lead: "No app to download. The guest points their phone camera at the tent and taps the link.",
    body:
      "When a guest sits down, they point their phone camera at the QR on the tent. Their phone shows a TabCall web link for that specific table. They tap it, and the table page opens in their browser. There is nothing to install. The page loads in under a second and works on any phone with a camera, including older Androids and iPhones. The brand on the page is your brand: your colors, your logo, your welcome message.",
    detail: [
      "Works on iPhone and Android cameras out of the box",
      "Loads in under a second on the lightest hotel Wi-Fi",
      "Bound to a specific table, so the server knows which table tapped",
      "Branded with your logo, banner, colors, and welcome copy",
      "No app store, no install, no login for the guest",
    ],
    visual: "scan",
  },
  {
    n: "03",
    title: "The guest taps what they need",
    lead: "Five clear options: call a server, view the menu, request the bill, pay, leave a review.",
    body:
      "On the table page, the guest sees five large buttons sized for one-handed tapping. Call waiter routes a request to the closest server. View menu opens the digital menu with photos, categories, and add-ons. Request bill asks the server to drop the check. Pay bill closes the tab without the server ever walking the check back. Leave review captures a rating after payment. The guest picks one and the request lands on the floor within a second.",
    detail: [
      "Call Waiter: routes to the closest server who has the table in their section",
      "View Menu: photos, categories (starters, mains, drinks, desserts), add-ons",
      "Request Bill: asks the server to bring or drop the check",
      "Pay Bill: closes the tab from the phone, no server step needed",
      "Leave Review: captures a 1 to 5 star rating after the payment lands",
    ],
    visual: "choose",
  },
  {
    n: "04",
    title: "The closest server gets it",
    lead: "A phone buzzes within a second of the tap. The server taps to acknowledge.",
    body:
      "The request lands in the staff PWA live queue and the closest server's phone vibrates. They open the queue and see the table, the request type, and how long it has been waiting. They tap Got it to acknowledge, and the guest's table page updates to show the server is on the way. When the server has handled the request, they tap Done and pick a resolution: served, comped, refused, escalated, stale. The queue keeps a clean audit trail.",
    detail: [
      "Push notification on the phone even if the PWA is backgrounded",
      "Request shows the table label, request type, and age in seconds",
      "Tap Got it to acknowledge, guest sees a confirmation on their page",
      "Tap Done when handled, pick a resolution reason for the audit log",
      "Hand off to another server with one tap if you are slammed",
    ],
    visual: "respond",
  },
  {
    n: "05",
    title: "Nothing falls through",
    lead: "If a request waits longer than three minutes, it turns coral and goes to a manager.",
    body:
      "Every request runs a three minute timer from the moment it lands. If no server has acknowledged it by then, the request turns coral in the queue and a manager push notification fires. The escalation does not punish the server, it just makes sure nothing dies in the queue. Managers see the delayed request on their dashboard with the table and the reason it was opened, and they can step in or reassign. Guests never see the escalation. Their page just shows that the server is coming.",
    detail: [
      "Three minute timer starts the second the request lands",
      "Coral state in the queue means it is past the timer",
      "Manager push notification fires automatically",
      "Manager dashboard shows the delayed request with table and type",
      "Resolution reason on a delayed request feeds the analytics",
    ],
    visual: "escalate",
  },
  {
    n: "06",
    title: "The guest pays without flagging a server",
    lead: "Itemized bill, optional split, tip, then Apple Pay or Google Pay or card. Done.",
    body:
      "When the guest taps Pay Bill, they see the items on their tab, the tax, and a tip selector with three preset percentages and a custom field. If two guests want to split, they can pay by item or by share without colliding. Payment runs through Stripe Connect, which means the money lands in your Stripe account, not in a TabCall escrow account. Apple Pay and Google Pay are supported by default. Your server never walks the check back, which gives them an extra eight minutes per turn.",
    detail: [
      "Itemized bill matches what is on the kitchen ticket",
      "Tip presets: 15, 20, 25 percent, plus a custom amount",
      "Split by item or by share, two guests can pay different items",
      "Apple Pay, Google Pay, all major cards and wallets",
      "Stripe Connect, money lands in your Stripe account directly",
      "Average bill close time is 1 minute 32 seconds, down from 8 minutes",
    ],
    visual: "pay",
  },
  {
    n: "07",
    title: "Reviews route by rating",
    lead: "After payment, the guest is asked to rate. High ratings ask for a Google review. Low ratings come to you.",
    body:
      "TabCall asks every paying guest to leave a star rating. If they pick 4 or 5 stars, they see a soft prompt to leave the same review on your Google profile. If they pick 1 to 3 stars, the review routes privately to your manager email. An AI classifier tags the review with the likely category: service speed, drink quality, staff attitude, wait time, food, or noise. You see the bad rating in your inbox at 10:14 and you can make it right before the 10:42 Google review lands.",
    detail: [
      "Every paying guest is asked for a 1 to 5 star rating",
      "4 and 5 stars get a soft nudge to your Google profile",
      "1 to 3 stars route privately to the manager email, never public",
      "AI classifier tags the category for trend spotting",
      "You can comp a round directly from the email with a one tap link",
    ],
    visual: "rate",
  },
  {
    n: "08",
    title: "The manager sees everything live",
    lead: "Live queue, response times, table heatmap, per server performance. All in real time.",
    body:
      "The manager dashboard shows the live request queue, the median acknowledge and completion times, the table heatmap, and per server performance. You can slice by server, by table, by hour, by section. Multi location operators get cross venue benchmarks once they have five or more venues, and they can see Houston versus Austin versus Dallas on the same numbers. Audit log captures every action with a timestamp and a staff identity, so you can replay a Saturday night if you need to.",
    detail: [
      "Live request queue, sub second updates over WebSocket",
      "Median acknowledge and completion times, per server",
      "Table heatmap, slowest first, with the cause if delayed",
      "Peak hour analytics by day of week and time of day",
      "Cross venue benchmarks for multi location operators (k greater than or equal to 5)",
      "Audit log with timestamp and identity for every action",
    ],
    visual: "manage",
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
        <div className="mx-auto max-w-3xl px-5 py-14 text-center md:px-8 md:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sea-soft/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate/75">
            How it works
          </span>
          <h1 className="mt-5 text-[34px] font-semibold leading-[1.05] tracking-[-0.01em] text-slate md:text-[44px] lg:text-[52px]">
            A walkthrough, from print to paid
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-slate/65 md:text-[17px]">
            Set up in one sitting. The guest scans a QR. The closest
            server&rsquo;s phone buzzes. Nothing in the queue waits longer
            than three minutes without a manager seeing it. Bill closes from
            the table. Reviews route by rating. Here is each step.
          </p>
        </div>
      </section>

      <section className="bg-oat py-16 md:py-20">
        <ol className="mx-auto max-w-7xl space-y-16 px-5 md:space-y-24 md:px-8">
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              className={`grid items-start gap-10 md:grid-cols-2 md:gap-14 ${
                i % 2 === 1 ? "md:[&>div:first-child]:order-2" : ""
              }`}
            >
              <div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-chartreuse text-slate text-[14px] font-semibold">
                  {s.n}
                </span>
                <h2 className="mt-5 text-[26px] font-semibold leading-tight tracking-tight text-slate md:text-[32px]">
                  {s.title}
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-slate/75 md:text-[16px]">
                  {s.lead}
                </p>
                <p className="mt-4 text-[14px] leading-relaxed text-slate/65 md:text-[15px]">
                  {s.body}
                </p>
                <ul className="mt-5 space-y-2.5">
                  {s.detail.map((d) => (
                    <li
                      key={d}
                      className="flex gap-3 text-[13px] leading-relaxed text-slate/80 md:text-[14px]"
                    >
                      <span
                        aria-hidden
                        className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-chartreuse"
                      />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <StepVisual kind={s.visual} />
            </li>
          ))}
        </ol>
      </section>

      <MarketingFooter />
    </main>
  );
}

function StepVisual({ kind }: { kind: Step["visual"] }) {
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
        {kind === "setup" ? <SetupVisual /> : null}
        {kind === "scan" ? <ScanVisual /> : null}
        {kind === "choose" ? <ChooseVisual /> : null}
        {kind === "respond" ? <RespondVisual /> : null}
        {kind === "escalate" ? <EscalateVisual /> : null}
        {kind === "pay" ? <PayVisual /> : null}
        {kind === "rate" ? <RateVisual /> : null}
        {kind === "manage" ? <ManageVisual /> : null}
      </div>
    </div>
  );
}

/* ---------- Step visuals ------------------------------------------------ */

function SetupVisual() {
  const tables = ["Table 1", "Table 2", "Table 3", "Table 4", "Table 5", "Table 6"];
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-umber-soft/30 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-umber">Admin · Tables</p>
      <p className="mt-1 text-[14px] font-semibold text-slate">6 tents ready to print</p>
      <ul className="mt-4 grid grid-cols-3 gap-2">
        {tables.map((t) => (
          <li
            key={t}
            className="flex flex-col items-center rounded-lg bg-oat p-2 text-center ring-1 ring-umber-soft/30"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate">
              <svg viewBox="0 0 24 24" width="12" height="12">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
              </svg>
            </span>
            <span className="mt-1 text-[9px] font-semibold text-slate">{t}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-4 w-full rounded-md bg-slate py-2 text-[11px] font-semibold text-oat"
      >
        Print all
      </button>
    </div>
  );
}

function ScanVisual() {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-umber-soft/30 shadow-card">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate"
        >
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
          </svg>
        </span>
        <span className="text-[11px] font-semibold text-slate">TabCall</span>
        <span className="ml-auto rounded-full bg-sea-soft/60 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-slate/75">
          Table 12
        </span>
      </div>
      <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-umber">Scan to</p>
      <p className="text-[16px] font-semibold leading-tight text-slate">Order &amp; Pay</p>
      <div className="relative mt-3 rounded-lg bg-white p-2 ring-1 ring-umber-soft/30">
        <QRGrid />
      </div>
      <p className="mt-2 text-center text-[9px] text-slate/55">Point camera. No app needed.</p>
    </div>
  );
}

function ChooseVisual() {
  return (
    <PhoneShell>
      <PhoneHead label="Table 12" />
      <p className="mt-3 text-[10px] text-slate/50">Hello</p>
      <p className="text-[16px] font-semibold leading-tight text-slate">What can we bring?</p>
      <ul className="mt-3 space-y-2">
        {[
          { label: "Call Waiter", sub: "Get the right help fast", active: true },
          { label: "View Menu", sub: "Browse and order" },
          { label: "Request Bill", sub: "Bring me the tab" },
          { label: "Pay Bill", sub: "Pay securely" },
          { label: "Leave Review", sub: "Tell us about your experience" },
        ].map((r) => (
          <li
            key={r.label}
            className={`flex items-center gap-3 rounded-xl p-2 ${
              r.active ? "bg-chartreuse" : "bg-oat"
            }`}
          >
            <span className="block min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-slate">{r.label}</span>
              <span className="block text-[9px] text-slate/55">{r.sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </PhoneShell>
  );
}

function RespondVisual() {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-umber-soft/30 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-umber">Staff PWA · Live queue</p>
      <ul className="mt-3 space-y-2">
        <QueueItem table="Table 7" type="Call waiter" age="00:08" state="yours" />
        <QueueItem table="Table 12" type="Refill" age="00:24" state="ok" />
        <QueueItem table="Table 4" type="Request bill" age="00:41" state="ok" />
      </ul>
    </div>
  );
}

function EscalateVisual() {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-umber-soft/30 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-umber">Manager · Live queue</p>
      <ul className="mt-3 space-y-2">
        <QueueItem table="Table 4" type="Request bill" age="03:14" state="delayed" />
        <QueueItem table="Table 7" type="Call waiter" age="00:32" state="ok" />
      </ul>
      <p className="mt-4 flex items-center gap-2 text-[11px] text-coral">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-coral" />
        Table 4 has waited 3 minutes. Manager notified.
      </p>
    </div>
  );
}

function PayVisual() {
  return (
    <PhoneShell>
      <PhoneHead label="Your Bill" />
      <p className="mt-1 text-center text-[10px] text-umber">Table 12</p>
      <ul className="mt-3 space-y-1 text-[11px] text-slate/80">
        <BillRow name="Truffle Pasta" price="$24.00" />
        <BillRow name="Grilled Salmon" price="$28.00" />
        <BillRow name="2 × Lemonade" price="$6.00" />
      </ul>
      <div className="mt-3 border-t border-slate/10 pt-2 text-[10px] text-slate/65">
        <BillRow name="Subtotal" price="$58.00" />
        <BillRow name="Tax" price="$4.64" />
        <BillRow name="Tip (15%)" price="$8.00" />
      </div>
      <div className="mt-2 border-t border-slate/10 pt-2 text-[12px] font-semibold text-slate">
        <BillRow name="Total" price="$70.64" />
      </div>
      <button type="button" className="mt-3 w-full rounded-md bg-slate py-2 text-[11px] font-semibold text-oat">
         Pay
      </button>
      <p className="mt-1 text-center text-[9px] text-slate/55">Apple Pay · Google Pay · Card</p>
    </PhoneShell>
  );
}

function BillRow({ name, price }: { name: string; price: string }) {
  return (
    <li className="flex items-baseline justify-between">
      <span>{name}</span>
      <span className="font-mono tabular-nums">{price}</span>
    </li>
  );
}

function RateVisual() {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-umber-soft/30 shadow-card">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-slate">5 stars</p>
          <p className="text-[9px] text-slate/55">to Google</p>
        </div>
        <p className="mt-2 flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill="#F2C94C">
              <path d="M12 2l2.9 6.3 6.9.6-5.2 4.7 1.6 6.8L12 17l-6.2 3.4 1.6-6.8L2.2 8.9l6.9-.6L12 2z" />
            </svg>
          ))}
        </p>
        <p className="mt-2 text-[10px] text-slate/55">
          Soft prompt asks the guest to leave the same review on your Google profile.
        </p>
      </div>
      <div className="rounded-2xl bg-white p-4 ring-1 ring-umber-soft/30 shadow-card">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-slate">2 stars</p>
          <p className="text-[9px] text-coral">to manager email</p>
        </div>
        <p className="mt-2 border-l-2 border-coral/60 pl-3 text-[10px] italic leading-snug text-slate/70">
          &ldquo;Waited 8 min for second drink.&rdquo;
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[9px] text-umber">
          <span aria-hidden className="rounded-full bg-sea-soft/60 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-slate/75">
            Service speed
          </span>
          AI category
        </p>
      </div>
    </div>
  );
}

function ManageVisual() {
  const bars = [40, 65, 80, 55, 90, 70, 45];
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-umber-soft/30 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-umber">Today</p>
      <p className="mt-1 text-[14px] font-semibold text-slate">Request volume by hour</p>
      <div className="mt-4 flex h-28 items-end gap-1.5">
        {bars.map((h, i) => (
          <div key={i} className="flex-1">
            <div
              className="rounded-t bg-slate"
              style={{ height: `${h}%` }}
              aria-hidden
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[9px] text-slate/55">
        <span>5p</span><span>6p</span><span>7p</span><span>8p</span><span>9p</span><span>10p</span><span>11p</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat v="1m 32s" l="Median ack" />
        <Stat v="3.1×" l="vs paper" />
        <Stat v="47" l="Served" />
      </div>
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div className="rounded-lg bg-oat p-2">
      <p className="text-[13px] font-semibold text-slate">{v}</p>
      <p className="text-[9px] text-slate/55">{l}</p>
    </div>
  );
}

function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[260px] rounded-[32px] bg-slate p-2 shadow-lift">
      <div className="rounded-[24px] bg-white p-4">{children}</div>
    </div>
  );
}

function PhoneHead({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between text-[10px] text-slate/55">
      <span>9:41</span>
      <span className="font-medium text-slate/70">{label}</span>
      <span aria-hidden className="opacity-0">9:41</span>
    </div>
  );
}

function QueueItem({
  table,
  type,
  age,
  state,
}: {
  table: string;
  type: string;
  age: string;
  state: "yours" | "delayed" | "ok";
}) {
  return (
    <li
      className={`rounded-xl border bg-white p-3 ${
        state === "delayed"
          ? "border-coral ring-1 ring-coral/30"
          : state === "yours"
          ? "border-chartreuse"
          : "border-umber-soft/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-slate">{table}</p>
        {state === "yours" ? (
          <span className="rounded-full bg-chartreuse px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-slate">
            yours
          </span>
        ) : state === "delayed" ? (
          <span className="rounded-full bg-coral px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-oat">
            delayed
          </span>
        ) : (
          <span className="font-mono text-[10px] text-slate/55">{age}</span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-slate/60">{type}</p>
      {state !== "ok" ? (
        <p className="mt-1 font-mono text-[10px] text-slate/55">{age}</p>
      ) : null}
    </li>
  );
}

/** Compact 11x11 decorative QR grid. Not a real scannable code. */
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
