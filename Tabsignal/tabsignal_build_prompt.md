# TabSignal — Master Build Prompt for Claude Code / Cowork

> **Reference document — superseded for product scope by [`docs/prd/TabCall_PRD_v1.1.md`](../docs/prd/TabCall_PRD_v1.1.md).**
> Product is renamed to **TabCall**. Pricing is flat **$79/mo** (not $49/$99/$249). AI features are deferred to Phase 3. Use this doc only for engineering scaffolding context (stack, schema, API shapes); for scope, features, and pricing, defer to the PRD.

---

## Who you are and what you're building

You are a senior full-stack engineer building **TabSignal** — a SaaS product for the US bar and restaurant market. TabSignal is NOT a POS system. It is a guest-to-staff attention layer that sits on top of existing POS systems (Toast, Square, Clover) without replacing them.

**The core pain point:** Guests at bars and lounges have no reliable way to signal staff when they need something — another drink, the bill, help. They wave, crane their neck, get ignored, and give up. TabSignal solves this with a QR-based signaling system that fires real-time alerts to staff devices.

**The business model:** SaaS subscription for venue owners. Three tiers — Starter ($49/mo), Pro ($99/mo), Group ($249/mo for up to 5 venues). 30-day free trial.

---

## Tech Stack

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
| Payments | Stripe | Guest payments (Apple Pay, Google Pay, card), venue subscriptions, tip tracking |
| Push Notifications | Firebase Cloud Messaging (FCM) | Staff alerts when PWA is in background |
| Email | Resend + React Email | Weekly reports, bad review alerts, payment confirmations |
| Hosting | Vercel (frontend) + Railway (backend) | Zero-config deploys, auto-scale |
| Validation | Zod | Runtime type safety on all API inputs |
| Job Queues | BullMQ | Happy hour scheduled pushes, weekly report generation |
| PDF | @react-pdf/renderer | Bad review report PDFs for managers |

---

## The 5 surfaces to build

### 1. Guest Web App (no login required)
- Accessed by scanning a QR code at the table or bar stool
- URL format: `tabsignal.app/v/{venueId}/t/{tableId}`
- Must load in under 2 seconds on mobile — no app install
- Features: request types, digital menu with upsells, transparent bill, gratuity selector, Stripe payment, post-visit feedback, loyalty stamp display, happy hour alert banner

### 2. Staff PWA (installable on iOS/Android)
- Login with staff credentials
- Receives real-time push alerts for every guest request in their venue
- Features: live request queue, acknowledge button, request details (table, type, custom note), escalation countdown timer, payment confirmation alerts, "ID not checked" flag on first drink orders

### 3. Manager Dashboard (web)
- Login with manager/owner credentials
- Features: live overview of all active requests, response time analytics, staff leaderboard, peak hour heatmap, bad review feed, escalation alerts, weekly report preview

### 4. Venue Admin Portal (web)
- Login with owner credentials
- Features: venue setup, table/QR code generator, menu builder (categories, items, upsell prompts), happy hour scheduler, loyalty program config, subscription management (Stripe Billing), staff account management, multi-venue switcher (Group tier)

### 5. Backend API + Webhook Bridge
- REST API serving all four web surfaces
- Socket.io server for real-time delivery
- Stripe webhook handler for payment confirmation
- POS webhook bridge (factory pattern — one interface, three POS adapters: Toast, Square, Clover)
- FCM push notification dispatcher
- BullMQ workers for scheduled jobs

---

## Database Schema (Prisma)

Build the following models:

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  plan      Plan     @default(STARTER)
  stripeCustomerId String?
  stripeSubscriptionId String?
  trialEndsAt DateTime?
  venues    Venue[]
  createdAt DateTime @default(now())
}

model Venue {
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  name           String
  address        String
  zipCode        String
  timezone       String   @default("America/Chicago")
  posType        PosType? // TOAST | SQUARE | CLOVER | NONE
  posWebhookUrl  String?
  googlePlaceId  String?
  tables         Table[]
  staff          StaffMember[]
  menuCategories MenuCategory[]
  requests       Request[]
  happyHours     HappyHour[]
  loyaltyConfig  LoyaltyConfig?
  brandColor     String   @default("#1D9E75")
  logoUrl        String?
  createdAt      DateTime @default(now())
}

