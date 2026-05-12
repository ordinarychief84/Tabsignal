# TabCall — Operator Runbook

Day-2 operations for the platform owner. Covers launch checks,
on-call response, common incidents, and forensic queries.

---

## 1. Launch checklist

### Pre-launch (one-time)

- [ ] **Database migrated.** Run `bunx prisma migrate deploy` in the
      `app/` directory of your prod-pointing checkout. Confirm with
      `bunx prisma migrate status` — should print "Database schema is up
      to date." Apply order matters; the 20260511 set adds:
      - `staff_role_owner_default` — fixes the silent OWNER-vs-STAFF bug
      - `feedback_session_unique` — DB-level guard on one-feedback-per-session
      - `operator_audit_log` — impersonation forensics
      - `staff_sessions_valid_after` — real "sign out everywhere"
- [ ] **Env vars set in Vercel Production.** Required:
      `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET` (32+ chars),
      `APP_URL`, `FASTIFY_INTERNAL_URL`, `INTERNAL_API_SECRET` (16+),
      `NEXT_PUBLIC_SOCKET_URL`, `UPSTASH_REDIS_REST_URL`,
      `UPSTASH_REDIS_REST_TOKEN`, `STRIPE_SECRET_KEY`,
      `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM` (verified
      domain — must NOT end in `@resend.dev`).
- [ ] **Stripe webhook configured.** Point at
      `https://<APP_URL>/api/webhooks/stripe` and subscribe to:
      `payment_intent.succeeded`, `payment_intent.payment_failed`,
      `charge.refunded`, `account.updated`,
      `account.application.deauthorized`,
      `customer.subscription.created`, `customer.subscription.updated`,
      `customer.subscription.deleted`.
- [ ] **Fastify realtime backend deployed.** `api/` directory builds to
      Fly.io. Verify `GET /healthz` returns `{ ok: true }`. Must share
      `NEXTAUTH_SECRET` with the Next.js app or socket auth fails.
- [ ] **Vercel cron registered.** Confirm both cron jobs in
      `vercel.json` (`/api/cron/benchmarks` daily 04:00, `/api/cron/escalate`
      every minute). Set `BENCHMARK_CRON_SECRET` and verify by manually
      curling `/api/cron/escalate` with the right Authorization header.
- [ ] **`OPERATOR_EMAILS` populated** with the platform-staff allowlist
      (comma-separated). At least one entry — otherwise no one can sign
      into `/operator` until the `PlatformAdmin` table seeds itself.
- [ ] **Smoke test** the full flow on a real iPhone: scan QR → call
      server → staff acks → bill flow → leave 5★ review → confirm
      Google review link works. Then repeat with a 1★ → confirm the
      manager-alert email lands within 30 seconds.

### Per-venue onboarding

1. Operator creates the org/venue via `/operator/venues/new` OR the
   owner self-serves at `/signup`.
2. Owner clicks magic-link email → lands on `/admin/v/<slug>/onboarding`.
3. Owner adds tables (`/qr-tents` page generates QR code sheets).
4. Owner connects Stripe (`/settings` → "Connect Stripe" → completes
   Stripe-hosted onboarding). Verify `Venue.stripeChargesEnabled = true`
   after the redirect.
5. Owner invites staff (`/staff`). Bartenders pick "Server", floor
   managers pick "Manager".
6. Operator confirms in `/operator/orgs/<orgId>/overview` that the venue
   has tables, staff, and a Stripe Connect account.

---

## 2. On-call response

### Sev-1 — guest can't pay (PaymentIntent fails)

1. Check Stripe Dashboard → recent events for the venue's Connect
   account. Most common: `stripeChargesEnabled = false` because the
   venue didn't finish onboarding.
2. Query the venue:
   ```sql
   SELECT slug, stripeAccountId, stripeChargesEnabled, stripeDetailsSubmitted
   FROM "Venue" WHERE slug = '<slug>';
   ```
3. If `stripeChargesEnabled = false`, the bill flow already shows
   guests a "Pay in person" fallback (see
   `app/src/app/v/[slug]/t/[tableId]/bill/bill-screen.tsx`). Tell the
   venue to finish onboarding via Settings → "Connect Stripe."
4. If charges are enabled but PIs are still failing: check Sentry for
   the venue's error patterns; most likely a Stripe API key rotation
   issue or an invalid `application_fee_amount` (we charge 0.5%).

### Sev-1 — staff queue not receiving requests

1. Confirm Fastify is up: `curl https://<fastify-host>/healthz`.
2. Verify `INTERNAL_API_SECRET` matches between Next.js and Fastify.
3. Check the venue's staff PWA: open DevTools → Network → look for the
   socket connection. `auth UNAUTHORIZED` means the JWT-based room auth
   is failing — usually `NEXTAUTH_SECRET` is mismatched between the
   two services.
4. Verify staff records exist:
   ```sql
   SELECT COUNT(*) FROM "StaffMember" WHERE "venueId" = (SELECT id FROM "Venue" WHERE slug = '<slug>') AND status = 'ACTIVE';
   ```
5. As a fallback, the 30s reconciliation poll on the staff queue will
   eventually pick up new requests even if sockets are down.

### Sev-2 — bad-rating email never arrived

1. Check Resend dashboard for the venue's domain or recipient address.
2. Confirm `Venue.alertEmails` is set or `OPERATOR_EMAILS` has at least
   one entry (the email goes to the union of both, deduped).
3. Query feedback:
   ```sql
   SELECT id, rating, "aiCategory", "createdAt" FROM "FeedbackReport"
   WHERE "venueId" = (SELECT id FROM "Venue" WHERE slug = '<slug>')
   ORDER BY "createdAt" DESC LIMIT 10;
   ```
