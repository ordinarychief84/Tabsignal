# TabCall — PRD v2.0 (YC / Operator Edition)
**Build to make money. Everything else is decoration.**

| | |
|---|---|
| **Status** | Working draft — built to ship, not to circulate |
| **Owner** | Founder / CEO |
| **Last Updated** | 2026-05-04 |
| **Supersedes** | `TabCall_PRD_v1.1.md` (kept for context, not for execution) |
| **The one number** | **Paid weekly active venues × ARPU = MRR** |
| **Day-14 target** | 1 paying venue at $149/mo. $149 MRR. |
| **Day-90 target** | 10 paying venues. $1,490 MRR. |
| **Day-365 target** | 50 paying venues. $7,500+ MRR. Default alive. |

---

## 1. The Money Story

A bar doing $80K/month makes $4–6K in tips on a 1.5% server-tip-pool. A 1% tip uplift = $800/mo. A single intercepted 1-star review (we measure this) = roughly $200/mo in protected revenue, conservatively. **Realized value to a bar: $800–1,500/mo.**

We charge **$149/mo flat + 0.5% of payments processed.** Or, for high-volume venues that hate %, $249/mo flat. We **never** charge $0. Founding cohort gets 50% off for 6 months ($75/mo) in exchange for a written quote and intro to two other owners.

**Unit economics back-of-envelope at venue 50:**
- ARPU: $179/mo blended
- Gross margin: 88% (Stripe + infra + email/push are the only variable costs)
- CAC: $250 founder time amortized → $40 per venue with SDR
- Payback: 1.4 months
- 12-month LTV at 4% monthly churn: ~$2,300

This is a venture-fundable curve only if we can ship the loop in 14 days, charge from day 1, and get the second city working without the founder.

---

## 2. The Problem (Who Has It, Who Pays For It)

Bars and lounges have two pains. Only one of them gets a credit card out.

| Pain | Who feels it | Will they pay to solve it? |
|---|---|---|
| Guests can't signal staff | Guests | No. Guests don't pay. |
| Bad reviews surprise the owner on Monday | **Owners** | **Yes.** Reviews drive 30% of new traffic in this segment. |
| Closing tabs is slow on busy nights | Owners + staff | Yes — payments save server time = more turns = more revenue |
| Guest leaves before tipping properly | Owners + staff | Yes — pre-selected gratuity captures 2–4% tip lift |

**The product the owner pays for:** *"You'll know about a bad review before it goes public, and your guests will close out faster."* The signaling feature is the wedge that gets us into the bar; **payments + reputation defense** are what they renew for.

This re-orders v1.1's priorities entirely.

---

## 3. The ICP (Tighter)

We do not sell to "bars and restaurants." That's $20B and unfocused.

**The first 25 venues all match this profile:**
- Houston-based
- Independent or 2–3 venue group (not chains, not hotels)
- $60K–250K/mo revenue
- Cocktail bar, lounge, or upscale gastropub (not dive bars, not chain sports bars)
- Owner-operator on-site at least 3 nights a week
- Owner checks Yelp/Google reviews on their phone (qualifying question on first visit)

**Why this ICP:**
- Single decision-maker, decision in one visit
- Tip-heavy (means tip uplift is meaningful)
- Reputation-paranoid (means review-interception is meaningful)
- Old enough to have been burned by reviews, young enough to use Stripe daily
- Dense in Houston — 200+ qualified targets within 30 minutes of each other

**Hard exclusions in v1:**
- Hotel bars (procurement is months)
- Chain restaurants (corporate IT)
- Dive bars (no tip culture, no Stripe)
- Brewpubs / breweries (sell at the counter, not table-side)
- Anything where owner says "we use Toast, can it integrate?" *(answer in v1: no, and we walk)*

---

## 4. The Wedge (One Feature That Gets The Meeting)

**AI Bad-Review Intercept.** When a guest leaves 1–3 stars, the optional note is read by an LLM in <5 seconds, classified (service / food / wait / other), assigned to the staff member on the table, and sent to the owner with the suggested action.

The screenshot of this email is the entire sales pitch:

> *Friday 10:14pm — Table 7 — 2 stars*
> *"Waited 8 min for second drink, server seemed annoyed when I asked again."*
> **Likely cause:** service responsiveness.
> **Server on table:** Marcus.
> **Suggested action:** comp the next round; talk to Marcus before close.