model Table {
  id       String    @id @default(cuid())
  venueId  String
  venue    Venue     @relation(fields: [venueId], references: [id])
  label    String    // "Table 7", "Bar 3", "Patio 2"
  qrCode   String    @unique // generated QR token
  zone     String?   // "main", "patio", "bar"
  requests Request[]
}

model StaffMember {
  id           String    @id @default(cuid())
  venueId      String
  venue        Venue     @relation(fields: [venueId], references: [id])
  name         String
  email        String    @unique
  passwordHash String
  role         StaffRole // OWNER | MANAGER | SERVER | BARTENDER
  fcmToken     String?   // Firebase push token
  requests     Request[] @relation("AssignedRequests")
  createdAt    DateTime  @default(now())
}

model Request {
  id              String        @id @default(cuid())
  venueId         String
  venue           Venue         @relation(fields: [venueId], references: [id])
  tableId         String
  table           Table         @relation(fields: [tableId], references: [id])
  type            RequestType   // ORDER_DRINK | GET_BILL | NEED_HELP | REFILL | FOOD_QUESTION | REPORT_ISSUE | CLOSE_TAB
  note            String?       // optional guest context note (max 120 chars)
  status          RequestStatus @default(PENDING) // PENDING | ACKNOWLEDGED | RESOLVED | ESCALATED
  assignedToId    String?
  assignedTo      StaffMember?  @relation("AssignedRequests", fields: [assignedToId], references: [id])
  guestSessionId  String        // anonymous guest session
  idCheckRequired Boolean       @default(false)
  idCheckDone     Boolean       @default(false)
  acknowledgedAt  DateTime?
  resolvedAt      DateTime?
  escalatedAt     DateTime?
  createdAt       DateTime      @default(now())
}

model GuestSession {
  id         String   @id @default(cuid())
  venueId    String
  tableId    String
  sessionToken String @unique
  lineItems  Json     @default("[]") // running tab [{name, price, qty}]
  tipPercent Int      @default(18)
  paidAt     DateTime?
  stripePaymentIntentId String?
  feedbackRating Int? // 1-5
  feedbackNote   String?
  loyaltyStamps  Int  @default(0)
  createdAt  DateTime @default(now())
  expiresAt  DateTime // 8 hours from creation
}

model MenuCategory {
  id      String     @id @default(cuid())
  venueId String
  venue   Venue      @relation(fields: [venueId], references: [id])
  name    String     // "Cocktails", "Beer", "Food"
  order   Int        @default(0)
  items   MenuItem[]
}

model MenuItem {
  id          String       @id @default(cuid())
  categoryId  String
  category    MenuCategory @relation(fields: [categoryId], references: [id])
  name        String
  description String?
  price       Float
  upsellText  String?      // "Add a shot? +$4"
  upsellPrice Float?
  available   Boolean      @default(true)
  order       Int          @default(0)
}

model LoyaltyConfig {
  id            String @id @default(cuid())
  venueId       String @unique
  venue         Venue  @relation(fields: [venueId], references: [id])
  stampsRequired Int   @default(10)
  rewardText    String @default("1 free drink")
}

model HappyHour {
  id        String   @id @default(cuid())
  venueId   String
  venue     Venue    @relation(fields: [venueId], references: [id])
  dayOfWeek Int[]    // 0=Sun, 1=Mon ... 6=Sat
  startTime String   // "16:00"
  endTime   String   // "18:00"
  message   String   // "2-for-1 margaritas for the next 30 mins!"
  active    Boolean  @default(true)
}

model FeedbackReport {
  id         String   @id @default(cuid())
  venueId    String
  tableId    String
  sessionId  String
  rating     Int      // 1-3 (only bad reviews stored here)
  note       String?
  reportedAt DateTime @default(now())
  seenByMgr  Boolean  @default(false)
}