4. If rating ≥ 4 and no email landed, that's correct — only 1-3★ trigger
   the email (4-5★ → Google review CTA only).

### Sev-2 — staff member can't sign in

1. They're either suspended or sit on the legacy `STAFF` role.
2. Query:
   ```sql
   SELECT id, email, role, status, "lastSeenAt", "sessionsValidAfter"
   FROM "StaffMember" WHERE email = '<email>';
   ```
3. Status `SUSPENDED` → un-suspend via the manager's `/staff` page.
4. `sessionsValidAfter` recently bumped → they hit "Sign out everywhere"
   and need to sign back in.
5. Role still `STAFF` (legacy) → run the dev backfill:
   `UPDATE "StaffMember" SET role='OWNER' WHERE role='STAFF';` (only
   safe for venue creators; review the row first).

### Sev-3 — operator imitating venue is showing wrong identity

1. Confirm impersonation is active:
   ```sql
   SELECT * FROM "OperatorAuditLog"
   WHERE action = 'operator.impersonate.start'
     AND "actorEmail" = '<operator-email>'
   ORDER BY "createdAt" DESC LIMIT 5;
   ```
2. The "Stop impersonation" banner should appear on every admin page
   while impersonating. If it doesn't, the `tabsignal_operator_session_before_impersonation`
   cookie was cleared early — sign out and back in to fully reset.

---

## 3. Forensic queries

### "Who promoted this server to Manager three weeks ago?"

```sql
SELECT "createdAt", "actorEmail", "actorRole", metadata
FROM "AuditLog"
WHERE "venueId" = (SELECT id FROM "Venue" WHERE slug = '<slug>')
  AND action LIKE 'staff.role%'
ORDER BY "createdAt" DESC;
```

### "Did anyone from TabCall log into Venue X's dashboard?"

```sql
SELECT "createdAt", "actorEmail", action, "targetId", metadata
FROM "OperatorAuditLog"
WHERE "targetType" = 'Venue'
  AND "targetId" = (SELECT id FROM "Venue" WHERE slug = '<slug>')
ORDER BY "createdAt" DESC;
```

### "Show me bad reviews and what AI categorised them as"

```sql
SELECT "createdAt", rating, "aiCategory", "aiSuggestion", note
FROM "FeedbackReport"
WHERE "venueId" = (SELECT id FROM "Venue" WHERE slug = '<slug>')
  AND rating <= 3
ORDER BY "createdAt" DESC LIMIT 20;
```

### "What did webhook event `evt_xxx` actually do?"

```sql
SELECT id, type, "receivedAt", "processedAt", error, payload->'data'->'object'->>'id' AS object_id
FROM "WebhookEvent"
WHERE id = 'evt_xxx';
```
(processedAt = NULL means it crashed mid-process; check `error` column.)

---

## 4. Common manual operations

### Backfill a Stripe webhook delivery you missed

Stripe Dashboard → Developers → Webhooks → the failing endpoint → click
the event → "Resend." The handler is idempotent (row-locked via
`SELECT … FOR UPDATE` on `WebhookEvent.id`) so re-delivery is safe.

### Re-issue a magic link for a locked-out owner

```sql
SELECT id, email FROM "StaffMember" WHERE email = '<email>';
```
Then in the operator console: `/operator` → impersonate that venue. From
the impersonated session you can resend the invite (`/admin/v/<slug>/staff`
→ "Resend invite"). Or, via SQL only:
```sql
UPDATE "StaffMember" SET status = 'INVITED' WHERE id = '<staffId>';
```
Then have them retry sign-in at `/staff/login`.

### Pause a venue (kill switches)

Manager-facing toggle on `/admin/v/<slug>/settings`:
- `requestsEnabled = false` — guests get a "we're slammed" message
- `preorderEnabled = false` — pre-orders disabled
- `reservationsEnabled = false` — reservations disabled

Operator-side override (SQL):
```sql
UPDATE "Venue" SET "requestsEnabled" = false WHERE slug = '<slug>';
```

### Refund a guest payment

Issue the refund in **Stripe Dashboard** (Charges → find the charge →
Refund). The `charge.refunded` webhook handler will:
- Append a negative refund line-item to the GuestSession
- Mark BillSplit.paidAt=null on full split refunds
- Cancel matching PreOrders if fully refunded
- Emit a `payment_refunded` realtime event so the manager UI sees it

Do NOT manually edit `GuestSession.lineItems` — let the webhook do it
so the state stays consistent.

---

## 5. Things NOT to do

- **Never `prisma migrate reset` against production.** It drops the DB.
- **Never edit `WebhookEvent` rows manually.** Resending the event from
  Stripe is the safe path.
- **Never share a magic-link URL externally.** The jti is single-use;
  forwarding to another person locks the legitimate user out.
- **Never disable the Origin header check** without replacing it with a
  CSRF-token equivalent. `SameSite=Strict` is defense-in-depth, not the
  only defense.
- **Never set `OPERATOR_EMAILS=""` in production.** With no platform
  staff and the `PlatformAdmin` table empty, no one can administer the
  platform. If you must rotate, add the new admin first.

---

## 6. Known limitations (MVP)

- Staff push notifications via FCM exist but require per-venue VAPID/
  Firebase config. Without it, backgrounded PWAs miss alerts (the 30s
  poll catches them on the next foreground).
- Multi-region: rate-limit and webhook idempotency assume a single
  Postgres + a single Upstash. Adding a second region requires
  Upstash global replication.
- No GDPR-style "delete my account" flow for guests. Loyalty profiles
  can be manually deleted via SQL; document this on your privacy page.
- No SOC2-grade tamper-evidence on `AuditLog`/`OperatorAuditLog` —
  they're append-only but the DB role has write access. Add row-hash
  chaining before any SOC2 audit.
