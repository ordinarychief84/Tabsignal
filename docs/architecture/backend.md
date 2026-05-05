# TabCall — Backend Architecture (MVP)

**Audience:** Senior engineer joining the project on Monday.
**Scope:** What's needed to ship F1–F5 of PRD v2.0 to a single venue, then to 50.
**Date:** 2026-05-05.

The principle is to ship the smallest defensible thing. We default to "use the boring tool" everywhere except where the product needs real-time push, where Postgres-only is too slow.

---

## 1. Topology

```
┌────────────────┐    HTTPS / SSR     ┌─────────────────────┐
│  Guest browser │ ─────────────────▶ │  Next.js (Vercel/   │
│  Staff PWA     │ ◀────WS / SSE───── │   Railway)          │
│  Owner browser │                    │   - UI surfaces     │
└────────────────┘                    │   - REST routes     │
                                      │   - Stripe webhook  │
                                      │   - Auth (jose JWT) │
                                      └──────┬──────────────┘
                                             │
                            internal HTTP    │
                            (shared secret)  │
                                             ▼
                                      ┌─────────────────────┐
                                      │  Fastify + Socket.io│ ← Railway
                                      │   (long-lived WS)   │
                                      └──────┬──────────────┘
                                             │
                          ┌──────────────────┼──────────────────┐
                          ▼                  ▼                  ▼
                     ┌────────┐         ┌────────┐         ┌────────┐
                     │Supabase│         │ Stripe │         │Anthropic│
                     │Postgres│         │Connect │         │ Claude  │
                     └────────┘         └────────┘         └────────┘
                                             │
                                             ▼
                                        ┌────────┐
                                        │ Resend │
                                        └────────┘
```

The split exists because Vercel's serverless model can't hold a long-lived WebSocket. Everything else lives in Next.js routes — fewer moving parts. Both deploys share `INTERNAL_API_SECRET`.

---

## 2. Database

**Engine.** Postgres 15 on Supabase. Pooled connection (port 6543, `pgbouncer=true`) for Prisma's read/write traffic, direct (5432) only for migrations.

**ORM.** Prisma 5.22. Schema is the source of truth (`app/prisma/schema.prisma`). Migrations are checked into git.

**Tables (8).** All have `cuid()` primary keys and `createdAt` timestamps unless noted.

| Table              | Purpose                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `Organization`     | Top-level billing entity. One per owner. Holds `stripeCustomerId`, plan flag.                                     |
| `Venue`            | A physical location. Belongs to an org. Holds `slug` (URL-safe), timezone, ZIP, brand color, `stripeAccountId`. |
| `Table`            | A unique seat at a venue. Holds `qrToken` (32-char random) and `label` ("Table 7", "Bar 3").                     |
| `StaffMember`      | A server, bartender, or manager. Belongs to a venue. Auth keyed on email.                                        |
| `GuestSession`     | An anonymous tab. 8-hour TTL. JSON `lineItems`, optional `paidAt`, optional `stripePaymentIntentId`.            |
| `Request`          | A signal: drink, bill, help, refill. Status machine `PENDING → ACKNOWLEDGED → RESOLVED` (or `ESCALATED`).      |
| `FeedbackReport`   | Stored only for 1–3-star ratings. Holds the guest note + AI-classified category and suggestion.                |
| `WebhookEvent`     | Stripe event ledger for idempotency. Insert on receive, mark `processedAt` on success.                           |

**Indexes.**

```sql
@@index([orgId])  on Venue
@@unique([venueId, label])  on Table  -- "Table 7" is unique per venue
@@index([venueId])  on StaffMember
@@index([venueId, tableId])  on GuestSession
@@index([expiresAt])  on GuestSession  -- for the 8h sweeper
@@index([venueId, status])  on Request  -- live queue lookups
@@index([sessionId])  on Request
@@index([venueId, createdAt])  on FeedbackReport
@@index([type, receivedAt])  on WebhookEvent
```

**Row-level security.** Not enabled for MVP because all DB writes go through Next.js routes that already enforce venue ownership in the session JWT. Add Supabase RLS in Phase 2 when third-party clients (e.g. mobile native) talk to PostgREST.

**Out of scope for MVP.** Menu, loyalty, happy-hour, multi-tenant org switching, audit log. Each becomes its own table when needed.

---

## 3. Auth and roles