enum Plan { STARTER PRO GROUP }
enum PosType { TOAST SQUARE CLOVER NONE }
enum StaffRole { OWNER MANAGER SERVER BARTENDER }
enum RequestType { ORDER_DRINK GET_BILL NEED_HELP REFILL FOOD_QUESTION REPORT_ISSUE CLOSE_TAB }
enum RequestStatus { PENDING ACKNOWLEDGED RESOLVED ESCALATED }
```

---

## Core Feature Specs

### QR Code System
- Each table gets a unique token stored in `Table.qrCode`
- QR encodes the URL: `https://tabsignal.app/v/{venueId}/t/{tableId}?s={qrCode}`
- On scan, create a `GuestSession` valid for 8 hours
- Guest sees venue branding (logo, brand color) on their QR page

### Real-Time Request Flow (Socket.io)
- Each venue has a Socket.io room: `venue:{venueId}`
- Each staff member joins their venue room on login
- When guest submits request:
  1. Create `Request` record in DB (status: PENDING)
  2. Emit `new_request` event to `venue:{venueId}` room
  3. Trigger FCM push to all staff FCM tokens for that venue
  4. Start escalation timer (90 seconds → re-alert all staff, 3 minutes → push to manager)
- When staff acknowledges:
  1. Update `Request.status` to ACKNOWLEDGED, set `acknowledgedAt`
  2. Emit `request_acknowledged` event back to guest session
  3. Cancel escalation timer for that request

### Escalation Logic (BullMQ)
- On request creation, enqueue two delayed jobs:
  - 90s: re-emit `new_request` to all staff if still PENDING
  - 3min: push FCM to manager role + update status to ESCALATED
- Cancel both jobs when request is acknowledged

### Transparent Bill + Payment Flow
1. Guest taps "Close my bill" → `GET /api/session/{sessionId}/bill`
2. Returns: line items, subtotal, tax (calculated from venue ZIP via TaxJar or simple rate table), gratuity options (15/18/20/custom), total
3. Guest selects tip % → creates Stripe PaymentIntent server-side
4. Stripe Elements renders Apple Pay / Google Pay / card UI
5. On payment success:
   - Update `GuestSession.paidAt` and `stripePaymentIntentId`
   - Fire `payment_confirmed` Socket.io event to venue room
   - Push FCM to assigned server + manager: "Table 7 paid — $79.54 incl. 18% tip"
   - Call POS webhook bridge to trigger receipt print
6. Show guest confirmation screen with loyalty stamp earned

### POS Webhook Bridge
Use a factory pattern. Create a `PosAdapter` interface:

```typescript
interface PosAdapter {
  confirmPayment(payload: PaymentConfirmation): Promise<void>
}

// Implementations:
class ToastAdapter implements PosAdapter { ... }
class SquareAdapter implements PosAdapter { ... }
class CloverAdapter implements PosAdapter { ... }
class NullAdapter implements PosAdapter { ... } // for venues with no POS
```

`PaymentConfirmation` shape:
```typescript
{
  venueId: string
  tableLabel: string
  totalCents: number
  tipCents: number
  lineItems: { name: string; price: number; qty: number }[]
  paidAt: string // ISO timestamp
}
```

### Review Routing Logic
After payment, show 2-tap feedback screen:
- 4–5 stars → show "Leave us a Google review" button linking to `https://search.google.com/local/writereview?placeid={venue.googlePlaceId}`
- 1–3 stars → store in `FeedbackReport`, send email alert to manager via Resend, generate PDF report with @react-pdf/renderer

### Digital Menu + Upsells
- Menu displayed on guest QR page when they tap "Order a drink" or "View menu"
- Upsell text shows inline below item name: "Add Patrón? +$4"
- Items marked `available: false` are hidden
- Manager can toggle availability in real-time from venue admin

### Happy Hour Push
- BullMQ cron job runs every minute, checks current time against `HappyHour` records per venue timezone
- On happy hour start: emit `happy_hour_start` to `venue:{venueId}` Socket.io room
- Backend broadcasts FCM push to all active guest sessions in that venue
- Guest QR page shows banner: "Happy hour ends in X mins — [message]"

