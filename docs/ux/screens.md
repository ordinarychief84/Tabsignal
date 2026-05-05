# TabCall — UX Plan

**Audience:** Restaurant, bar, club, lounge owners (primary) and their floor managers and serving staff.
**Style:** Swiss / International Typographic Style. Grid, hierarchy, restraint.
**Date:** 2026-05-05.

---

## Design system (Swiss baseline)

| Property              | Decision                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| Type family           | Inter (variable). Fallback `system-ui`. Mono: JetBrains Mono.                                      |
| Type scale            | 12 / 14 / 16 / 20 / 24 / 32 / 48. 1.4 line-height for body, 1.15 for display.                      |
| Grid                  | 8 px base. Container 768 / 1280. 12-column desktop, 4-column phone.                                |
| Color                 | Black `#0A0A0A`, white `#FFFFFF`, slate `#0F172A` text, paper `#F8FAFC` surfaces, brand `#1D9E75`. |
| Accent                | One brand color used sparingly — only on primary CTA and active state.                              |
| Borders               | 1 px `#E2E8F0`. Radius 8 px on inputs, 16 px on cards. No drop shadows except over modals.        |
| Iconography           | Lucide, 20 px stroke-1.5. Icons earn their place — never decorative.                                |
| Motion                | 150 ms ease-out for state changes. No bounces, no parallax.                                         |
| Density               | Tabular. Whitespace is structure, not garnish.                                                     |
| Tone                  | Direct, time-respecting. No exclamation marks. Numbers over adjectives.                              |

A screen is good when removing one element makes it worse and adding one element makes it worse.

---

## Surfaces

| # | Surface             | Who         | Form factor       |
| - | ------------------- | ----------- | ----------------- |
| A | Owner / manager web | Owner, GM   | Desktop primary   |
| B | Staff PWA           | Server, bar | Mobile primary    |
| C | Guest web           | Diner       | Mobile only       |

The owner is the one paying. Their first 90 seconds on the product decide retention.

---

# A. Owner / manager screens

## A1 — Sign in

**Goal.** Get a returning owner into their dashboard in under 8 seconds.
**Main action.** Tap a magic link on their phone after typing email.
**UI elements.**
- Wordmark, single line, top-left of card.
- Subhead: "Sign in to your venue."
- Email field, autofocus, `inputmode="email"`.
- Primary button: `Send sign-in link`.
- Below: faint link "Don't have an account? Set one up — 90 seconds."

**Empty state.** N/A — single field.
**Loading.** Button label flips to `Sending…` and disables. No spinner.
**Error.** Inline below field: `That address isn't registered. Set up a venue first.` plus link.
**CTA.** `Send sign-in link`.
**Microcopy.** "We don't use passwords. The link expires in 15 minutes."
**Retention.** None directly — but every magic-link email is a touchpoint. Subject line carries the venue name back at the owner: "Sign in to TabCall — Otto's Lounge."

---

## A2 — First-run, no venue yet

**Goal.** Push a fresh signup straight into the setup wizard.
**Main action.** Tap `Set up your first venue`.
**UI elements.**
- Empty stage: full-bleed paper, hairline border.
- 32 px display: "You don't have any venues yet."
- 16 px sub: "Three minutes to set one up."
- Primary CTA, single column.

**Empty.** This is the empty state — it's the whole screen.
**Loading.** N/A.
**Error.** N/A.
**CTA.** `Set up your first venue →`.
**Microcopy.** None other than the sub.
**Retention.** Treats setup as the first session of value, not friction. Saves progress on every input so a partial form doesn't lose work.

---

## A3 — Setup wizard

**Goal.** Capture the minimum to print a working QR for the floor: org name, venue name, address, ZIP, timezone, POS, table count.
**Main action.** Tap `Create venue`.
**UI elements.**
- Two-column form on desktop, stacked on phone. Labels above fields. No placeholders that double as labels.
- Sticky right rail (desktop) shows a live preview of the first QR tent so the owner sees value before submit.
- Section headers: 1. About you, 2. About the venue, 3. The floor.

**Empty.** Visible. Fields show their constraints inline ("5-digit ZIP") instead of waiting for blur.
**Loading.** Button to `Creating venue…`. Disable form.
**Error.** Field-level red below the offending input ("ZIP must be 5 digits or 5+4"). Form-level only for network failure.
**CTA.** `Create venue`.
**Microcopy.** Tooltip on POS field: "We don't replace your POS. We send a payment-confirmed signal to your receipt printer."
**Retention.** First-run reward at the end is real (a printable QR tent), so the owner stays through to print.

---

## A4 — Setup success + print QR tents