**Strategy.** Cookie-borne JWT signed by the app, no session table. Two token types share `NEXTAUTH_SECRET`:

| Token   | TTL    | Purpose                                                   | Storage                |
| ------- | ------ | --------------------------------------------------------- | ---------------------- |
| Link    | 15 min | Sent in magic-link email. One-shot, validated on callback | URL `?token=…`         |
| Session | 30 day | Authenticates staff requests                              | `tabsignal_session` cookie, `httpOnly`, `SameSite=Lax`, `Secure` in prod |

**Roles.** MVP has one role: `STAFF`. The schema's `StaffRole` enum has only `STAFF`. Owner / manager distinction is deferred — at MVP scale the owner is also a staff member, just the only one. Role expands when we need a different live-queue UI for managers.

**Authorization.** Every authenticated route checks `session.venueId === resource.venueId`. There is no admin role; there is no cross-org access.

**Why no NextAuth.** It would require a Prisma adapter (3 extra tables) for what is one signed cookie. We'd revisit if we ever support OAuth providers.

---

## 4. APIs

### 4.1 Public (guest)

| Method | Path                                  | Purpose                                            | Notes                                  |
| ------ | ------------------------------------- | -------------------------------------------------- | -------------------------------------- |
| GET    | `/v/:slug/t/:tableId`                 | SSR landing page. Creates / reuses GuestSession.  | URL-decoded; QR token validated.       |
| POST   | `/api/requests`                       | Create a Request                                   | Rate-limited 1 / 30s per session.      |
| POST   | `/api/session/:id/items`              | Append line items (or staff-driven add)            | No auth in MVP, gated by session ID.   |
| GET    | `/api/session/:id/items`              | Read line items                                    |                                       |
| POST   | `/api/session/:id/payment`            | Create Stripe PaymentIntent                        | Server is source of truth for total.   |
| POST   | `/api/session/:id/feedback`           | Submit rating + optional note                      | Triggers Anthropic classify on 1–3.    |

### 4.2 Auth

| Method | Path                          | Purpose                                |
| ------ | ----------------------------- | -------------------------------------- |
| POST   | `/api/auth/start`             | Email a magic link. Always returns 200. |
| GET    | `/api/auth/callback?token=…`  | Set session cookie, redirect `/staff`.  |
| POST   | `/api/auth/logout`            | Clear cookie, redirect login.           |
| GET    | `/api/auth/me`                | Return current session (debug / SPA).   |

### 4.3 Staff (cookie required)

| Method | Path                                          | Purpose                                |
| ------ | --------------------------------------------- | -------------------------------------- |
| GET    | `/api/venue/:venueId/requests/live`           | Pending + acknowledged requests        |
| PATCH  | `/api/requests/:id/acknowledge`               | Mark ACKNOWLEDGED (server reads staffId from cookie) |
| PATCH  | `/api/requests/:id/resolve`                   | Mark RESOLVED                          |

### 4.4 Owner / admin

| Method | Path                                           | Purpose                              |
| ------ | ---------------------------------------------- | ------------------------------------ |
| POST   | `/api/admin/venue`                             | Setup wizard. Creates org+venue+tables. |
| GET    | `/admin/v/:slug/qr-tents`                      | Server-rendered printable QR sheet.   |

### 4.5 Webhooks

| Method | Path                            | Purpose                                              |
| ------ | ------------------------------- | ---------------------------------------------------- |
| POST   | `/api/webhooks/stripe`          | Verify signature, idempotently process events       |

### 4.6 Realtime backend (Fastify, separate origin)

| Method | Path                | Purpose                                             |
| ------ | ------------------- | --------------------------------------------------- |
| GET    | `/healthz`          | Liveness                                            |
| POST   | `/internal/emit`    | Next.js → Fastify. Validates `x-internal-secret`. Re-broadcasts to a Socket.io room. |

**Conventions.** All APIs are JSON. Zod validates request bodies; a Zod parse failure returns `400 { error: "INVALID_BODY" }`. Server timestamps are always ISO 8601 UTC. Money is always integer cents.

---

## 5. Realtime

**Transport.** Socket.io 4. Browser clients open a single connection on first interaction and reuse it across pages.

**Rooms.**
- `venue:{venueId}` — staff PWAs at this venue. New requests, acks, payment-confirmed events fan out here.
- `guest:{sessionId}` — the active guest browser. Receives the ack so they see "Server's on the way."

**Events.**