### Loyalty Stamps
- Each completed payment within a guest session = 1 stamp
- Stamps stored in `GuestSession.loyaltyStamps` and aggregated to a per-phone cookie (using fingerprinting or optional email opt-in)
- When stamps reach `LoyaltyConfig.stampsRequired`, show reward on guest screen
- Venue admin can view total stamps issued per week

### Weekly Service Report (Resend + React Email)
Send every Monday at 8am venue local time. Include:
- Avg response time this week vs last week
- Total requests by type
- Staff leaderboard (fastest avg acknowledgement)
- Peak hour breakdown
- Feedback score average
- Any unresolved bad reviews

### Subscription Gating Middleware
```typescript
// Feature flags per plan
const PLAN_FEATURES = {
  STARTER: ['core_requests', 'transparent_bill', 'pos_webhook', 'weekly_report', 'escalation'],
  PRO: ['...STARTER', 'digital_menu', 'loyalty', 'happy_hour', 'review_routing', 'heatmap', 'branding'],
  GROUP: ['...PRO', 'multi_venue', 'tip_pooling', 'priority_support']
}

// Middleware: check org plan before serving feature
function requireFeature(feature: string) {
  return (req, res, next) => {
    if (!PLAN_FEATURES[req.org.plan].includes(feature)) {
      return res.status(402).json({ error: 'Upgrade your plan to access this feature' })
    }
    next()
  }
}
```

---

## Build Order (Phase by Phase)

### Phase 1 — Foundation (build this first)
1. Initialize Next.js 14 project with App Router, Tailwind, shadcn/ui
2. Set up Supabase Postgres + Prisma — run migrations for full schema above
3. Auth system — NextAuth with credentials provider, role-based session (OWNER, MANAGER, SERVER, BARTENDER)
4. QR code generator — `qrcode` npm package, dynamic URL, table management in venue admin
5. Guest web app — `/v/[venueId]/t/[tableId]` route, session creation, request type selection UI, custom note field
6. Socket.io server — venue rooms, `new_request` / `request_acknowledged` / `payment_confirmed` events
7. Staff PWA — request queue page, acknowledge button, FCM setup with next-pwa
8. Escalation BullMQ jobs — 90s re-alert, 3min manager escalation

### Phase 2 — Payments
1. Transparent bill UI on guest QR page — line items, tax, gratuity selector (15/18/20/custom)
2. Stripe PaymentIntent creation API — server-side, includes tip in amount
3. Stripe Elements on guest page — Apple Pay, Google Pay, card
4. Stripe webhook handler — `payment_intent.succeeded` → update session, push FCM, call POS bridge
5. POS adapter factory — NullAdapter first (works for any venue), then Toast + Square
6. Stripe Billing — venue subscription creation, plan enforcement middleware, trial period

### Phase 3 — Engagement
1. Menu builder in venue admin — category + item CRUD, upsell fields, availability toggle
2. Menu display on guest QR page — category tabs, item cards, upsell nudge UI
3. Happy hour scheduler in venue admin — days, time range, message
4. BullMQ cron for happy hour — per-venue timezone check, Socket.io broadcast + FCM push
5. Loyalty config in venue admin — stamps required, reward text
6. Loyalty tracking on guest session — stamp on payment, display on QR page
7. Post-payment feedback screen — star rating, Google redirect, bad review report

### Phase 4 — Analytics + Multi-venue
1. Manager dashboard — live request view (Socket.io), response time stats
2. Staff leaderboard — avg acknowledgement time per staff member per week
3. Peak hour heatmap — requests grouped by hour and table zone, rendered as grid
4. Weekly report — React Email template, Resend dispatch, BullMQ Monday cron
5. Bad review PDF — @react-pdf/renderer, triggered on 1–3 star submission
6. Multi-venue switcher — org-level login shows all venues, Group plan gate

---

## API Route Structure

