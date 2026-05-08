# Tier 3 — Strategic roadmap (architecture sketch)

Tier 1 (menu, analytics, bill split) and Tier 2 (pre-order, SaaS
subscription, tip pooling) are shipped. Tier 3 features are each
multi-week projects. This document is the architecture sketch we'll
hand to the engineer who picks them up.

---

## 1. Multi-location operator console

**User**: A bar group with N venues (Org → Venues 1..N) wants centralized
visibility and control without juggling N separate logins.

### Schema

`Organization` already exists. Already-defined relation `venues: Venue[]`
makes most queries trivial. Need to add:

- New `OrgMember` table: many-to-many between StaffMember and
  Organization (separate from per-venue StaffMember). Role enum:
  `OWNER | ADMIN | VIEWER`. Owner can do anything across all venues.
- `Venue.regionTag: String?` — group venues for hierarchical filtering
  ("Texas locations only").

### API

- `GET /api/operator/orgs/:orgId/overview` — aggregates: revenue per
  venue (today / 7d / 30d), top venues, lagging venues, open bad
  ratings count.
- `GET /api/operator/orgs/:orgId/venues` — venue list with at-a-glance
  status (Stripe ready, subscription, last-paid).
- `POST /api/operator/orgs/:orgId/broadcast` — push a manager notice
  to all venues at once (new SOP, weather closure, etc.).

### UI

- `/operator` already exists; expand with org selector if user belongs
  to multiple orgs.
- `/operator/orgs/[orgId]` — overview dashboard.
- `/operator/orgs/[orgId]/venues` — venue grid with KPIs.
- Reuse `lib/analytics.ts` per venue, then aggregate org-wide in a
  parallel-Promise.all batch.

### Auth

`isOperator()` currently checks `OPERATOR_EMAILS` env. Migrate to
`OrgMember` lookup so org owners are operators of their own orgs
without needing platform-staff env entries.

### Effort

~2 weeks. Most weight is in the org-wide aggregation queries +
designing a useful overview page.

---

## 2. Reservations + waitlist

**User**: Walk-in venue with limited bar seats; manager wants to fill
the room without overbooking, and guests want to skip the line.

### Schema

```prisma
model Reservation {
  id              String   @id @default(cuid())
  venueId         String
  // Optional table assignment — many bars seat in zones rather than
  // by table; null = "any 4-top in the bar zone".
  tableId         String?
  zone            String?
  partySize       Int
  startsAt        DateTime
  endsAt          DateTime
  guestName       String
  guestPhone      String
  status          ReservationStatus @default(PENDING)
  notes           String?
  arrivedAt       DateTime?
  seatedAt        DateTime?
  createdAt       DateTime @default(now())
  venue           Venue    @relation(fields: [venueId], references: [id])
  table           Table?   @relation(fields: [tableId], references: [id])
  @@index([venueId, startsAt])
}

enum ReservationStatus {
  PENDING       // booked, not arrived
  ARRIVED       // checked in, waiting for table
  SEATED        // table assigned, party seated
  NO_SHOW
  CANCELED
}

model Waitlist {
  // Same shape minus startsAt/endsAt; FIFO with quoted-wait field.
  id             String   @id @default(cuid())
  venueId        String
  partySize      Int
  guestName      String
  guestPhone     String
  quotedWaitMin  Int
  joinedAt       DateTime @default(now())
  notifiedAt     DateTime?
  seatedAt       DateTime?
  status         WaitlistStatus @default(WAITING)
  @@index([venueId, joinedAt])
}
```

### API

- `POST /api/v/[slug]/reservations` — public booking endpoint;
  rate-limited by phone number; SMS confirmation via Twilio.
- `GET  /api/admin/v/[slug]/reservations?date=YYYY-MM-DD` — manager
  view of the night's bookings.
- `PATCH /api/admin/v/[slug]/reservations/[id]` — mark arrived /
  seated / no-show.
- `POST /api/v/[slug]/waitlist/join` — guest QR scan adds them; SMS
  when table ready.

### Auth & integrations