**Goal.** Owner walks away with paper they can place on tables tonight.
**Main action.** Print or save PDF.
**UI elements.**
- Top: tick + "Otto's Lounge is live." Slug shown in mono.
- Two columns:
  - Left: list of created tables with preview links.
  - Right: large primary CTA card "Print 12 QR tents → letter paper, fold the dotted line."
- Below: secondary "Add staff member →" with a 1-click invite by email.

**Empty.** N/A.
**Loading.** Print preview opens in a new tab (browser native).
**Error.** If PDF generation fails (rare — it's HTML print): fall back to "Open table preview links → screenshot one if you need to."
**CTA.** `Print QR tents`.
**Microcopy.** "Place one tent per table. Replace the wifi card with this — guests learn it in one visit."
**Retention.** Prompts the second action (invite staff) before they leave the page. Day 1 with 1 table + 1 staff is functional.

---

## A5 — Live floor (manager dashboard)

**Goal.** Single glance answers: "What's open right now? How long has it been waiting? Who's handling it?"
**Main action.** Acknowledge an unhandled request, or open one for detail.
**UI elements.**
- Header strip: venue name, current time, online staff count, "since open" total (e.g. "47 served · 4:12 avg ack").
- Main: a 4-column grid of request cards. Each card:
  - Top-left, 24 px: table label.
  - Below: request type word ("Drink", "Bill", "Help", "Refill").
  - Right corner: live age `2:13` in mono, recoloring at 60 / 180 sec.
  - Bottom: assignee chip if acknowledged, otherwise none.
- Right rail: filter pills (`All`, `Open`, `Acknowledged`, `Bar`, `Patio`). Persistent.

**Empty.** "Floor's quiet." 14 px, slate-500, centered. Below: faintly, the median wait time for the past hour. Resists the urge to be cute.
**Loading.** First paint shows skeleton cards in the same grid. Cards swap atomically — never flash.
**Error.** If socket disconnects: persistent banner at top, `Reconnecting…`, no modal blocking.
**CTA.** `Got it` on each pending card.
**Microcopy.** None on the cards themselves — type and table speak for themselves. The age is the message.
**Retention.** This is the surface the owner stares at during dinner rush. Performance is the design. <500 ms ack → push round trip. The dashboard rewards the staff who hit it: a small `★` badge accumulates next to the fastest server's chip every Friday.

---

## A6 — Request detail drawer

**Goal.** Show context for a request without leaving the floor view.
**Main action.** Acknowledge, or escalate to manager.
**UI elements.**
- Right-side drawer, 480 px, slides in over the grid (grid stays visible at 60%).
- Top: table, type, age (live).
- Middle: optional guest note in italic. Session bill so far below it (running tab line items + subtotal).
- Bottom: two buttons. Primary `Got it`. Secondary `Escalate`.
- Tertiary, very small: `Resolve` — used after delivery.

**Empty.** N/A.
**Loading.** Drawer animates in immediately; bill section shows skeleton until joined query returns.
**Error.** If acknowledge POST fails: button reverts, inline `Couldn't reach server. Try again.`
**CTA.** `Got it`.
**Microcopy.** On escalate: "Pings the manager via push. Use when no one on the floor can take it in 60 seconds."
**Retention.** Drawer pattern means the manager never loses the floor's pulse — the grid behind keeps animating. Cognitive load stays put.

---

## A7 — Bad-review feed

**Goal.** Show the owner exactly which guests left 1–3 stars this week, classified by why.
**Main action.** Read a card. Optionally mark as seen, optionally reply (Phase 2).
**UI elements.**
- Page header: `Reviews — past 7 days`. To its right, the count of unseen 1–3 stars.
- Grid of 12-column rows:
  - 2 cols: timestamp + table.
  - 1 col: star rating (red if 1–2, amber if 3).
  - 3 cols: AI category chip ("Service speed", "Drink quality"…).
  - 6 cols: guest note in serif (Charter, italic) — distinct from the chrome.

**Empty.** "No bad reviews this week. Eight 4–5 stars went to Google." Reinforces what's working.
**Loading.** Skeleton rows.
**Error.** Cached previous fetch with banner `Stale — last refreshed at 18:42`.
**CTA.** `Mark all seen` in the header.
**Microcopy.** Above the feed: "We never email a guest. We surface their note here so you can fix the cause, not the symptom."
**Retention.** This is the page that justifies the subscription on Monday morning. Gives the owner ammunition for staff feedback. Add a `Share with manager` action that sends a clean PDF (already built via `@react-pdf/renderer`).

---

## A8 — Settings

**Goal.** Owner finds the toggle they need without reading a manual.
**Main action.** Modify one specific thing — Stripe Connect status, branding, staff list, escalation timings.
**UI elements.**
- Left rail: 6 sections (`Venue`, `Branding`, `Staff`, `Payments`, `Notifications`, `Billing`).
- Right pane: one section at a time. Section is a vertical sequence of grouped rows; each row is `Title · Help text · Control`. Save is **per-row** (instant) where safe; bulk forms only when ordering matters.
- Stripe Connect status row shows live state — `Connected · Payouts active`, or `Action required` with a single CTA to finish onboarding.

**Empty.** Sections that would be empty (e.g. Staff with 0 invites) show a single inline empty state inside the pane. Never blank.
**Loading.** Per-row skeletons; controls disabled.
**Error.** Per-row inline error, plus a single page-level toast.
**CTA.** None at page level. Each row is its own CTA.
**Microcopy.** Help text uses imperative mood: "Set escalation to 90 seconds for fast bars, 3 minutes for fine dining."
**Retention.** The Stripe Connect re-onboarding flow lives here, and it's the most common reason an owner returns mid-week. Surface it at the top of the section if action is required.

---

# B. Staff PWA screens

## B1 — Magic-link sign in (mobile)

**Goal.** Servers, who are usually off the clock when invited, sign in once and stay signed in.
**Main action.** Tap email field, type, `Send sign-in link`, leave.
**UI elements.**
- Logomark only, no horizontal wordmark — saves vertical room.
- Single email field, large (44 px tap target).
- Primary CTA, full-width.
- Below: `If your manager hasn't added you yet, ask them.` — sets expectation when the first attempt fails.

**Empty.** N/A.
**Loading.** Button label `Sending…`. Disable.
**Error.** Inline. Never reveal whether the email is registered (privacy + manager workflow).
**CTA.** `Send sign-in link`.
**Microcopy.** Sent state: "Check your phone. The link opens this app and signs you in automatically."
**Retention.** 30-day session cookie + iOS/Android `Add to Home Screen` prompt after first sign-in. A staff member who installs uses TabCall like a real app, not a website.

---

## B2 — Live queue

**Goal.** Server walks toward the table that needs them, no thought required.
**Main action.** Tap `Got it` on the topmost card.
**UI elements.**
- Sticky header: venue name (small), `Sign out` icon top right. Centered: "Live queue" + count.
- Vertical list of request cards (single column on phone). Each card:
  - 88 px minimum height (one-thumb reachable).
  - Left: table label, 20 px bold; below it the request type, 14 px slate.
  - Right: live age `1:42` mono, bigger as it grows.
  - Bottom row: full-width primary `Got it` (or "X is on it" if acknowledged) + small secondary `Done` to resolve.
- Background polls every 30 s as a safety net. WebSocket pushes everything else.

**Empty.** "Nothing on the floor right now." 14 px slate-500. No illustration.
**Loading.** Three skeleton cards on first paint.
**Error.** Top banner `Reconnecting…` while socket reconnects. No blocking modal.
**CTA.** `Got it`.
**Microcopy.** Toast on ack: `Acknowledged · table is notified`. Auto-dismiss in 1500 ms.
**Retention.** The age recolor is what brings them back the next shift — staff become competitive about hitting "green" ack times. Friday show-and-tell card shows the staff with the lowest median for the week.

---

## B3 — Add bill item (staff)

**Goal.** A server adds a drink to a guest's tab in under 3 taps.
**Main action.** Tap a quick-pick button, confirm.
**UI elements.**
- Triggered from a request detail (or directly from a table dot in a future floor map).
- Top: table label.
- Body: a 2-column grid of "quick picks" — the venue's 6–8 most-ordered items configured in admin. Each tile is `Item · price` in mono.
- Below: `Custom…` button → opens a modal with full menu (categories on the left, items on the right).
- Footer: running tab summary + `Done`.

**Empty.** "Add your first menu item to enable quick picks." Direct link to admin menu page.
**Loading.** Optimistic — the item appears in the running tab instantly; shows a spinner only if the POST fails.
**Error.** Toast `Couldn't add. Try again.` Item rolls back from the tab.
**CTA.** Item tile is the CTA. `Done` returns to the queue.
**Microcopy.** None per tile — name + price is enough.
**Retention.** "Quick picks" become muscle memory. Staff prefer this to the venue's POS because it's two taps shorter — that preference is the moat.

---

# C. Guest screens (owner-relevant excerpt)

The owner doesn't see these directly but will scrutinize them on a tour. They are the surface their customers actually touch.

## C1 — QR landing

**Goal.** A guest knows where they are, what the app does, and what to do next, in 2 seconds.
**Main action.** Tap one of four large request buttons.
**UI elements.**
- Top: venue logo or wordmark. Below: table label in the venue's brand color.
- Body: 2×2 grid of request buttons, 88 px tall — one-thumb reach in dim light.
  - `Order a drink`
  - `Get the bill`
  - `Need help`
  - `Refill`
- Footer, 11 px slate-400: `Powered by TabCall`.

**Empty.** N/A — buttons are always present.
**Loading.** Page renders fully via SSR (1 round trip). Below the fold, an offline-tolerant fallback message if JS fails: "Tap a button. We'll alert your server."
**Error.** Expired QR → calm message "Ask your server for a fresh QR." No spinners, no backtraces.
**CTA.** Each button is the CTA.
**Microcopy.** Confirmation: "Server's on the way." Then, when staff acks: "👋 Someone's heading over."
**Retention.** Optional: post-bill "Save for next time" prompt offers SMS opt-in for happy hour pings (Phase 2). MVP stays cookie-only.

---

## C2 — Bill review + tip

**Goal.** Guest sees a clear bill with no surprises and chooses a tip in one tap.
**Main action.** Tap a tip preset, then `Continue`.
**UI elements.**
- Itemised list, each row: `qty × name` left, price right, mono.
- Total block: subtotal, tax, tip (live), grand total — type weight ramps to total.
- Tip selector: 3 chips `15% · 20% · 25%` plus a numeric custom field. Chips show the dollar amount under each percentage so the guest is choosing money, not maths.
- Primary CTA full-width: `Continue · $X.XX`.

**Empty.** "No items yet on this tab. Wave at your server." (rare; covers a brand-new session).
**Loading.** Skeleton rows.
**Error.** "Couldn't load your bill. Refresh — we'll try again."
**CTA.** `Continue · $X.XX`.
**Microcopy.** Beneath the chips: "Tip goes 100% to staff."
**Retention.** Tip selector defaults to 20%, the venue can tune. The honesty of "100% to staff" lifts default tip 4–6 points (cf. industry data on tipping disclosure).

---

## C3 — Stripe Payment Element

**Goal.** Guest pays without leaving the page.
**Main action.** Tap `Pay $X.XX` after entering payment.
**UI elements.**
- Stripe-hosted iframe inside a card. Apple Pay / Google Pay buttons surface above the card form when available.
- Back button labelled `Back · change tip`.
- Primary CTA: `Pay $X.XX`.

**Empty.** N/A.
**Loading.** Stripe's own loading shown inside the iframe; our parent screen shows the unchanged total above.
**Error.** Stripe surfaces card declines inline. We add a fallback line: `Try a different card or tap Back to use Apple Pay.`
**CTA.** `Pay $X.XX`.
**Microcopy.** Below the button, 11 px: `Encrypted by Stripe.`
**Retention.** Save card prompt — Phase 2 only after a verified return visit cookie.

---

## C4 — Feedback (5 ★)

**Goal.** Capture quality signal in 1 tap; route bad reviews privately.
**Main action.** Tap a star.
**UI elements.**
- Display: "How was tonight?"
- 5 large stars in a row, 64 px tall. Tap fills.
- Behaviour:
  - 4–5: tile with venue logo + `Leave a Google review →` deep-link to `search.google.com/local/writereview?placeid=…`.
  - 1–3: textarea labelled `What went wrong?`, optional, max 400 chars. Submit `Send privately`.
- Below textarea, 11 px: "We never publish private notes. They go to the manager only."

**Empty.** N/A.
**Loading.** "Sending…" inside button.
**Error.** Retry inline; never block the submit if Anthropic is down — submit anyway, classification happens later.
**CTA.** `Send privately` or `Leave a Google review`.
**Microcopy.** After 5 stars: "Thanks. Tell Google." After 1–3: "We've passed your note to the manager."
**Retention.** This is the surface that protects the venue's public score. The asymmetric routing (5 → Google, 1–3 → manager) is the product. Explain it once, in microcopy, then let the design carry the message.

---

# Cross-cutting principles

1. **No spinners on first paint.** Every screen shows real structure (skeletons that match final layout) within 100 ms. Spinners are admissions of failure.
2. **Numbers earn their place.** Times in mono, money in mono. Body in proportional. Mono carries authority and lines up vertically — Swiss does this.
3. **One primary action per screen.** Multiple buttons of equal weight is the failure mode. The primary CTA is darker, larger, or both — never both colored and outlined.
4. **Microcopy never apologizes for the product.** "We don't email guests" not "Sorry we can't email guests." "Reconnecting…" not "There seems to have been an issue connecting."
5. **Retention is structural, not promotional.** Speed is the loop. The owner returns because the floor is faster. The staff returns because the queue cleared faster than POS. The guest returns because they never had to wave.

---

# Build priority for design pass

1. A5 (live floor) — biggest perceived value, first impression of the product.
2. B2 (staff queue) — the surface your buyers will actually use Friday night.
3. C1 / C2 / C4 (guest 3-pack) — the demo path you'll walk an owner through.
4. A4 (setup success) — the moment the owner decides to print or quit.
5. A7 (bad-review feed) — Monday morning's killer hook.

Everything else is supportive.
