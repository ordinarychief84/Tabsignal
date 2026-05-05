# TabCall — Product Requirements Document
**Version 1.1**  ·  **Phase 0 + Phase 1**  ·  **Houston, TX**  ·  **2025**

| | |
|---|---|
| **Status** | Draft — Awaiting Approval |
| **Owner** | Founder / CEO |
| **Engineering Lead** | TBD |
| **Last Updated** | 2026-05-04 |
| **Supersedes** | TabSignal Build Prompt v0 (now reference-only) |
| **Next Review** | Week 3 (post first founding install) |

---

## 1. Product Overview

TabCall is a QR-based guest-to-staff signaling layer for US bars and lounges. A guest scans the table QR, taps what they need (drink, bill, help), and a real-time alert fires to the right staff device in under two seconds — over Socket.io, with FCM push as a cellular fallback. Staff acknowledge with one tap; the guest sees confirmation instantly. Payment, gratuity, and post-visit feedback close the loop without ever leaving the browser. TabCall does not replace the POS — it sits beside Toast, Square, and Clover and uses their webhooks to close tabs and trigger receipt printing. Sold to venue owners as a flat $79/month SaaS, no tiers, no hardware, no app install.

### 1.1 What TabCall is not

TabCall does not replace POS systems. It does not take orders in place of staff. It does not require hardware installation. It is a lightweight attention layer that sits alongside existing workflows — zero disruption, zero retraining.

---

## 2. User Problem

Guests at busy bars and lounges have no reliable way to signal staff. The current "system" is waving, eye contact, and patience. On a Friday at 9pm with a 1:30 server-to-table ratio, this fails predictably:

- **Guests** wait 4–8 minutes for a refill they wanted in 30 seconds. They under-tip, leave early, or post a 2-star review naming a server who never knew they existed.
- **Staff** miss requests they would have served gladly — they're in the well, on a food run, or at another table. They get blamed for "ignoring" guests they never saw.
- **Managers** find out something broke when the review hits Yelp on Monday. There is no real-time signal that service is degrading on a specific table or zone.
- **Owners** lose revenue (uncaptured upsells, smaller tips, faster guest departure) and reputation (1–3 star reviews are the loudest signal in the market). They have no tool that surfaces the problem before it becomes a review.

**Why now:** QR-payment behavior is normalized post-COVID. iOS 16.4 added PWA push. FCM-on-web is stable. The technical stack to deliver this in <2s on cellular exists today — three years ago it did not.

**Current workarounds and why they fail:**
- **Table-side service buttons** (hardware): cost, breakage, staff resistance.
- **POS table tracking**: built for orders, not attention. Doesn't surface "guest is waiting."
- **"Just hire more staff"**: bar margins won't allow it.

---

## 3. Goals

Outcome-oriented. Each goal is measurable and time-bound to Phase 0 + Phase 1.

| # | Goal | Measure | Target |
|---|---|---|---|
| G1 | Prove the core loop works in a real bar | Guest tap → staff ack → guest sees confirmation, end-to-end on Friday rush | Working on 2 founding venues by Week 3 |
| G2 | Convert founding partners to paid | Free founding venues that, after 60 days, would pay $79/mo if asked | ≥3 of 10 say yes by Week 12 |
| G3 | Cut average response time | Time from request → first acknowledgement | <90s by Month 6 |
| G4 | Capture one revenue lift signal per venue | Avg tip %, avg ticket, or refill count up vs pre-install baseline | Measurable lift on ≥1 metric within 30 days post-install |
| G5 | Intercept bad reviews before they go public | 1–3 star feedback delivered to manager via email | 100% of low ratings routed within 60s |

---

## 4. Non-Goals

Explicit. Anything in this list will be declined this version, even if a founding venue requests it.

- **Not a POS.** No order entry by staff, no inventory, no cash drawer.
- **No native apps.** Staff PWA only; no App Store / Play Store submission in v1.x.
- **No AI features.** All routing in Phase 0/1 is rule-based. Sentiment, prioritization, narrative reports are Phase 3.
- **No multi-venue switcher in v1.** Group plan and multi-venue dashboard wait for the second multi-venue customer.
- **No menu builder, no upsells, no loyalty in v1.** Phase 2.
- **No SMS / WhatsApp.** Phase 2.
- **No non-US markets.** ZIP-based tax, US timezones, USD only.
- **No hardware.** No buzzers, no kiosks, no NFC tags. QR codes printed on table tents only.
- **No POS replacement integrations.** We integrate via webhook for tab close + receipt trigger. We do not write orders into the POS.

---

## 5. Audience

### 5.1 End-user personas

