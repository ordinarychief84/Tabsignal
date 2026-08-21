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
4. Owner adds their menu (`/menu`) and tags items for discovery
   ("light", "bold", "sweet", "filling", "drink") — the tags drive the
   guest's "what are you in the mood for?" prompts.
5. Owner invites staff (`/staff`). Bartenders pick "Server", floor
   managers pick "Manager". The invite email walks them through
   choosing a password.
6. Owner assigns staff to tables (`/tables`) — this is what lets the
   guest welcome say "Meet Maya" instead of "a server".
7. Operator confirms in `/operator/orgs/<orgId>/overview` that the venue
   has tables and staff.

> TabCall does NOT take guest payments. There is no Connect account and
> no venue payout — the venue's own POS takes the order, holds the bill
> and settles the card. The only money TabCall handles is the venue's
> own subscription to us.

---

## 2. On-call response

### Sev-1 — guests can't reach a server

Requests are the product. If `/api/requests` is failing, guests are
sitting with their hands up and nobody knows.

1. Check the realtime service is up (Fly) — a request still WRITES if
   realtime is down, but `routedAt` tells you whether it actually
   reached anyone.
2. `SELECT type, status, "routedAt" FROM "Request" WHERE "venueId" = ...
   ORDER BY "createdAt" DESC LIMIT 20;` — rows with `routedAt` null
   were recorded but never routed.
3. The floor can still work the queue by polling: `/staff` refreshes on
   a 30s safety-net interval independent of the socket.

### Sev-2 — a venue's own subscription payment fails

This is the venue paying US. There is no Connect account and no
per-guest charge to investigate.

1. Stripe Dashboard → Customers → find the org's customer record →
   check the failed invoice.
2. Query the org's recorded state:
   ```sql
   SELECT o.name, o."subscriptionStatus", o."subscriptionPriceId",
          o."subscriptionPeriodEnd", o."trialEndsAt"
   FROM "Organization" o
   JOIN "Venue" v ON v."orgId" = o.id
   WHERE v.slug = '<slug>';
   ```
3. A `PAST_DUE` org keeps working — we do not cut off a venue
   mid-service over a card decline. Chase it commercially.
4. To comp or reinstate access immediately:
   `/operator/orgs/<orgId>/billing` → set the tier. That records the
   grant in our DB; pair it with a Stripe subscription on the
   customer if you want it to actually invoice next cycle.

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

### A locked-out owner or server

Sign-in is email + password (`/staff/login`). Magic-link sign-in was
removed — a link now only ever confirms an address or carries an invite.

1. **They forgot it.** Point them at `/forgot-password`. This is the
   normal path and needs nobody on-call.
2. **The reset email isn't arriving.** Check Resend logs. Reset tokens
   last one hour and are single-use.
3. **They never set one** (invited, never accepted). A manager can
   resend from `/admin/v/<slug>/staff` → "Resend invite". The invite
   lands on "Choose a password", which is what gives them a credential
   of their own.
4. **Their status blocks it.** Reset only works for `ACTIVE` rows:
   ```sql
   SELECT id, email, status, ("passwordHash" IS NOT NULL) AS has_password,
          ("emailVerifiedAt" IS NOT NULL) AS verified
   FROM "StaffMember" WHERE email = '<email>';
   ```
   `SUSPENDED` is a deliberate act by their manager — do not undo it
   from here; tell the manager.

### Pause a venue (kill switches)

Manager-facing toggle on `/admin/v/<slug>/settings`:
- `requestsEnabled = false` — guests get a "we're slammed" message
- `preorderEnabled = false` — pre-orders disabled
- `reservationsEnabled = false` — reservations disabled

Operator-side override (SQL):
```sql
UPDATE "Venue" SET "requestsEnabled" = false WHERE slug = '<slug>';
```

### A guest wants a refund

Not ours to give. TabCall never charged them — the venue's POS took the
payment on the venue's own terminal, so the refund happens there. If a
venue asks us to refund a guest, the answer is that we have no record of
the charge and no way to reverse it.

Venue SUBSCRIPTION refunds (the venue paying us) are a different thing
and are issued in the Stripe Dashboard as normal.

### A guest asked for a manager and nobody came

Service recovery fires only when the guest explicitly said yes after a
poor rating.

```sql
SELECT f.id, f.rating, f."managerRecoveryRequested", f."recoveryResolvedAt",
       t.label, f."createdAt"
FROM "FeedbackReport" f
JOIN "GuestSession" gs ON gs.id = f."sessionId"
JOIN "Table" t ON t.id = gs."tableId"
WHERE f."venueId" = '<venueId>' AND f."managerRecoveryRequested" = true
ORDER BY f."createdAt" DESC LIMIT 20;
```

The alert goes to the venue room over realtime, deliberately NOT to the
server who received the rating. If the venue watches no device on that
room, they will miss it — check what they actually have open.

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