```
POST   /api/auth/login
POST   /api/auth/logout

GET    /api/venue/:venueId/session/new          → create guest session
GET    /api/session/:sessionId/bill             → get transparent bill
POST   /api/session/:sessionId/payment          → create Stripe PaymentIntent
POST   /api/session/:sessionId/feedback         → submit rating

POST   /api/requests                            → guest creates request
PATCH  /api/requests/:requestId/acknowledge     → staff acknowledges
PATCH  /api/requests/:requestId/resolve         → staff resolves

GET    /api/venue/:venueId/menu                 → get menu (guest)
GET    /api/venue/:venueId/requests/live        → live queue (staff/manager)
GET    /api/venue/:venueId/analytics/summary    → stats (manager)
GET    /api/venue/:venueId/analytics/heatmap    → heatmap data (manager)

POST   /api/webhooks/stripe                     → Stripe payment + subscription events
POST   /api/webhooks/pos/:posType               → inbound POS events (future)

GET    /api/admin/venue                         → list venues (owner)
POST   /api/admin/venue                         → create venue
PATCH  /api/admin/venue/:venueId                → update venue settings
POST   /api/admin/venue/:venueId/tables         → create table + generate QR
DELETE /api/admin/venue/:venueId/tables/:tableId

GET    /api/admin/menu/:venueId                 → get menu (admin)
POST   /api/admin/menu/:venueId/categories      → create category
POST   /api/admin/menu/:venueId/items           → create item
PATCH  /api/admin/menu/:venueId/items/:itemId   → update item / toggle availability

GET    /api/admin/staff/:venueId                → list staff
POST   /api/admin/staff/:venueId                → invite staff member

GET    /api/admin/happy-hours/:venueId
POST   /api/admin/happy-hours/:venueId
PATCH  /api/admin/happy-hours/:id

GET    /api/admin/reports/weekly/:venueId       → preview weekly report
GET    /api/admin/reports/feedback/:venueId     → bad review feed
```

---

## Environment Variables Needed

```env
# Supabase
DATABASE_URL=
DIRECT_URL=

# NextAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
STRIPE_GROUP_PRICE_ID=

# Firebase (FCM)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_VAPID_KEY=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Upstash Redis (BullMQ)
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=

# POS Adapters
TOAST_API_BASE_URL=
TOAST_API_KEY=
SQUARE_API_BASE_URL=
SQUARE_ACCESS_TOKEN=
CLOVER_API_BASE_URL=
CLOVER_API_KEY=

# App
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_FIREBASE_CONFIG=
```

---

## Important Constraints

- **No POS replacement.** TabSignal never writes to POS order systems. It only sends a "payment confirmed" webhook that triggers their receipt printer. Keep all POS adapters in `/lib/pos/` as thin, isolated modules.
- **Guest pages must be sessionless.** Guests never create accounts. Use short-lived signed tokens in the QR URL for session identity.
- **Row-level security.** Use Supabase RLS policies so a venue manager can never query another organization's data.
- **US market only (for now).** All tax calculations use US ZIP codes. All timestamps use US timezones. Default currency is USD.
- **Mobile-first guest UI.** The guest QR page renders on phones in a bar — dark environments, one thumb, often tipsy. Large tap targets (min 48px), high contrast, max 3 taps to complete any action.
- **FCM works in background.** Staff PWA must register a service worker and handle FCM background push so alerts fire even when the app is minimized.

---

## Start here

Begin with Phase 1. Your first tasks are:

1. `npx create-next-app@latest tabsignal --typescript --tailwind --app`
2. Install dependencies: `prisma`, `@prisma/client`, `socket.io`, `socket.io-client`, `next-auth`, `zod`, `qrcode`, `bullmq`, `firebase-admin`, `stripe`, `resend`
3. Initialize Prisma with the full schema above
4. Run `npx prisma migrate dev --name init`
5. Build the guest QR page at `/app/v/[venueId]/t/[tableId]/page.tsx` — static shell first, then wire up session creation
6. Build the Socket.io server and integrate it into the Next.js API route at `/api/socket`

Ask me to confirm the Supabase connection string and Firebase config before proceeding to any push notification work.