| Persona | Context | Primary need | Success looks like |
|---|---|---|---|
| **Guest** (anonymous) | Sat at bar/table on a Friday | Signal staff without waving | Got their drink in <90s, paid in <30s |
| **Server / Bartender** | 6–12 table section, peak rush | Know what each table needs without checking | Zero "I didn't know" moments per shift |
| **Manager** | Floor at peak, office at 2pm | Visibility on service quality in real time | Catches a slow zone before a review hits |
| **Venue Owner** | Reviews app on phone Monday morning | Revenue + reputation signal | Tip % up, no surprise 1-star reviews |

### 5.2 Buyer archetypes (sales targeting)

- **Independent neighborhood bar** (1 venue, owner-operator). Decision in 1 visit. **Highest fit.**
- **Cocktail lounge / wine bar** (1–2 venues). Premium service, high tips, owner cares about reviews. **High fit.**
- **Sports bar / gastropub** (1–3 venues). Big floors, busy nights, junior staff. **Strong fit, longer cycle.**
- **Hotel bar** (chain-owned). **Avoid in v1.x** — procurement cycle too long.

---

## 6. Core Features

The nine features that constitute v1 of TabCall. Phase 0 ships first; Phase 1 ships in priority order after Phase 0 is live in two venues.

| ID | Feature | Phase | Surface |
|---|---|---|---|
| FR-01 | QR Request System | 0 | Guest |
| FR-02 | Real-Time Staff Alert | 0 | Staff |
| FR-03 | Acknowledge + Guest Confirmation | 0 | Staff + Guest |
| FR-04 | Transparent Bill + Gratuity | 1 | Guest |
| FR-05 | Stripe Payment + POS Webhook | 1 | Guest + Backend |
| FR-06 | Escalation Alerts | 1 | Staff + Manager |
| FR-07 | Weekly Service Report (data only, no AI) | 1 | Email |
| FR-08 | Guest Feedback + Google Review Routing | 1 | Guest + Backend |
| FR-09 | Venue Admin Setup (venue, tables, staff, QR codes) | 0 | Admin |

---

## 7. Functional Requirements

### Phase 0  Prove the Concept  Weeks 1–3

Three guest-facing features plus admin setup. This is enough to demo in a bar, sign founding partners, and prove the core pain point is solved. Nothing else gets built until these work perfectly on real devices.

#### FR-01  QR Request System
**PRIORITY: CRITICAL  |  SURFACE: GUEST WEB APP  |  PHASE: 0**

Each table in a venue has a unique QR code that encodes the URL `tabcall.app/v/{venueId}/t/{tableId}?s={token}`. When a guest scans the code, a `GuestSession` is created server-side (8-hour expiry). The guest sees the venue name and six request type buttons.

Request types available to guests:
- Order a drink
- Get the bill
- Need assistance
- Refill / same again
- Food question
- Report an issue

An optional free-text note field (max 120 characters) appears below the request buttons. Guests can add context such as allergy information, a special occasion note, or a specific item request. The note is optional — the request submits without it.

**Acceptance criteria:**
- QR page loads in under 3 seconds on a 3G cellular connection
- Page renders correctly on iPhone Safari, Android Chrome, and devices up to 4 years old
- Tap targets are a minimum of 48px for all interactive elements
- Guest cannot submit more than one request per 30-second window (rate limiting)
- Invalid or expired QR tokens show a clear error message — never a blank page

#### FR-02  Real-Time Staff Alert
**PRIORITY: CRITICAL  |  SURFACE: STAFF PWA  |  PHASE: 0**

When a guest submits a request, two delivery mechanisms fire simultaneously. First, a Socket.io event is emitted to the venue room (`venue:{venueId}`) and received by any staff device actively connected to that room. Second, a Firebase Cloud Messaging push notification is sent to all staff FCM tokens registered for that venue — this fires even when the PWA is in the background or the device is locked.

The push notification payload includes the table label (e.g. Table 7), the request type, any guest note, and the time of submission. Total delivery time from guest tap to staff device buzz must be under 2 seconds on a typical connection.

**Acceptance criteria:**
- Push notification delivers within 2 seconds on standard LTE connection
- Notification fires on staff device even when PWA is minimized or device is locked
- Notification displays table label, request type, and truncated note (first 60 chars)
- If FCM delivery fails, Socket.io serves as fallback for connected devices

#### FR-03  Acknowledge + Guest Confirmation
**PRIORITY: CRITICAL  |  SURFACE: STAFF PWA + GUEST WEB APP  |  PHASE: 0**

The staff queue shows each pending request with an **On my way** button and a **Done** button. When a staff member taps **On my way**, three things happen simultaneously: the request status updates to `ACKNOWLEDGED` in the database, the `acknowledgedAt` timestamp is recorded, and a Socket.io event (`request_acknowledged`) is emitted to the guest's session.

