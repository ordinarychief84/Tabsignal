# TabCall — User Guide

A complete walk-through of TabCall for everyone who touches the
system — from the guest scanning a QR at the bar to the TabCall
founder watching the platform.

> **Editions covered**
> - Starter (free + 0.5%/transaction)
> - Growth ($99/mo per venue — menu, pre-order, analytics, splits, tip pools)
> - Pro ($299/mo per venue — multi-location, regulars, reservations, loyalty)
>
> Every screen and flow below is the same across editions; **plan
> gates** are called out where they apply.

---

## Table of contents

1. [What is TabCall](#1-what-is-tabcall)
2. [Roles in one paragraph](#2-roles-in-one-paragraph)
3. [Sign-up: the first 3 minutes](#3-sign-up-the-first-3-minutes)
4. [Onboarding wizard](#4-onboarding-wizard)
5. [Guest experience (no account, just a QR)](#5-guest-experience-no-account-just-a-qr)
6. [Staff experience (server, bartender, host)](#6-staff-experience-server-bartender-host)
7. [Manager experience (Owner / Manager role)](#7-manager-experience-owner--manager-role)
8. [TabCall founder / operator](#8-tabcall-founder--operator)
9. [Roles & permissions matrix](#9-roles--permissions-matrix)
10. [Audit log](#10-audit-log)
11. [Notifications & email routing](#11-notifications--email-routing)
12. [Billing & plan changes](#12-billing--plan-changes)
13. [Security](#13-security)
14. [Troubleshooting](#14-troubleshooting)
15. [Glossary](#15-glossary)
16. [Support](#16-support)

---

## 1. What is TabCall

TabCall sits **on top of** your existing POS (Toast, Square, Clover,
or none at all) and gives every guest a four-button request screen
on their own phone — no app, no install, no account.

What the guest sees:

- A QR sticker on their table
- One scan opens a tiny web page branded with your venue
- Four big buttons: **Drink · Bill · Refill · Help**
- After paying: a star prompt that **catches 1–3★ ratings before they
  hit Google**

What you (the operator) get:

- A live request queue ranked by table, age, and urgency
- Bills that close in ~90 seconds at the table (Apple Pay / Google
  Pay / card)
- Bad reviews emailed privately to your inbox with the table, the
  server, and the AI's best guess at what went wrong
- Per-server analytics, tip pools, regulars dossier, reservations
  (depending on plan)

The whole product is designed so a guest never has to **wave** at
a server again, and so the server never has to **guess** which
table needs them next.

---

## 2. Roles in one paragraph

TabCall has six effective roles. Five live on a venue's
`StaffMember` row; one (PLATFORM) is reserved for TabCall internal
staff via the `OPERATOR_EMAILS` env.

| Role | One-liner |
|------|-----------|
| **Owner** | Created the venue. Can do anything — change billing, add other Owners, remove staff. |
| **Manager** | Can do everything an Owner does **except** create other Owners/Managers and change the billing plan. |
| **Server** (a.k.a. Bartender) | Works the floor app. Acks requests, hands off, resolves, sees the live queue. |
| **Host** | Like Server but focused on door + reservations. |
| **Viewer** | Read-only. Sees reports, audit log, billing — touches nothing. |
| **Platform (TabCall)** | TabCall internal staff. Invisible to venues; can impersonate, broadcast, flip plans. |

Every role gate is enforced server-side via the central matrix in
`lib/auth/permissions.ts`. The People page UI greys out buttons your
role can't trigger anyway.

---

## 3. Sign-up: the first 3 minutes

> **Audience:** the founder/owner of a new venue.
> **URL:** https://www.tab-call.com/signup

1. Visit the signup page.
2. Fill in:
   - **Your email** — becomes your sign-in identity. You'll get a
     magic-link email here every time you log in.
   - **Your name** — shows up on staff lists.
   - **Venue name** — e.g. "Otto's Lounge". A URL slug is auto-derived
     (`otto-s-lounge`); if it's taken, a 4-character suffix is added.
   - **ZIP code** — drives sales-tax math.
   - **Tables (rough)** — defaults to 6. We pre-create that many
     tables; you can rename/add/remove later from **Settings →
     Tables**.
   - **Timezone** — Central by default. IANA name. Affects how
     analytics buckets the day.
3. Click **Email me a sign-in link**.
4. Within ~5 seconds your inbox gets an email from
   `alerts@tab-call.com` with subject "Sign in to TabCall — [your
   venue]".
5. Click **Open the staff app** in the email (or paste the link in
   any browser). The link is single-use and expires in 15 minutes.
6. You land on the **Onboarding wizard** at
   `/admin/v/[slug]/onboarding`.

> **Heads up** — if the email never arrives, check spam first. If
> still nothing, look for a coral "Account created — but the email
> didn't go out" card on the signup page; that means our email
> provider failed to deliver and you should email
> `support@tab-call.com`.

---

## 4. Onboarding wizard

A three-step checklist that takes 3–5 minutes. You can **Skip to
dashboard** at any time and come back to any unfinished step from
the sidebar.

### Step 1: Connect Stripe (required to take payments)

1. Click **Connect Stripe →**.
2. Stripe-hosted onboarding opens in a new tab.
3. Verify business identity (driver's license + bank routing
   numbers — 3–5 minutes; do it on your phone if you have your ID
   handy).
4. Stripe redirects back to TabCall. The wizard step flips to ✓ and
   the dashboard's red "Action needed" banner disappears.

> Until Stripe is fully connected, guest bills can't close.
> Requests, ratings, and analytics still work.

### Step 2: Print your QR tents

Auto-completed because we created tables for you on signup.

1. Click **Open printer →** to view a printable PDF of QR tents — one
   per table, with the table label on the back.
2. Print. Place one tent on each table.

### Step 3: Invite a staff member (optional)

You can do this later from **People** in the sidebar. Inviting a
teammate is just typing their email + name + role and clicking
**Send invite**. They get a magic link the same way you did.

---

## 5. Guest experience (no account, just a QR)

> **Audience:** the person at the table.
> **URL:** opens via QR scan — `https://www.tab-call.com/v/[slug]/t/[tableId]?s=[qrToken]`

The guest never logs in. They never download an app. The whole
experience runs in their phone's web browser.

### A. Tap the QR

The first scan opens a **tiny landing page** branded with the venue's
name and table label ("Otto's Lounge — Table 7"), plus four giant
buttons:

| Button | What happens behind the scenes |
|--------|--------------------------------|
| **Drink** | Creates a `Request{type:DRINK}`. Closest server's phone buzzes within 1 second. |
| **Bill** | Creates a `Request{type:BILL}` AND opens the bill view. |
| **Refill** | Same as Drink but tagged Refill (lower priority). |
| **Help** | High-priority alert. All assigned staff get pinged. |

### B. Pay the bill

When the guest taps **Bill** (or staff hits "Bring the bill"):

1. The bill view shows every line item, tax, and a tip slider with
   four preset percentages (15 / 18 / 20 / 25%) — defaults to 20%.
2. The guest picks a payment method:
   - **Apple Pay / Google Pay** — one tap
   - **Card** — Stripe-hosted card form
3. Tap **Pay $X.XX**. Stripe authorizes within 1–2 seconds.
4. Once the webhook lands, the page flips to a "Tab paid · Thanks
   for visiting" state.

### Bill split (Growth+ plan)

From the bill view, the guest can tap **Split** to choose:
- **Even split** — N people, each pays the same.
- **By person** — name each tab.
- **By card** — multiple cards on the same total.

Each split gets its own client secret. The bill closes only when
every split is paid.

### C. Rate the visit

After payment, every guest sees a 1–5 star prompt:

- **5★ → "Tell the world"** — opens a one-tap link to your Google
  reviews page (only if you've set Google Place ID in Settings).
- **4★ → "Tell the world"** — same Google link.
- **1–3★ → "Tell the staff"** — opens a private free-text box. Their
  note is sent to our AI, classified into one of:
  *service_speed / drink_quality / staff_attitude / wait_time / food
  / noise / other*, and emailed to your alert recipients within ~30
  seconds. **The guest never sees a public review form.**

### Pre-order at the QR (Growth+ plan)

If the venue has a menu and pre-order is enabled:

1. Tap **Browse menu** on the landing page.
2. Add items to cart with quantity.
3. Pay (Apple Pay / Google Pay / card) — 0.5% platform fee + Stripe.
4. Get a 4-digit pickup code.
5. Staff queue gets the order, marks it READY → PICKED_UP.

### Reservations (Pro plan)

If reservations are on, the guest can book by tapping
**Reservations** at the venue's public landing page
(`/v/[slug]/reservations`) — or from a deep link the venue posts.
Confirmation by SMS (if Twilio is set) or email.

---

## 6. Staff experience (server, bartender, host)

> **Audience:** anyone with `StaffMember.role IN (SERVER, HOST)`.
> **URL:** `https://www.tab-call.com/staff` (PWA — installable on iPhone
> or Android).

### A. First sign-in

1. Manager invites you from **People** with role = Server (or Host).
   You receive a magic-link email at the address they entered.
2. Click the link → land on `/staff`.
3. Add to home screen on iPhone or "Install app" on Android — gives
   you a fullscreen icon and proper notifications.

### B. The live queue

The main screen is **a single ranked list of every open request at
your venue**, age-sorted with the oldest at the top. Each row shows:

- Table label (Bar 2, Table 7, Patio 3)
- Request type icon (Drink / Bill / Refill / Help)
- Age in `mm:ss` — turns coral when > 3 minutes
- Status pill: **Pending** / **On it** / **Delayed**

> **The 3-minute rule** — any request over 3 minutes turns coral
> and re-pings every server assigned to that table.

### C. Acknowledge / hand-off / resolve

- Tap a row → see the request details and three actions:
  - **On it** — claims the request. Other servers see your name
    on it.
  - **Hand off** — pass to a specific other staff member.
  - **Resolve** — mark done. Resolution actions: *served / paid /
    chatted / declined*.

### D. ID check (compliance)

If the venue has *Check ID on first drink* enabled (Settings →
Compliance), the first DRINK request from every fresh tab shows a
coral "Check ID" badge. You **must** verify ID before tapping
Resolve.

### E. Tables you cover

Your assigned tables (set by your manager from the People page) are
tagged on requests with a green "yours" pill. You still see every
request in the venue (so you can pitch in), but yours surface
first.

### F. Notifications

The PWA uses browser push when granted. If push isn't available
(some iOS setups), the app polls every 5 seconds and the badge on
your home-screen icon flashes when something's new.

---

## 7. Manager experience (Owner / Manager role)

> **Audience:** `StaffMember.role IN (OWNER, MANAGER)`.
> **URL:** `https://www.tab-call.com/admin/v/[slug]/...`

The manager dashboard has a left sidebar with every section grouped
by purpose. Plan-gated items show a `GROWTH` or `PRO` chip if your
org isn't on that tier.

### Sidebar map

| Section | What lives there |
|---------|------------------|
| **Dashboard** | Live floor — open requests, served today, median ack, staff online. Real-time WebSocket. |
| **Analytics** (Growth) | Revenue, requests volume, response times, by-server breakdowns, peer benchmarks. |
| **Menu** (Growth) | Categories + items + prices. Drag to reorder. |
| **Specials** | Promotions / happy-hour cards shown on the guest landing. |
| **Orders** (Growth) | Pre-orders queue (paid → ready → picked up). |
| **Reservations** (Pro) | Booking calendar + waitlist. |
| **Regulars** (Pro) | Per-guest dossier — name, usual drink, allergies, last-feedback note. Shown to bartenders' PWA when paired guests walk in. |
| **Reviews** | Every 1–3★ feedback report, AI-classified. Mark seen, reply via email. |
| **People** | Staff list. Invite, change role, suspend, remove, assign tables. |
| **Audit log** | Append-only record of staff invites, role changes, suspensions, removals. |
| **Tips** (Growth) | Tip pools by shift / by server. |
| **Tables** | Add / rename / remove tables. |
| **QR tents** | Print one tent per table. |
| **Billing** | Stripe Customer Portal link, plan tier visibility, payment method, invoices. |
| **Settings** | Venue identity, Stripe Connect, branding, compliance, alert routing, kill switches, account security. |
| **Operator console ↗** | Visible only if your email is in `OPERATOR_EMAILS` (TabCall internal staff). |

### People page (the heart of staff management)

Three sections:

1. **Pending invites** — sent magic-link, never signed in. You can
   **Resend invite** if it expired or got lost.
2. **Active team** — currently signed-in-eligible. Each row:
   - Avatar circle (initials)
   - Name + email + "you" badge if it's you
   - Role chip — Owner / Manager / Server / Host / Viewer (color-coded)
   - Status chip — ACTIVE / INVITED / SUSPENDED
   - Last seen relative timestamp
   - Invited-by attribution
   - Tables they cover
   - **⋯ menu**: Edit tables / Resend invite / Suspend / Reactivate / Remove
3. **Suspended** — collapsed list of disabled accounts (kept for audit).

#### Inviting

Top of the page: **Invite a teammate** card. Type name + email,
pick a role from the dropdown (Manager / Server / Host / Viewer if
you're a Manager; full list including Owner if you're an Owner),
hit **Send invite**. They get a magic-link email immediately.

#### Changing a role

Click the role chip on any row → dropdown opens → pick the new
role. Saves instantly. Audit emit fires.

#### Suspend vs. Remove

- **Suspend** — soft-disable. Their session is invalidated on next
  page load (the callback refuses SUSPENDED rows with
  `?err=suspended`). Row stays in the audit history. Reversible.
- **Remove** — hard delete. Only Owners can. The row is gone for
  good. Audit row fires before delete so the email + role are
  preserved in history.

> **Last-Owner protection** — the system refuses to suspend, demote,
> or remove a venue's only Owner. You'll see a `409 LAST_OWNER`
> error. Promote someone else first.
>
> **Self-action protection** — you can't suspend or remove yourself.

### Settings page

Eight cards. The most important ones:

- **Venue** — name, address, ZIP (drives sales tax), timezone.
- **Payments — Stripe Connect** — current state + reconnect button.
- **POS bridge** — read-only; structural changes are concierge.
- **Branding** — hex brand color + logo (used on the QR pages).
- **Compliance** — Check ID on first drink toggle (TABC for Texas).
- **Reviews routing** — Google Place ID. Without it, 5★ ratings show
  a generic thanks instead of a one-tap Google review link.
- **Alerts routing** — comma-separated emails for bad-rating
  intercepts.
- **Account security** (NEW) — Sign out everywhere. Today: clears
  local cookie + emits audit. Phase-2: server-side invalidation of
  other devices.
- **Tonight** — three kill switches (request queue / pre-order /
  reservations). Flip off when the kitchen is slammed; existing
  data is preserved.

### Audit log page

Every sensitive action across the venue, append-only:

- `staff.invited`
- `staff.invite_resent`
- `staff.role_changed` (with from→to)
- `staff.suspended` / `staff.reactivated`
- `staff.removed`
- `staff.sign_out_everywhere`

Each row shows actor email + role + timestamp + a human-readable
summary. First 100 entries server-rendered; older history via
`/api/admin/audit?before=<ISO>`.

---

## 8. TabCall founder / operator

> **Audience:** anyone in `OPERATOR_EMAILS` (Vercel env).
> **URLs:** `/founder` shortcut → `/operator/...`

### How to become an operator

Add your email to `OPERATOR_EMAILS` in Vercel (Settings → Environment
Variables → Production), comma-separated, redeploy. From that point
on:

- Magic-link sign-in via `/staff/login` auto-redirects you to
  `/operator` (when you don't specify a `next`).
- You bypass every venue role gate (treated as OWNER everywhere).
- The venue admin sidebar shows an "**Operator console ↗**" link.

> **Bookmark `https://www.tab-call.com/founder`** — single-purpose
> shortcut that redirects you to `/operator/settings` (operators) or
> `/admin` (venue users) or `/staff/login` (unauthenticated).

### Operator console (`/operator`)

Top header: **OPERATOR** pill + Console / Audit log / Settings nav.

- **KPI cards** — Orgs / Venues / Staff seats / Guests-24h / Paid-24h.
- **Recent venues** — 6 most recent, click "open ↗" to drill in.
- **All organizations** — full list, expandable per-org venues.

### Per-org pages

`/operator/orgs/[orgId]/`:
- **Overview** — org KPIs.
- **Members** — org-level admins, impersonate any staff.
- **Venues** — org's venues.
- **Billing** — flip plan (Starter ↔ Growth ↔ Pro). Platform-staff
  only (other org-roles get 403).
- **Broadcast** — push a banner notice to every venue in the org.

### Cross-venue audit log (`/operator/audit`)

Every staff action across every venue, joined with venue + org. Row
links jump back into the per-venue audit page. API:
`/api/operator/audit?action=…&actor=…&orgId=…&before=…`

### Platform settings (`/operator/settings`)

Six cards:

1. **OPERATORS (OPERATOR_EMAILS)** — current allowlist with "you"
   badge. Instructions for adding more (Vercel env edit + redeploy).
2. **PLAN PRICING** — Stripe price ID env presence per plan.
3. **INTEGRATIONS** — live/partial/unset chips for Stripe, Resend,
   Upstash, Sentry, Anthropic, Twilio, Supabase Storage, public
   origin, realtime (Fastify), cron secret. **Per-env-var ✓/✗ list**
   inline.
4. **LIVE COUNTS** — orgs / venues / staff seats / 24h signups /
   7d audit entries.
5. **DEPLOYMENT** — Vercel region, env, commit SHA (7 chars), branch,
   Node version.
6. **QUICK LINKS** — buttons to Vercel, Stripe, Resend, Upstash,
   Sentry, Supabase dashboards.

---

## 9. Roles & permissions matrix

The full RBAC truth table from `lib/auth/permissions.ts`:

| Permission | Owner | Manager | Server | Host | Viewer |
|------------|:-----:|:-------:|:------:|:----:|:------:|
| `staff.invite` | ✓ | ✓ | – | – | – |
| `staff.role.assign_manager` | ✓ | – | – | – | – |
| `staff.role.assign_below_manager` | ✓ | ✓ | – | – | – |
| `staff.suspend` / `reactivate` | ✓ | ✓ | – | – | – |
| `staff.remove` | ✓ | – | – | – | – |
| `staff.assign_tables` | ✓ | ✓ | – | – | – |
| `staff.list` | ✓ | ✓ | – | – | ✓ |
| `venue.edit_settings` | ✓ | ✓ | – | – | – |
| `venue.kill_switch` | ✓ | ✓ | – | – | – |
| `stripe.connect_onboarding` | ✓ | ✓ | – | – | – |
| `billing.view` | ✓ | ✓ | – | – | ✓ |
| `billing.change_plan` | ✓ | – | – | – | – |
| `menu.edit` | ✓ | ✓ | – | – | – |
| `tables.edit` | ✓ | ✓ | – | – | – |
| `specials.edit` | ✓ | ✓ | – | – | – |
| `tip_pools.manage` | ✓ | ✓ | – | – | – |
| `preorders.manage` | ✓ | ✓ | ✓ | – | – |
| `reservations.manage` | ✓ | ✓ | ✓ | ✓ | – |
| `reviews.view` / `respond` | ✓ | ✓ | – | – | view-only |
| `regulars.view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `regulars.edit` | ✓ | ✓ | – | – | – |
| `audit.view` | ✓ | ✓ | – | – | ✓ |
| `requests.acknowledge` / `handoff` / `resolve` | ✓ | ✓ | ✓ | ack | – |

PLATFORM (TabCall internal) inherits OWNER everywhere.

---

## 10. Audit log

Two scopes:

- **Per-venue** — `/admin/v/[slug]/audit` — what happened in this
  venue. Visible to Owner / Manager / Viewer / Platform.
- **Cross-venue** — `/operator/audit` — what happened anywhere.
  Operator-only.

Action verbs are dot-namespaced (`staff.role_changed`,
`staff.suspended`). The metadata column carries structured context
like `{from: "SERVER", to: "MANAGER", email: "..."}`.

The audit emit is fire-and-forget — a failed audit insert never
blocks a successful staff action. Errors land in `console.error` so
Sentry catches them.

---

## 11. Notifications & email routing

TabCall sends three classes of email:

1. **Magic-link sign-in** — to the staff member's email.
2. **Bad-rating intercept** — to the venue's `alertEmails` (set in
   Settings → Alerts routing) or fallback `OPERATOR_EMAILS`.
3. **Reservation confirmation** — SMS via Twilio if configured;
   otherwise email.

**Sender domain:** `alerts@tab-call.com` (verified in Resend).

If an email send fails:
- The action that triggered the send still succeeds (we never roll
  back a venue creation on email failure).
- The signup form shows a coral "didn't go out — contact support"
  card so the user knows.
- Vercel logs get a structured `[signup] email send failed` line you
  can grep.

---

## 12. Billing & plan changes

### Self-serve

- **Starter** → free; you signed up into it.
- **Growth / Pro** — visit `/admin/v/[slug]/billing` → click
  **Upgrade**. Stripe Checkout opens in a new tab. After payment,
  the org's `subscriptionStatus` flips to ACTIVE on the next
  webhook (~1 second).

### Concierge

For Growth/Pro, TabCall typically books a 15-minute setup call to
wire up payouts, menu sync, and staff seats. Email
`hello@tab-call.com` to schedule.

### Platform-side (TabCall founder)

Visit `/operator/orgs/[orgId]/billing` → pick a plan → flip. This
**does not charge** the org via Stripe — it just updates the DB
state. Pair with a manual Stripe Subscription if you want
recurring billing.

### Customer Portal

From `/admin/v/[slug]/billing` → **Open billing portal**. Stripe's
hosted portal lets the venue cancel, update card, view invoices.

---

## 13. Security

| Surface | Protection |
|---------|------------|
| Magic-link tokens | 15-minute TTL, single-use, `jti` enforced via `LinkTokenUse` table |
| Session JWT | 30-day TTL, HttpOnly + SameSite=lax + Secure-in-prod cookie |
| Guest QR token | Required to resolve a guest session (no token = "QR expired" page) |
| Bill GET | Requires session token; `timingSafeEqual` compare |
| Realtime socket | Short-lived signed JWT issued by `/api/realtime/token` |
| Stripe webhook | Signature verification (live + test secret tried in sequence) |
| Auth-start | Rate-limited 8/email/hour + 30/IP/hour via Upstash |
| HTML interpolation in emails | All guest fields escaped via `escapeHtml()` |
| Self-action / last-Owner | Server-side guards on suspend / remove / role-change |

Other-device sign-out is in Phase-1 (clears local cookie +
audit-emits). Phase-2 will add `StaffMember.sessionsValidAfter` for
true server-side invalidation.

---

## 14. Troubleshooting

### "Sign-in link has expired"

Magic links live 15 minutes. Click **Send sign-in link** again.

### "That isn't your venue"

Your session cookie is for venue A but you navigated to venue B's
admin. Click **Sign out** and re-issue a link to the right email.

### "Suspended" error on sign-in

Your account was suspended by a manager. Reactivate from the People
page, or ask another Owner/Manager to do so.

### Magic link arrived but landed on `/staff` instead of `/operator`

If you're an operator, the new redirect (PR #14, deployed
2026-05-11) auto-routes you to `/operator`. If you're on an older
session, manually navigate to `/operator`.

### "Stripe isn't connected — guest bills can't close"

Onboarding step 1 is incomplete. Go to **Settings → Payments** and
click the Stripe button. ID verification takes 3–5 minutes.

### Slug suffix on your venue URL (e.g. `wuka-lounge-mf9o`)

Another venue grabbed `wuka-lounge` first. The system added a
4-character suffix to keep yours unique. You can change the slug
from **Settings** if the original is no longer in use.

### Pre-order / Reservations / Analytics tab is greyed with `GROWTH` or `PRO` chip

Your org is on Starter. Upgrade from **Billing** to unlock.

### Bad-rating email never arrived

Check **Settings → Alerts routing** — is `alertEmails` set?
Otherwise the email goes only to `OPERATOR_EMAILS`. Then check
Resend dashboard logs for delivery status.

---

## 15. Glossary

- **Guest session** — a row in `GuestSession` representing one
  party's tab at one table. TTL 8 hours; replaced when paid.
- **Session token** — a 24-byte hex string stored on
  `GuestSession.sessionToken`. Required by every guest mutation API.
- **QR token** — a per-table secret on `Table.qrToken`. Required to
  even *open* the guest landing page.
- **jti** — JWT id. Used as the single-use key in `LinkTokenUse` so
  a magic link can't be replayed.
- **OrgMember** — org-scoped membership (per Organization, not per
  venue). Used by the operator console.
- **StaffMember** — venue-scoped staff row. The authoritative role.
- **AuditLog** — append-only platform-wide event log.
- **Plan** — `FOUNDING` (legacy), `STARTER`, `GROWTH`, `PRO`. Drives
  feature gates via `meetsAtLeast()`.
- **Connect (Stripe)** — destination charges go to the venue's
  Stripe account; TabCall takes a 0.5% application fee.

---

## 16. Support

| Topic | Where |
|-------|-------|
| General questions | `hello@tab-call.com` |
| Account / sign-in / billing problems | `support@tab-call.com` |
| Outage / something's clearly broken | `support@tab-call.com` (subject `URGENT — [your venue]`) |
| Feature request / feedback | `feedback@tab-call.com` |
| Press / partnership | `hello@tab-call.com` |

System status: visit `/operator/settings` (operators) for live
integration health, or `https://status.vercel.com` for platform
issues.