- SMS via Twilio (or Resend's SMS partner). Add `TWILIO_*` env vars.
- Calendar: optionally export to Google Calendar / Outlook for the
  manager (use Google Calendar API with delegated auth).

### Effort

~3 weeks. Real complexity is conflict detection (don't double-book a
4-top across 90-minute slots) and SMS reliability.

---

## 3. Guest profile + loyalty

**User**: Returning guest wants their preferences remembered ("usual
Negroni") and earns rewards across visits.

### Schema

```prisma
model GuestProfile {
  id             String   @id @default(cuid())
  // Phone is the soft identity. Email optional. No password — magic
  // link via SMS or QR-from-email reauths the device.
  phone          String   @unique
  displayName    String?
  email          String?  @unique
  // Per-venue history is via GuestSession.guestProfileId (nullable FK).
  loyaltyPointsByVenueId Json @default("{}") // venueId -> int
  preferences    Json     @default("{}")     // { favoriteDrinks: [...], allergies: "..." }
  createdAt      DateTime @default(now())
  sessions       GuestSession[]
}
```

Plus `GuestSession.guestProfileId String?` and an index.

### API

- `POST /api/v/[slug]/profile/identify` — guest enters phone, gets a
  6-digit SMS code; verification mints a 90-day cookie token tied to
  the profile. Reused on subsequent scans.
- `GET  /api/v/[slug]/profile/me?token=` — fetch profile + venue
  loyalty balance.
- Webhook (`payment_intent.succeeded`): if session has guestProfileId,
  award N points (1 per dollar by default).

### Loyalty redemption

- `POST /api/v/[slug]/profile/redeem` — apply a reward to the active
  session (e.g., 100 points = $5 off, appended as negative line item).

### Privacy

- Hard rule: no facial recognition, no cross-venue identity without
  explicit guest opt-in, no sale of guest data to third parties. The
  loyalty program lives at the org level; one venue can't see another
  org's data.

### Effort

~3 weeks. Real complexity is SMS verification flow + the
points-redemption math interacting with the existing bill flow.

---

## 4. Industry benchmarking insights product

**User**: Manager wants to know if their Tuesday is normal or bad.

### Schema

No new tables. Compute from existing `GuestSession` + `FeedbackReport`
data, anonymized + aggregated.

### Architecture

A nightly job (Vercel Cron or a separate worker) computes per-venue
metrics + per-segment percentiles:

```typescript
// Pseudo
const metric = "revenue_per_table_per_night";
const segment = { city: "Austin", venueType: "bar", capacity_bucket: "20-50" };
percentiles[segment][metric] = { p25, p50, p75, p90 };
```

Stored in a new `BenchmarkSnapshot` table:

```prisma
model BenchmarkSnapshot {
  id            String   @id @default(cuid())
  date          DateTime
  segmentJson   Json     // { city, venueType, capacityBucket, ... }
  metric        String
  p25           Float
  p50           Float
  p75           Float
  p90           Float
  sampleCount   Int
  createdAt     DateTime @default(now())
  @@index([date, metric])
  @@unique([date, metric, segmentJson])
}
```

### API

- `GET /api/admin/v/[slug]/benchmarks?metric=...` — returns the venue's
  own value alongside the relevant segment's percentiles. Only shows
  data for segments with `sampleCount >= 5` (k-anonymity).

### UI

- New section on Analytics page: "How you compare". Each KPI gets a
  bar showing where you fall vs the segment band.

### Privacy / antitrust

- Never reveal another venue's individual data — only segment medians.
- Disclose to venues at signup that aggregated, anonymized data fuels
  benchmarks.

### Effort

~2 weeks. Data product, not a feature — needs careful segmentation
choices and a sustained data-quality loop.

---

## Sequencing recommendation

If we ship all of Tier 3 in order: **Multi-location → Reservations →
Loyalty → Benchmarks**.

Reasoning:
- Multi-location unlocks the next tier of customer (chains) — biggest
  ARR uplift per engineering hour.
- Reservations is the most table-stakes "yes, you're a real platform"
  feature for VC pitch and unblocks the Resy/OpenTable competitive
  story.
- Loyalty is a sticky daily-use feature but depends on having venues
  to demo retention against; defer until you have enough live venues.
- Benchmarks is the data moat — only meaningful with N>=50 venues per
  segment, so it ships last by necessity.