The guest QR page, which maintains an open Socket.io connection after submitting the request, receives the acknowledgement event and updates the UI in real time. The guest sees a confirmation such as **Your server is on the way**. This eliminates the anxiety of not knowing whether anyone received the request.

**Acceptance criteria:**
- Guest screen updates within 1 second of staff tapping acknowledge
- Acknowledgement is attributed to the specific staff member who tapped
- If guest closes and reopens the QR page within the same session, they see the current request status
- **Done** action removes the request from the active queue and sets `resolvedAt` timestamp

#### FR-09  Venue Admin Setup
**PRIORITY: CRITICAL  |  SURFACE: ADMIN PORTAL  |  PHASE: 0**

Owner signs in (NextAuth, email + password) and configures their venue: name, address, ZIP code, timezone, POS type (Toast / Square / Clover / None), Google Place ID. Adds tables (label + zone), generates QR codes per table, downloads a print-ready PDF of QR table tents. Adds staff members (name, email, role: OWNER / MANAGER / SERVER / BARTENDER); staff receive an invite email and set their own password.

**Acceptance criteria:**
- New owner can complete setup and have one functioning table QR live in under 10 minutes
- QR PDF prints at 300 DPI minimum, table label visible under bar lighting
- Staff invite email lands within 60 seconds, link valid for 7 days
- Owner cannot accidentally point a venue at another organization's POS webhook

---

### Phase 1  First Paying Features  Weeks 4–8

Five features added after Phase 0 is proven live in a bar. Transparent bill and POS webhook payment are built first and together — they justify the $79/month subscription. The remaining three follow in order as founding venues request them.

#### FR-04  Transparent Bill + Gratuity
**PRIORITY: CRITICAL  |  SURFACE: GUEST WEB APP  |  PHASE: 1 — BUILD FIRST**

When a guest taps the **Close my bill** request type, the QR page transitions to a bill summary screen. The screen displays a line-item breakdown of everything ordered in the session, a subtotal, sales tax calculated automatically from the venue's ZIP code using a US state rate lookup table, and a gratuity selector.

The gratuity selector presents four options: 15%, 18% (pre-selected by default), 20%, and Custom. When the guest changes the tip selection, the grand total updates immediately without a page reload. The pre-selected 18% is intentional — research shows pre-selection increases average tip percentage compared to a blank field.

**Acceptance criteria:**
- All line items from the `GuestSession` are displayed with name, quantity, and price
- Tax rate is calculated from the venue ZIP code — no manual entry by the guest
- 18% gratuity is pre-selected on bill load
- Grand total updates in real time when tip selection changes
- Custom tip accepts numeric input only, updates total on blur
- Bill screen is accessible from the **Close my bill** request type and from a persistent button on the QR page header after the first request is submitted

#### FR-05  Stripe Payment + POS Webhook
**PRIORITY: CRITICAL  |  SURFACE: GUEST WEB APP + BACKEND  |  PHASE: 1 — BUILD WITH FR-04**

Payment is processed via Stripe. The guest sees Stripe Elements on the bill screen — Apple Pay and Google Pay via the Payment Request Button, with a card input form as fallback. No card data touches TabCall servers. When the guest taps **Pay**, Stripe processes the transaction and fires a `payment_intent.succeeded` webhook to TabCall's backend.

On receiving the webhook, TabCall does five things in order: marks the `GuestSession` as paid, calls the POS webhook bridge to close the tab in the venue's POS system, fires an FCM push notification to all staff and the manager with the table label, total, and tip percentage, emits a `payment_confirmed` Socket.io event to the venue room, and updates the staff queue to show the table as closed.

The POS webhook bridge uses a factory pattern. Each supported POS system (Toast, Square, Clover) has its own adapter implementing a common interface. Venues without a supported POS use a `NullAdapter` that logs the event. Closing the tab in the POS triggers that system's existing receipt printer — no new hardware is required.

**Acceptance criteria:**
- Apple Pay and Google Pay appear as payment options on supported browsers (Safari, Chrome)
- Card input fallback renders on all browsers where wallet payments are unavailable
- Staff receive payment confirmation push within 5 seconds of Stripe webhook receipt
- Stripe webhook handler is idempotent — processing the same event twice does not double-close the tab
- Declined card shows a retry-friendly error message — guest is never left on a blank screen
- Payment confirmation push includes: table label, total amount, tip percentage, and instruction to print receipt

#### FR-06  Escalation Alerts
**PRIORITY: HIGH  |  SURFACE: STAFF PWA + MANAGER DASHBOARD  |  PHASE: 1**