| Event                      | Direction              | Payload                                           |
| -------------------------- | ---------------------- | ------------------------------------------------- |
| `new_request`              | server → venue room    | `{ request: { id, type, tableLabel, …} }`         |
| `request_acknowledged`     | server → venue + guest | `{ request: { id, status, acknowledgedAt, …} }`   |
| `request_resolved`         | server → venue room    | `{ request: { id, status, resolvedAt } }`          |
| `payment_confirmed`        | server → venue + guest | `{ totalCents, tipCents, tableLabel, …}`          |
| `join` / `leave`           | client → server        | `{ venueId?, guestSessionId? }`                  |

**Why HTTP-and-emit, not direct DB pub/sub.** Upstash Redis REST doesn't support Pub/Sub, and we don't want a self-managed Redis yet. Next.js POSTs to `/internal/emit` after a DB write, Fastify fans out. The DB write is the source of truth; the emit is best-effort. A 30-second safety-net poll on the staff queue covers any dropped events.

**Reconnect.** Socket.io handles backoff (500 ms → 5 s, exponential). On reconnect the client re-emits `join` and the server re-broadcasts current state if the consumer has a way to reconcile (the staff queue refetches via REST on reconnect).

---

## 6. Integrations

| Service              | Purpose                          | Key var                                 | Notes                                                                                          |
| -------------------- | -------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Stripe               | PaymentIntents + Connect Express | `STRIPE_SECRET_KEY` (test/live)         | Platform fee `0.5%` of total via `application_fee_amount` + `transfer_data.destination`.       |
| Stripe Webhooks      | `payment_intent.succeeded`, `account.updated` | `STRIPE_WEBHOOK_SECRET`     | Idempotency in `WebhookEvent` table.                                                            |
| Anthropic Claude     | Classify 1–3-star feedback       | `ANTHROPIC_API_KEY`                     | Model `claude-haiku-4-5-20251001`. Prompt cache enabled on system + few-shot.                  |
| Resend               | Transactional email              | `RESEND_API_KEY` + `RESEND_FROM`        | `onboarding@resend.dev` until DNS verified. Magic-link + bad-rating alerts.                    |
| Supabase Postgres    | Primary store                    | `DATABASE_URL` + `DIRECT_URL`           | URL-encode the password (e.g. `@` → `%40`).                                                    |
| Firebase FCM (Phase 2)| Background push to staff PWA    | `FIREBASE_PROJECT_ID` etc.              | Foreground covered by Socket.io; FCM is for backgrounded.                                       |
| Twilio (future)      | SMS for owner happy-hour pings   | n/a                                     | Out of MVP.                                                                                     |

**Network etiquette.**
- Anthropic call has a 10 s timeout, retries once, falls back to "uncategorised" so feedback never blocks on the AI.
- Resend send is wrapped in try/catch — a feedback or magic-link request is never blocked by an email failure.
- Stripe webhook handler aborts and returns 500 if processing fails, letting Stripe retry.

---

## 7. Notifications

| Surface          | Channel                | Trigger                                    | Latency target |
| ---------------- | ---------------------- | ------------------------------------------ | -------------- |
| Staff PWA (fg)   | Socket.io              | New request, ack, payment confirmed        | <500 ms        |
| Staff PWA (bg)   | FCM (Phase 2)          | Same                                       | <5 s           |
| Manager email    | Resend                 | 1–3 ★ feedback                             | <60 s          |
| Owner email      | Resend (Mon 8am local) | Weekly report (Phase 2)                    | n/a            |
| Guest browser    | Socket.io              | Ack, payment confirmed                     | <500 ms        |