This single feature does three things at once:
1. Makes the demo land in 30 seconds
2. Justifies the price (one prevented 1-star review pays for the year)
3. Establishes day-1 AI presence (we're "the AI service intelligence platform for bars," not "another QR menu")

This is the wedge. It ships **Day 1**, not Month 9.

---

## 5. The Product (Day 14 Cut — 5 Things, Nothing Else)

We are shipping **five things** in two weeks. If a feature isn't on this list, it's not in v1.

| # | Feature | Why it ships now |
|---|---|---|
| 1 | **Guest QR + 1-tap request** | The hook. Lets us say "guests already use this" in week 3. |
| 2 | **Staff PWA with push** | Without this, the loop doesn't close. |
| 3 | **Tableside payment via Stripe (Apple Pay / Google Pay / card)** | The money feature. 0.5% take rate is here. |
| 4 | **AI bad-review intercept** | The wedge. The screenshot that sells. |
| 5 | **Owner setup wizard (one page, 5 minutes)** | Without this, founder has to fly out for every install. |

**What we are NOT building in v1:**

| v1.1 had it | Why we cut it |
|---|---|
| Manager dashboard | Owners use phone + email. Save 2 weeks. Add when ≥5 owners ask. |
| Weekly service report email | Founder texts owner Monday morning manually. Replace with code at venue 15. |
| Escalation timers (90s / 3min) | Adds 3 days of work for a feature owners don't ask for. Add when staff complaints come in. |
| Multi-role staff (OWNER/MANAGER/SERVER/BARTENDER) | One role: `staff`. Roles are Phase 2. |
| Stripe Billing / subscription portal | Invoice manually first 25 venues via Stripe Invoices. Real conversations with payers > automated billing. |
| POS webhook bridge for Toast/Square/Clover | NullAdapter only. We do not integrate POS in v1. Owner prints receipt manually. |
| Google review routing (4–5 stars → Google) | Ships in v1 — it's 4 hours of work and pairs with the AI feature. |
| Custom feedback note field on QR | Cut. Six request buttons + free-text on the *feedback* screen only. |
| Founding tier ($0/forever) | Replaced with 50%-off-for-6-months. We charge from day 1. |
| Group plan ($249, 2+ venues) | Doesn't exist until a 2-venue customer asks. |
| Annual prepay tier | Doesn't exist until churn data tells us we need it. |

---

## 6. Functional Requirements (Tight)

### F1 — Guest QR Request (Day 1–3)
Guest scans `tabcall.app/v/{slug}/t/{tableId}`. Sees venue name + 4 buttons:
- *Order a drink*
- *Get the bill*
- *Need help*
- *Refill*
On submit, request goes to staff PWA over Socket.io + FCM. Acceptance: <2s end-to-end on LTE.

### F2 — Staff PWA (Day 2–5)
Single role. Login via magic link (no password). Live queue. **Two buttons per request:** *Got it* (acknowledges) and *Done* (resolves). Acknowledgement pushes confirmation to guest's open page. That's it. No leaderboard, no roles, no escalation timer in v1.

### F3 — Tableside Payment (Day 4–9) — **The Money Feature**
Guest taps *Get the bill*. Sees line items pulled from `GuestSession.lineItems` (manually added by staff in PWA for v1 — POS-pulled in v2), tax computed from ZIP, gratuity preselected at 20% (changed from 18% — research backs higher anchor when guest is tipping on a phone). Stripe Payment Element with Apple Pay / Google Pay / card. On `payment_intent.succeeded`: mark session paid, push confirmation to staff with table + total + tip %. **No POS adapter.** Staff prints receipt from Stripe dashboard or just hands the guest their phone screen.

**Take rate:** 0.5% of processed payment, on top of $149/mo subscription. Stripe keeps 2.9% + 30¢. We surface this transparently to owner: *"You pay TabCall $0.50 on every $100 closed, in addition to your subscription. We make sure your guest pays faster and tips more — average tip uplift across our venues is X%."*

### F4 — AI Bad-Review Intercept (Day 6–11) — **The Wedge**
After payment, guest sees 5-star screen. Behavior:
- **4–5 stars:** *Enjoyed your visit? Leave us a Google review →* (deep link via `googlePlaceId`)
- **1–3 stars:** show *Sorry to hear that — what could we have done better?* with a free-text field, then tap submit. **No public review prompt.**
- Server-side: text classified by LLM (`drink quality`, `service speed`, `staff attitude`, `wait time`, `food`, `noise`, `other`). Email sent to owner within 60s with classification, the table, the staff member who served it, and a suggested action. **One LLM call, ~$0.001 per intercept. Wildly cheap.**

The model: `claude-haiku-4-5-20251001`. Prompt is cached — first call sets up the classifier, subsequent calls are 90% cheaper. Total AI cost projection: <$2/venue/month even at heavy use.

### F5 — Owner Setup Wizard (Day 1–3, parallel) — **The "no founder needed" feature**
One page: venue name, address, ZIP, timezone (autodetected), Google Place ID (we look it up by address), Stripe Connect (one click), table count (we generate `Table 1`…`Table N` and a printable PDF of QR tents). Done in 5 minutes on a phone in the bar at midnight.

No staff invite UX in v1 — owner shares the magic-link URL with their staff via SMS. We rebuild this as a real invite flow at venue 10.

---

## 7. The Business

### 7.1 Pricing (One Decision, One Number, Charge Day 1)

| Plan | Price | Who | Notes |
|---|---|---|---|
| **Starter** | $149/mo + 0.5% of processed payments | All venues | The default. Sold in <60 seconds. |
| **Flat-rate** | $249/mo, no take rate | High-volume venues ($150K+/mo) who hate % | Offer only if they push back on the take rate. |
| **Founding (first 25)** | 50% off Starter for 6 months ($75/mo + 0.5%) | First 25 paying venues | In exchange for a written quote, photo, and intros to 2 owners. **Not free, not permanent.** |
| **Annual** | Doesn't exist yet | — | Add when monthly churn ≥3% and owners ask for it. |
| **Group / multi-venue** | Doesn't exist yet | — | Add when a 2-venue customer asks. |
| **AI add-on** | Bundled in Starter for v1 | — | If take-rate doesn't justify the AI cost at scale, split out at $49/mo at venue 50. |

**Test going on at venue 5:** half the next 10 venues see Starter ($149 + 0.5%), other half see "Flat $249" first. Pick the one with the higher conversion as the default presentation.

### 7.2 Unit Economics @ Venue 25

- ARPU: ~$179/mo (most pick Starter; some bump to Flat)
- Stripe fees on take-rate revenue: pass-through to guest, near-zero on our side
- Infra: Vercel + Railway + Supabase + Upstash + Resend + FCM + Anthropic = ~$0.40/venue/mo at 25 venues
- AI: <$2/venue/mo at heavy use
- **Gross margin: ~88%**
- CAC during founder-led: ~$250 in time
- CAC with junior SDR (post-venue-25): ~$120
- Payback: 1.4 months
- LTV @ 4% monthly churn: ~$2,300

### 7.3 GTM (Three Phases, Each With An Exit Trigger)

**Phase A — Founder-led (venues 1–10).**
Walk in Tuesday 2pm. Demo on phone. Demo is the AI screenshot, not the QR. Close on the spot or come back Wednesday. Install personally, be present Friday night. **Exit trigger:** 5 venues live, 3 referenced, $750+ MRR.

**Phase B — Founder + 1 SDR (venues 10–25).**
Hire a 22-year-old who lives in Houston, $40K base + $300/closed-venue. Give them a 1-page playbook + the AI screenshot. Founder closes the >$200/mo accounts. SDR handles the rest. **Exit trigger:** 25 venues, $4K MRR, repeatable demo-to-close motion.

**Phase C — Inbound + referral (venues 25+).**
Each existing owner refers another → both get 1 month free. Case studies on the website (one per quarter). LinkedIn ads to "owner / GM" titles in Houston food-and-beverage. Expand to Austin once Houston has 30+ venues — same playbook. **Exit trigger:** 50 venues, default alive.

### 7.4 The Moat (How This Compounds)

The current PRD has no moat. v2.0 builds three:

1. **Anonymous guest payment profile.** Every guest who pays through TabCall once — their device hash is remembered (cookie + browser fingerprint, no PII). At a different TabCall venue, they get one-tap pay. **More venues = better guest UX = more guests use it = more venues want it.** This is a real two-sided network effect; the v1.1 PRD missed it.
2. **Review-defense dependency.** Once an owner has gotten three "we caught this before it went public" emails, removing TabCall feels like firing your insurance. Annual retention +25%.
3. **Tip-uplift data.** We can show each owner their tip % over time vs the venue cohort. That's a graph they screenshot and send to their CPA. Hard to switch to a competitor that can't show the same.

---

## 8. The Build (Day-by-Day)

| Day | Ship | Why |
|---|---|---|
| 1 | Repo, Vercel, Railway, Supabase, Upstash, Stripe Connect test mode | Foundations |
| 2 | Setup wizard (F5) on phone form-factor | We onboard ourselves first |
| 3 | Guest QR page + request submission (F1) | The hook |
| 4 | Staff PWA + Socket.io live queue (F2) | The loop closes |
| 5 | FCM push for Staff PWA when backgrounded | Real-world reliability |
| 6 | Bill screen, line items, tax, tip selector (F3 part 1) | Money feature begins |
| 7 | Stripe Payment Element + Apple/Google Pay (F3 part 2) | Money feature ships |
| 8 | Stripe webhook idempotency + payment confirm push to staff (F3 part 3) | Money feature is bulletproof |
| 9 | 5-star feedback screen + Google review deep-link (F4 part 1) | Wedge begins |
| 10 | Anthropic Haiku integration, classifier, prompt caching (F4 part 2) | AI live |
| 11 | Owner email template + send via Resend on bad rating (F4 part 3) | Wedge ships |
| 12 | End-to-end test on 6 real phones (3 iPhones, 3 Androids, 2 cellular carriers) | Catch the things only real devices catch |
| 13 | Founder install at first venue, real Friday night | Ship for real |
| 14 | Charge first $149 invoice. Day 1 of MRR. | The whole point |

If a feature slips, we cut acceptance criteria, not the launch. **The 14-day clock is non-negotiable.**

---

## 9. Day-1 Stack (Same as v1.1, With Three Cuts)

**Keep:**
- Next.js 14 on Vercel — guest, staff PWA, owner web all one codebase
- Fastify on Railway for the webhook + Socket.io server
- Supabase Postgres with RLS
- Upstash Redis (ephemeral session state — no BullMQ in v1, no scheduled jobs to run)
- Stripe (Connect, Payment Element, Invoices)
- Resend + React Email for the AI alert email
- FCM for backgrounded staff push
- Anthropic SDK with prompt caching for AI classifier (`claude-haiku-4-5-20251001`)
- Sentry for errors, Logtail for logs
- Zod for validation, NextAuth for owner login

**Cut from v1.1:**
- BullMQ (no scheduled jobs in v1 — escalation and weekly reports are deferred)
- Prisma migrations beyond the 5-entity schema (`Organization`, `Venue`, `Table`, `StaffMember`, `Request`, `GuestSession`, `FeedbackReport`) — no menu/loyalty/happyhour entities even as forward-compat scaffolding (YAGNI)
- POS adapter abstraction layer — `NullAdapter` only, no factory pattern (we'll add it the day we sign the first POS-requiring customer)

---

## 10. Risks (The Ones That Kill The Company)

The v1.1 risks were operational. These are existential.

| # | Risk | What kills the company | What we do |
|---|---|---|---|
| R1 | First 5 venues say "neat" but don't pay | No revenue signal = no business | Charge from day 1. If 4 of 5 first prospects refuse $149, the wedge is wrong; reposition before building more. |
| R2 | AI classifier hallucinates a wrong "suggested action" and an owner trusts it | Owner fires a server based on bad AI advice → lawsuit / press | Day 1: AI emails always say *"AI-generated suggestion — verify before acting."* Log every classification for audit. |
| R3 | Guest payment fails on Friday night, staff blames us for ruined service | Venue churns immediately, tells 3 other owners | Stripe is 99.99% reliable but our integration is the risk. Day 13 testing on real cellular > all unit tests. |
| R4 | Tip uplift turns out to be 0% (no measurable lift vs control) | The pricing thesis collapses | Measure pre-install baseline for first 5 venues. If after 30 days no lift, reprice down to $99 + 1% take or pivot positioning. |
| R5 | The 14-day build slips to 28 days | Cash + morale | Cut acceptance criteria, not features. Ship buggy on day 14 and patch by day 21. |
| R6 | Owner can't get staff to use the PWA | Product looks broken on Friday | Founder is at the venue Friday night for the first 5 installs. Fix friction in real time. |
| R7 | Houston is wrong (saturation, owner culture, weather) | We waste 3 months in the wrong city | Reassess at 10-venue mark. If close-rate <30%, switch to Austin within 30 days. |
| R8 | Apple/Google Pay declines hurt conversion in iOS Safari | Money feature underperforms | Always show card fallback. Track conversion by payment type from day 1. |

---

## 11. Out of Scope (And When To Reconsider)

| Cut | When to revisit |
|---|---|
| Manager dashboard | When ≥5 owners ask. (Track requests in a spreadsheet.) |
| Weekly report email | When founder is too busy to text Monday morning. ~Venue 15. |
| Escalation timers | When staff fail-rate (unacknowledged requests) hits 10%+. |
| POS adapters (Toast/Square/Clover) | When 5 prospects say no specifically because of POS. Probably venue 30. |
| Multi-role staff (OWNER/MGR/SERVER/BARTENDER) | When a single venue has >20 staff and roles matter. |
| Loyalty / menu / happy hour | Phase 2 (month 4+), only if data shows owners asking. |
| Multi-venue / Group plan | When a 2-venue prospect signs up. |
| AI service coach / sentiment narrative | When the bad-review intercept is solid and 30+ venues are using it. |
| Annual prepay | When monthly churn is real (>3% sustained). |
| Non-US expansion | Year 2, after $20K MRR domestic. |
| Native iOS/Android apps | Never. PWA is sufficient. |

---

## 12. The 5 Open Questions That Block Day 1

These get answered this week, not later:

1. **`tabcall.app` — owned, available, or held?** *(Founder, due in 48 hours.)* If unavailable, we're `gettabcall.com` and printing tents on day 13.
2. **Stripe Connect onboarding flow — Standard or Express?** *(Founder, due day 2.)* Express is faster for the owner; Standard gives us more control. Defaulting to Express unless legal says otherwise.
3. **AI provider lock-in.** Anthropic Haiku is our default. If pricing changes mid-year, switching to OpenAI is 2 days of work. Build the classifier behind a 5-line abstraction. *(Eng, day 10.)*
4. **Photo + video consent during founding installs.** We need the social proof. *(Founder, get template signed by venue 1.)*
5. **Texas alcohol-tax handling on the bill.** ZIP-based US sales tax is straightforward; Texas mixed-beverage tax (6.7% on top, paid by the venue not the guest) is its own thing. *(Founder + Eng, due day 6 before bill ships.)*

---

## 13. Decision Log (v2.0)

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-04 | Repositioned from "QR signaling" to "tableside payment + AI review defense" | Where the willingness to pay actually lives |
| 2026-05-04 | Pricing changed to $149/mo + 0.5% (or $249 flat) | $79 was 0.16% of venue revenue — leaving money on the table |
| 2026-05-04 | Eliminated Founding Free tier; replaced with 50% off for 6 months | Free customers don't validate; charging is the validation |
| 2026-05-04 | AI bad-review intercept moved from Phase 3 (month 9+) to Day 1 | This is the wedge that closes deals; deferring it is strategic malpractice |
| 2026-05-04 | Cut 4 features from launch (manager dashboard, weekly report, escalation timers, multi-role staff, POS adapters) | Each adds 3+ days, none gates revenue |
| 2026-05-04 | Tip default increased from 18% to 20% | Phone tipping benchmarks support a higher anchor |
| 2026-05-04 | ICP narrowed from "all US bars" to "Houston cocktail bars / lounges / upscale gastropubs $60–250K/mo" | 25 in-target venues > 1000 mismatched |
| 2026-05-04 | Build window compressed to 14 days | YC pace; cash burn forces it |
| 2026-05-04 | Anonymous guest pay-profile becomes the moat | First real network-effect mechanic in the product |
| 2026-05-04 | Manual Stripe Invoices for first 25 paying venues; no Billing portal in v1 | Manual collection = real conversations with the people paying |

---

## 14. The Single Question That Decides Everything

**On day 14, did one venue pay us $149?**

If yes — repeat 49 more times. If no — the wedge is wrong, the price is wrong, the ICP is wrong, or the build is wrong. Find which, fix it in 7 days, try again.

That's the whole PRD.