When a request is created, two BullMQ delayed jobs are enqueued using Upstash Redis as the queue backend. The first job fires after 90 seconds if the request is still in `PENDING` status — it re-emits the `new_request` Socket.io event to all staff in the venue room and re-sends the FCM push. The second job fires after 3 minutes if the request remains unacknowledged — it sends a direct FCM push to all staff members with `OWNER` or `MANAGER` role, and also sends an email via Resend to the venue manager.

Both jobs are cancelled immediately when the request is acknowledged. On the staff queue, pending requests display a color-coded urgency indicator: green for under 1 minute, amber for 1–3 minutes, and red for over 3 minutes. The red state also causes the request card to pulse to draw attention.

**Acceptance criteria:**
- 90-second re-alert fires accurately within a 5-second tolerance window
- 3-minute manager escalation fires even if the staff PWA is closed on all devices
- Both jobs cancel correctly when a request is acknowledged before the timer fires
- Manager escalation email includes: table label, request type, guest note, time waiting, and a direct link to the staff queue
- Color-coded urgency updates in real time on the staff queue without page refresh

#### FR-07  Weekly Service Report
**PRIORITY: HIGH  |  SURFACE: EMAIL  |  PHASE: 1**

A BullMQ cron job runs every Monday at 8am in the venue's local timezone. It queries the past 7 days of request data and generates a service report email sent to the venue owner and any managers via Resend. The email uses a React Email template with the venue name in the header and clean data tables. **No AI narrative is included in Phase 1** — the report contains data only.

Metrics included in the weekly report:
- Total requests for the week, broken down by request type
- Average response time (time from request creation to first acknowledgement)
- Average feedback rating for the week
- Number of escalations triggered
- Comparison to the prior week for each metric (up or down arrow)

**Acceptance criteria:**
- Report sends every Monday at 8am venue local time — not UTC
- Founding venues (`FOUNDING` plan) receive the report identically to paying venues
- If no requests were made in the past 7 days, the report is suppressed — no empty email sent
- Email renders correctly in Gmail, Apple Mail, and Outlook

#### FR-08  Guest Feedback + Google Review Routing
**PRIORITY: HIGH  |  SURFACE: GUEST WEB APP + BACKEND  |  PHASE: 1**

After a guest's payment is confirmed, the QR page transitions to a simple 5-star rating screen. No text field is shown in Phase 1 — the rating tap alone is sufficient. Routing is rule-based and requires no AI.

**Routing logic:**
- **4 or 5 stars:** display a prompt — *Enjoyed your visit? Leave us a Google review* — with a direct link to the venue's Google listing using the `googlePlaceId` stored on the Venue record
- **1, 2, or 3 stars:** do not prompt for a public review; instead, immediately send an email alert to the venue owner and manager via Resend including the table label, session time, and star rating