**Delivery guarantees.** None of these are exactly-once. Bad-rating email is at-most-once (we don't retry); webhooks are at-least-once (Stripe retries → idempotent on event ID); socket emits are best-effort. The DB write before the emit is what makes this safe — every emit can be reconstructed from data.

---

## 8. Storage

**Postgres (Supabase).** Everything structured.

**Object storage (Phase 2).** S3-compatible bucket via Supabase Storage:
- Logos uploaded by owners (`/venue/{id}/logo.png`).
- Generated bad-review PDFs (cache 30 days).
- POS receipt-image archives if we ever support menu OCR.

**Cookies.** `tabsignal_session` only. No analytics cookies in MVP.

**Browser storage.** None required. Future: `localStorage` for guest's loyalty stamp count tied to a fingerprint hash.

**Logs.** Pino on Fastify, `console.log` on Next.js. Both ship to Railway / Vercel logs. No long-term log retention until we need debug history.

---

## 9. Payments

**Model.** Stripe Connect Express. The platform (TabCall) is the merchant of record only for the 0.5 % fee; the venue collects the customer charge directly into their connected account.

**Flow.**

1. Guest reviews bill. Server creates `PaymentIntent` with:
   - `amount = subtotal + tax + tip` (cents, server-computed)
   - `currency = "usd"`
   - `automatic_payment_methods.enabled = true` (Apple Pay / Google Pay)
   - `transfer_data.destination = venue.stripeAccountId`
   - `application_fee_amount = round(amount * 0.005)`
   - metadata: `tabcall_session_id`, `tabcall_venue_id`, tip cents, tip percent
2. Browser confirms with Stripe Elements (`stripe.confirmPayment` with `redirect: 'if_required'`).
3. Stripe POSTs `payment_intent.succeeded` to our webhook.
4. Webhook is verified, deduped via `WebhookEvent`, then:
   - `GuestSession.paidAt` set.
   - `payment_confirmed` socket event to venue + guest rooms.
   - (Phase 2) FCM push to assigned server with the total + tip.

**Refunds.** Out of MVP. Owners refund manually in Stripe dashboard.

**Tax.** Hard-coded Texas mixed-beverage rate keyed by ZIP prefix (`lib/tax.ts`). Replaced by TaxJar in Phase 2.

**Risks specific to payments.**
- A guest could open the bill, leave, and come back hours later when items have been added by staff. Mitigation: PaymentIntent always recomputes total at create time; never trust client total.
- The connected account may not be fully onboarded yet. The webhook handler tolerates `transfer_data` failures (Stripe will return an error before we set `paidAt`).

---

## 10. Admin / operator surface

**Owner self-service (in-app).**
- Setup wizard: org + venue + tables.
- Settings sections (planned): Venue, Branding, Staff, Payments, Notifications, Billing.

**Operator console (you, internally).** Phase 2. Until then:
- Direct Postgres via Supabase Studio for support cases.
- Stripe dashboard for refunds and Connect onboarding.
- Resend dashboard for email delivery problems.
- A handful of SQL snippets in `docs/runbooks/` for common questions ("what was the busiest hour at venue X yesterday?").

There is no public sign-up flow. New venues are created via the setup wizard, which currently has no rate limit. This is fine while invitations are private (PRD has us doing concierge onboarding to Day-13). The wizard lives behind a venue-scoped path; it's not "open" in the way `/api/auth/start` is.

---

## 11. Rate limits

Per surface, MVP-friendly. In-memory bucket today (`lib/rate-limit.ts`); swap to Upstash Redis the hour we run two Next.js instances.

| Endpoint                       | Window | Max | Key                                   |
| ------------------------------ | ------ | --- | ------------------------------------- |
| `POST /api/requests`           | 30 s   | 1   | `req:{sessionId}`                      |
| `POST /api/auth/start`         | 60 s   | 3   | `auth:{ip}` and separately `auth:{email}` |
| `POST /api/session/:id/feedback`| 5 min  | 1   | `fb:{sessionId}`                      |
| `POST /api/session/:id/payment`| 60 s   | 5   | `pay:{sessionId}`                     |
| Stripe webhook                 | none   | n/a | Stripe enforces server-side; our handler is idempotent |
| `POST /internal/emit` (Fastify) | none + secret | n/a | Internal only, not exposed publicly  |

**Headers.** On a 429 we return `{ error: "RATE_LIMITED", retryAfterMs }` and set `Retry-After` in seconds. Clients (already done in `request-panel.tsx`) read the JSON, not the header — but the header is there for crawlers.

---

## 12. Security risks (and how we mitigate)

| Risk                                                         | Mitigation                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Stripe webhook spoofed                                       | Verify signature with `STRIPE_WEBHOOK_SECRET`. Idempotent on Stripe event ID via `WebhookEvent`.            |
| Replay of a magic link                                       | Tokens expire in 15 min, single-use enforced by short window. Strong claim subject (kind + staffId + email). |
| Session cookie theft via XSS                                 | `httpOnly`, `SameSite=Lax`, `Secure` in prod. We emit no inline scripts; all `dangerouslySetInnerHTML` is for SVG QRs only. |
| CSRF on staff routes                                         | `SameSite=Lax` + JSON-only requests + Next.js fetch from same origin. State-changing routes accept JSON, not form posts. |
| Cross-venue data leak                                        | Every authenticated route checks `session.venueId === resource.venueId`. Acknowledge / resolve return 403 otherwise. |
| Guest-fired DOS via request spam                             | Per-session rate limit. New session creation rate-limited per IP (Phase 2).                                 |
| Stripe restricted-key scope mistake                          | Use full secret `sk_test_…` in dev. Restricted keys reserved for production reads.                          |
| Internal emit endpoint hit from public                       | Shared secret. ALLOWED_ORIGINS pinned. CORS denies cross-origin.                                            |
| Bad-rating email contains injection from guest note          | All guest-supplied strings are HTML-escaped before insertion in templates (`escapeHtml`).                    |
| Anthropic classification leaks venue data into a prompt log  | Only the guest note is sent (no PII, no payment info). Cached system prompt is venue-agnostic.              |
| Database password in plaintext envs                          | `.env.local` gitignored. Owners set the password on Supabase directly. Rotate on key leak.                    |
| Connection string with `@`/`%` in password                   | URL-encode at write time. We encode `@`→`%40`, `%`→`%25`. Documented in env example.                        |
| QR token guessable                                           | 32 hex chars (128 bits). Brute-forcing one is computationally impractical. We accept failed QR attempts silently. |
| Live-mode keys leaked                                        | Cosmetic but real. Test mode is the contract for non-production. Live key rotation runbook below.            |

**Live-key leak runbook.** (1) Stripe Dashboard → Developers → API keys → Roll. (2) `git log --all -S 'pk_live_'` to find any historical commit; `git filter-repo` if found. (3) Notify Stripe support if it ever appears in a public repo.

---

## 13. Performance budgets

| Metric                                          | Target          |
| ----------------------------------------------- | --------------- |
| QR landing TTFB (SSR)                            | <300 ms p95     |
| QR landing largest contentful paint              | <1.5 s on LTE   |
| Request POST round trip (client → DB → emit)     | <400 ms p95     |
| Socket.io broadcast latency from emit → client   | <250 ms p95     |
| Setup wizard form submit                         | <1 s p95        |
| Bill page first interactive                      | <2 s on LTE     |

We measure these in Vercel Speed Insights + Fastify pino; alerting is Phase 2.

---

## 14. Observability

**MVP.**
- Vercel logs for Next.js. Pino logs for Fastify.
- Supabase logs for slow queries.
- Stripe Dashboard for webhook retries.

**Phase 2.**
- Sentry for client + server errors.
- Per-venue dashboard for response-time SLO.
- Lightweight tracing via OpenTelemetry only if a specific bug needs it.

**Health.**
- `GET /healthz` on Fastify returns `{ ok: true, uptimeSec, socketsConnected }`.
- A second endpoint `GET /api/health/db` (Phase 2) executes `SELECT 1` and returns latency.

---

## 15. Build sequence (architectural cut)

1. Schema + migration — done.
2. Auth (cookie JWT, magic link via Resend) — done.
3. Setup wizard + QR generator — done.
4. Real-time stack (Fastify, /internal/emit, browser singletons) — done.
5. Bill + Stripe Payment Element + webhook idempotency — done; needs `whsec_…` for end-to-end test.
6. Anthropic feedback intercept + Resend bad-rating email — done; needs feedback flow exercised.
7. FCM background push for staff PWA — Phase 2 prerequisite for production rollout.
8. Manager dashboard analytics + weekly Resend report — Phase 2.
9. Operator console + audit log — Phase 3.

---

## 16. Decisions we explicitly didn't take

- **No menu, loyalty, happy-hour in v1.** They're all schema-additive and can wait until a venue asks. (PRD §9 cuts.)
- **No GraphQL.** REST + Zod is enough for 9 routes.
- **No NextAuth.** Replaced by 100 lines of `jose`-backed JWTs. Reconsider when we need OAuth providers.
- **No Redis.** Rate-limit lives in process. Adopt Upstash the day we scale to >1 instance.
- **No microservices.** Next.js + Fastify is two services because of WebSocket physics, not because of architecture preference.
- **No multi-region.** Single-region (us-east) until response time at the second region's median venue degrades.

The spec is a contract. The MVP is the conversation. Both are written down.