**Acceptance criteria:**
- Google review link opens the correct venue listing (validated against the venue's `googlePlaceId`)
- Manager alert email sends within 60 seconds of a 1–3 star rating being submitted
- Feedback screen only appears once per `GuestSession` — cannot be triggered multiple times
- Guests who close the QR page before rating are not prompted again if they reopen it after payment

---

## 8. Product Surfaces

TabCall consists of four surfaces. All are web-based — no native app required for any user.

| Surface | Who uses it | Description |
|---|---|---|
| **Guest web app** | Bar guests | QR scan opens a mobile-optimized page in the browser. No login, no app install. Session-based — expires after 8 hours. Serves request flow, bill, payment, and feedback. |
| **Staff PWA** | Servers, bartenders | Progressive web app installable on iOS and Android home screens. Shows live request queue, push alerts, acknowledge and resolve actions. Works on cellular if venue WiFi drops. |
| **Manager dashboard** | Managers, owners | Web dashboard showing live request status, escalation alerts, weekly report, and feedback feed. Accessible on any device via browser. |
| **Venue admin portal** | Venue owners | Setup and configuration: venue details, table management, QR code generation, staff accounts, POS type, Google Place ID, subscription management. |

---

## 9. Data Model

Core entities and their relationships. Full Prisma schema is maintained in the repository.

| Entity | Key fields | Notes |
|---|---|---|
| `Organization` | `id`, `name`, `plan`, `stripeCustomerId`, `stripeSubscriptionId` | Top-level billing entity. One org → one venue in v1; multiple venues deferred to Group plan. |
| `Venue` | `id`, `orgId`, `name`, `zipCode`, `timezone`, `posType`, `posWebhookUrl`, `googlePlaceId` | Each venue has its own tables, staff, request history. `posType` drives POS adapter selection. |
| `Table` | `id`, `venueId`, `label`, `qrCode`, `zone` | One QR code per table. `qrCode` is the unique token embedded in the URL. |
| `StaffMember` | `id`, `venueId`, `name`, `email`, `passwordHash`, `role`, `fcmToken` | Roles: `OWNER`, `MANAGER`, `SERVER`, `BARTENDER`. `fcmToken` updated on each PWA login. |
| `GuestSession` | `id`, `venueId`, `tableId`, `sessionToken`, `lineItems`, `tipPercent`, `paidAt`, `stripePaymentIntentId` | Created on QR scan. `lineItems` is JSON. Expires 8 hours after creation. |
| `Request` | `id`, `venueId`, `tableId`, `sessionId`, `type`, `status`, `note`, `assignedToId`, `acknowledgedAt`, `resolvedAt`, `escalatedAt` | Status: `PENDING`, `ACKNOWLEDGED`, `RESOLVED`, `ESCALATED`. One active request per session at a time. |
| `FeedbackReport` | `id`, `venueId`, `sessionId`, `rating`, `note`, `seenByMgr` | Created only for 1–3 star ratings. Used to populate manager alert emails. |

### 9.1 Forward-compatible (schema present, features Phase 2+)

These entities exist in the Prisma schema to keep migrations linear, but their corresponding features are **out of scope** for v1.

- `MenuCategory`, `MenuItem` — digital menu / upsells (Phase 2)
- `LoyaltyConfig` — loyalty stamp program (Phase 2)
- `HappyHour` — happy hour scheduled pushes (Phase 2)

---

## 10. API Reference

Core REST endpoints for Phase 0 and Phase 1. All endpoints return JSON. All write operations require Zod input validation.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/v/:venueId/t/:tableId` | None | Load guest QR page — validates token, creates or resumes `GuestSession` |
| POST | `/api/requests` | Session | Guest submits a request — creates `Request`, fires Socket.io + FCM |
| PATCH | `/api/requests/:id/acknowledge` | Staff | Staff acknowledges a request — updates status, notifies guest |
| PATCH | `/api/requests/:id/resolve` | Staff | Staff resolves a request — removes from active queue |
| GET | `/api/session/:id/bill` | Session | Returns itemized bill: line items, tax, gratuity options, totals |
| POST | `/api/session/:id/payment` | Session | Creates Stripe `PaymentIntent` server-side, returns `clientSecret` |
| POST | `/api/session/:id/feedback` | Session | Submits star rating — routes to Google link or manager alert |
| POST | `/api/webhooks/stripe` | Stripe sig | Handles `payment_intent.succeeded` and subscription lifecycle events |
| POST | `/api/webhooks/pos/:posType` | POS sig | Inbound POS webhook (line items, status changes) |
| POST | `/api/auth/login` | None | Staff and owner login — returns NextAuth session |
| GET | `/api/venue/:id/requests/live` | Staff | Returns all active requests for a venue (used by staff queue) |
| POST | `/api/admin/venue` | Owner | Create a new venue under the owner's organization |
| POST | `/api/admin/venue/:id/tables` | Owner | Add a table and generate its QR code token |
| POST | `/api/admin/staff` | Owner | Create a staff account for a venue |

---

## 11. System Architecture

> **High-level. Implementation detail lives in the engineering README, not here.**

```
                 ┌─────────────────┐
                 │   Guest phone   │  Safari / Chrome on cellular
                 │  (no app)       │
                 └────────┬────────┘
                          │ HTTPS + Socket.io
                          ▼
        ┌──────────────────────────────────────┐
        │  Next.js 14 (Vercel)                 │  Guest, Manager, Admin web surfaces
        │  + Staff PWA (installable)           │  Tailwind, shadcn/ui, Zustand
        └────────┬─────────────────────────────┘
                 │ REST + WS
                 ▼
        ┌──────────────────────────────────────┐
        │  Fastify API + Socket.io  (Railway)  │  Zod validation, NextAuth
        └──┬─────────┬─────────┬──────────┬────┘
           │         │         │          │
           ▼         ▼         ▼          ▼
      Postgres   Upstash    Stripe     POS adapter
      (Supabase) Redis      (PI + WH)  (Toast/Sq/Clv/Null)
       RLS       BullMQ
                   │
                   ▼
              Workers: escalation, weekly report
                   │
                   ▼
         FCM push  +  Resend email
```

### 11.1 Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) | SSR for fast QR page loads, one codebase for all surfaces |
| Styling | Tailwind CSS + shadcn/ui | Rapid UI development |
| State | Zustand | Lightweight client state |
| Backend | Node.js + Fastify | Fast REST API |
| Real-time | Socket.io | Bidirectional — guest requests, staff acknowledges, guest sees confirmation |
| Database | PostgreSQL via Supabase | Persistent data, row-level security for multi-venue isolation |
| Cache / Queue | Redis via Upstash | Active session state, BullMQ job scheduling |
| ORM | Prisma | Type-safe DB queries |
| Payments | Stripe | Guest payments (Apple Pay, Google Pay, card), venue subscriptions |
| Push | Firebase Cloud Messaging (FCM) | Staff alerts when PWA is in background |
| Email | Resend + React Email | Weekly reports, bad-rating alerts, payment confirmations |
| Hosting | Vercel (frontend) + Railway (backend) | Zero-config deploys, auto-scale |
| Validation | Zod | Runtime type safety on all API inputs |
| Job Queues | BullMQ | Escalation timers, weekly report generation |

### 11.2 Key architectural decisions

| Decision | Choice | Why |
|---|---|---|
| Tenancy | Org → Venue → (Tables, Staff, Requests). Postgres RLS for venue isolation | Hard data boundary; no cross-venue leak even on a buggy query |
| Real-time | Socket.io primary, FCM fallback | Bars have flaky WiFi; cellular FCM keeps alerts flowing |
| Webhooks | Stripe + POS, both idempotent (event-id deduped in Postgres) | Stripe retries on transient failures; double-close would print two receipts |
| Sessions | Anonymous guest, signed JWT in QR URL, 8hr TTL | No friction; no PII; tokens self-expire |
| POS integration | Factory pattern, `NullAdapter` default | Ship to any venue regardless of POS support |
| Auth | NextAuth, hashed passwords, role-based | Standard, audited, no rolling our own |
| Observability | Sentry (errors) + Logtail (logs) + Stripe + FCM dashboards | TBC: pick before Phase 0 install |
| Deployment | Vercel + Railway + Supabase + Upstash | Each piece auto-scales, zero-config deploys |

---

## 12. Non-Functional Requirements

### 12.1 Performance

| Requirement | Target | Rationale |
|---|---|---|
| Guest QR page initial load | < 3 seconds on 3G | Guests scan in bars — cellular only, often crowded spectrum |
| Request to staff push latency | < 2 seconds | Must feel instant — delay breaks the illusion of being heard |
| Acknowledge to guest update | < 1 second | Guest is watching the screen waiting for confirmation |
| Bill screen load | < 1 second | Guest is ready to leave — any delay creates friction |
| Stripe webhook to staff push | < 5 seconds | Staff need to know before the guest stands up to leave |
| Staff PWA offline recovery | Reconnects within 10s | Bars have unreliable WiFi — cellular fallback must be seamless |

### 12.2 Reliability & availability
- Target uptime: **99.5%** monthly (≈3.6h downtime/month)
- Guest QR page must degrade gracefully if the backend is unreachable — show a static fallback asking the guest to speak with their server directly. Never a blank page or error stack trace.
- Stripe webhook retries handled by Stripe; TabCall handler must be idempotent
- BullMQ jobs persist through server restarts (Upstash Redis durable storage)

### 12.3 Security
- Guest sessions identified by a cryptographically signed token in the QR URL, validated on every request, 8hr expiry
- No guest authentication — guests are always anonymous
- Stripe secret key never exposed to the client; all `PaymentIntent` creation server-side
- Stripe webhook signature verified on every event using `STRIPE_WEBHOOK_SECRET`
- Supabase RLS policies enforce venue isolation
- Staff login via NextAuth with hashed passwords
- All env vars in Vercel + Railway managed env; never in repo

### 12.4 Compatibility
- **Guest:** iPhone Safari iOS 15+, Android Chrome 90+, Samsung Internet 14+
- **Staff PWA:** iOS 16.4+ (PWA push minimum), Android 8+
- **Manager / Admin:** Chrome 90+, Safari 15+, Edge 90+, Firefox 88+
- **Payment:** Apple Pay (Safari), Google Pay (Chrome), card fallback everywhere

### 12.5 Accessibility
- WCAG 2.1 AA on guest surfaces (4.5:1 minimum contrast)
- Visible focus states on all interactive elements
- Minimum 48×48px tap targets
- Descriptive error messages — never raw error codes

### 12.6 Observability
- Every API request logged with venue ID, latency, status
- Sentry alerts on any 5xx or unhandled exception in production
- Stripe + POS webhook delivery dashboards reviewed weekly
- FCM delivery rate dashboard reviewed daily during Phase 0

### 12.7 Deployment & environments
- Three environments: `dev` (local), `staging` (Vercel preview + Railway staging + Supabase staging), `prod`
- All secrets in Vercel + Railway env management; never in repo
- Database migrations via Prisma, gated on staging-green before prod

### 12.8 Data retention
- `GuestSession`: 8h active, then archived to read-only storage for 90 days (audit, dispute)
- `Request`: retained 12 months for analytics; longer with venue opt-in
- `FeedbackReport`: retained indefinitely while venue active; deleted 30d after venue churns
- Staff PII (email): deleted 30d after staff member removed

### 12.9 Compliance
- **PCI:** SAQ-A via Stripe Elements. No card data ever touches TabCall servers.
- **GDPR / CCPA:** not applicable in Phase 0/1 (US-only). Data export + delete endpoints planned for Phase 2.
- **ADA / WCAG 2.1 AA** on guest surfaces (see §12.5).

---

## 13. Pricing & Subscription

> **This section is canonical. The legacy build prompt's tiered pricing ($49/$99/$249) is superseded.**

| Tier | Price | Who | Includes |
|---|---|---|---|
| **Founding** | $0 / month, permanent | First 10 venues | Phase 0 + Phase 1 features. Weekly feedback + reference status required. |
| **Flat** | $79 / month | All paying venues | Phase 0 + Phase 1 features. No upsells, no add-ons. |
| **Annual** | $758 / year | Venues committing 12 months | Same as flat, 20% off. Reduces churn. |
| **Group** | $249 / month *(deferred)* | Owners with 2+ venues | Activated when the second multi-venue prospect appears AND $2K MRR is hit. |

**Pricing principle:** one price, one decision, ten-second yes/no. Tiering is a future problem and only revisited at $2K MRR.

---

## 14. Out of Scope (Roadmap Reference)

| Phase | Window | Themes |
|---|---|---|
| **Phase 2** | Month 4–6 | Digital menu + upsells, happy hour pushes, loyalty stamps, peak hour heatmap, staff response leaderboard, tip pooling, SMS/WhatsApp receipts, GDPR data export |
| **Phase 3** | Month 9+ | All AI features (request prioritization, sentiment, narrative reports, NL analytics, revenue opportunity, service coach, predictive staffing), multi-venue dashboard, cross-venue benchmarking |

---

## 15. Risks & Mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Staff stop using the PWA after week 2 | High | Escalation alerts create manager visibility when staff drop the ball. Accountability without confrontation. Be present for the first Friday shift at week 8 install. |
| 2 | Guests do not scan the QR code | High | QR placement is critical. Table tent at eye level, one clear line of copy. Make placement part of the onboarding checklist. Test multiple positions during founding installs. |
| 3 | Bar WiFi is too unreliable for Socket.io | Medium | FCM provides cellular-independent fallback. Staff PWA shows a *Reconnecting…* banner and retries automatically. Document the WiFi requirement in onboarding. |
| 4 | Stripe payments feel unfamiliar to guests | Medium | Apple Pay / Google Pay require zero friction — face scan or fingerprint. Card is the fallback, not the primary. Lead with wallet payments in UI. |
| 5 | POS webhook fails for a specific POS | Medium | `NullAdapter` is the default — venues without supported POS still get all features except automatic receipt printing. Staff can print manually. Document transparently. |
| 6 | Founding venue churns before paying | Low | Be present on their first Friday night. Fix issues Monday. A venue that sees TabCall work in a real rush will not churn. Personal presence is the retention strategy. |
| 7 | Domain `tabcall.app` unavailable or held by squatter | Medium | Check Week 1; have fallbacks (`tabcall.io`, `gettabcall.com`). Resolve before any QR codes are printed. |
| 8 | iOS PWA push silently breaks on a Safari update | Medium | Monitor FCM delivery rate dashboard daily during Phase 0. Socket.io fallback in place for connected devices. |
| 9 | Single-region deploy (Vercel/Railway US-East) becomes a regional outage risk | Low | Acceptable for Houston-only Phase 0. Re-evaluate at second-city expansion. |

---

## 16. Success Metrics

How we know the product is working at each stage.

| Metric | Week 3 target | Week 8 target | Month 6 target |
|---|---|---|---|
| Active founding venues | 2 | 5 | 10 |
| Paying venues | 0 | 1 | 15–20 |
| Monthly recurring revenue | $0 | $79 | $1,200–$1,600 |
| Guest requests per venue / week | 10+ | 30+ | 50+ |
| Avg request response time | < 3 min | < 2 min | < 90 sec |
| Staff PWA daily active rate | 100% | 80% | 75% |
| Guest feedback submission rate | n/a | 40% | 50% |
| Weekly report open rate | n/a | 70% | 65% |
| Monthly churn | n/a | 0% | < 5% |

---

## 17. Go-to-Market

### 17.1 Launch market
**Houston, Texas.** Dense bar scene across Midtown, Montrose, Washington Avenue, and Downtown. High sports bar culture. Relaxed liquor laws. Strong tech adoption. Founder is locally based — in-person sales is the primary acquisition strategy.

### 17.2 Founding partner strategy
First 10 venues offered TabCall free, permanently, in exchange for weekly feedback and reference status. These venues provide real usage data, surface bugs in production, and generate word-of-mouth in the Houston hospitality community.

### 17.3 Sales approach
Walk in on a Tuesday afternoon when it's quiet. Ask for the owner or GM. Demo the core loop live on your phone (their phone is the staff device, yours is the guest QR). Demo takes under 3 minutes. The only question to answer: *does this solve a problem you have?*

Do not pitch features. Do not show the pricing page. Do not leave a brochure. If they say yes, install it yourself the following week and be there for their first Friday night.

### 17.4 Expansion cities — Phase 2
- Austin, TX — 6th Street, East Austin
- Dallas, TX — Uptown, Deep Ellum
- Nashville, TN — high tourist traffic, strong bar culture
- Miami, FL — multilingual guest base (translation feature becomes critical)

---

## 18. Open Questions

These need owners + decisions before Phase 0 build starts.

1. **Domain.** Is `tabcall.app` available? If not, what's the canonical domain? *(Owner: Founder. Due: Week 1.)*
2. **Branding.** Logo, color, logo-on-QR-tent design. *(Owner: Founder. Due: Week 2 before founding install.)*
3. **POS adapter priority.** Which of Toast / Square / Clover ships first beyond `NullAdapter`? Drives Phase 1 sequencing. *(Owner: Founder + Eng Lead. Due: Week 4.)*
4. **Observability stack.** Sentry + Logtail vs Datadog vs OTel + self-hosted. *(Owner: Eng Lead. Due: Week 2.)*
5. **NextAuth provider.** Email+password only, or also magic link / Google SSO for staff? *(Owner: Eng Lead. Due: Week 2.)*
6. **Tax lookup.** ZIP → state rate table — manually maintained, or third-party (TaxJar / Avalara)? *(Owner: Eng Lead. Due: Week 4.)*
7. **Trial vs Founding.** PRD removes the 30-day trial in favor of Founding. Confirm: post-Founding, does $79 flat have any trial at all? *(Owner: Founder. Due: Week 3.)*

---

## 19. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-04 | Rename TabSignal → TabCall | Founder direction |
| 2026-05-04 | Pricing simplified to flat $79/mo + Founding $0 + Annual $758 | One price, one decision |
| 2026-05-04 | All AI features deferred to Phase 3 | Ship the loop first; AI is a wedge, not the wedge |
| 2026-05-04 | Multi-venue / Group tier deferred until 2nd multi-venue customer + $2K MRR | Avoid premature tier complexity |
| 2026-05-04 | FR-09 Venue Admin Setup added to Phase 0 | Implicit prerequisite was missing in v1.0 |

---

## 20. Approvals

| Role | Name | Sign-off |
|---|---|---|
| Founder / CEO | TBD | ☐ |
| Engineering Lead | TBD | ☐ |
| First Founding Partner (advisory) | TBD | ☐ |

---

## 21. Appendix

### 21.1 Glossary

| Term | Definition |
|---|---|
| **TabCall** | The product; formerly named TabSignal during the build-prompt phase. |
| **GuestSession** | An anonymous, time-limited session created when a guest scans a QR code. Expires 8h after creation. |
| **POS** | Point of Sale system. Software/hardware venues use to record orders and process payments (Toast, Square, Clover). |
| **POS adapter** | A software component in TabCall that translates a payment confirmation into a specific POS's API format. |
| **NullAdapter** | A POS adapter that accepts payment events and logs them without calling any external POS. Used for venues with unsupported or no POS. |
| **FCM** | Firebase Cloud Messaging. Push notifications delivered to staff devices even when the PWA is backgrounded. |
| **PWA** | Progressive Web App. Web app installable on home screen; receives push notifications like a native app. |
| **Socket.io room** | A named channel in Socket.io. Each venue has a room `venue:{venueId}`. All connected staff devices for that venue join it. |
| **BullMQ** | Node.js job queue backed by Redis. Used for escalation timers and weekly reports. |
| **RLS** | Row-Level Security. Postgres feature ensuring queries from one venue cannot return data from another. |
| **Founding venue** | One of the first 10 venues; permanent free plan in exchange for weekly feedback + reference status. |
| **Flat plan** | $79/mo, the only paid tier in v1. |

### 21.2 Reference documents
- Engineering build prompt (legacy, superseded for product scope): `Tabsignal/tabsignal_build_prompt.md`
- Agent operating manual (orthogonal to product, governs how the AI works on this repo): `CLAUDE.md`
