# Integration tests

The unit tests in `app/src/lib/__tests__/*.test.ts` run with `bun test`
against pure code (no DB, no network). The audit recommended a second
suite that exercises real routes against a real Postgres + Upstash
stub. This directory is the home for those tests once the test-DB
infrastructure lands.

## What to build first (priority order)

1. **Magic-link replay** — POST `/api/auth/start` with a known email,
   capture the dev `devLink` from the response (set `TABSIGNAL_DEV_LINKS=true`
   for the test env), GET `/api/auth/callback?token=…` twice. First call
   must redirect to `/staff` with a session cookie; second call must
   redirect to `/staff/login?err=already_used`. Guards the
   `LinkTokenUse.jti` unique-constraint single-use invariant.

2. **Multi-tenant isolation** — Seed two venues (A, B), one staff at A.
   For every admin route under `/api/admin/v/[slug]/*`, call the route
   with venue B's slug while authenticated as venue A's staff. Every
   call must return 403 or 404. Use a fixtures file listing every route
   path and HTTP method so a new route forces a corresponding test row.

3. **Role gate parametric** — For each role (OWNER, MANAGER, SERVER,
   HOST, VIEWER, STAFF) at venue A, hit every mutation route under
   `/api/admin/v/[slug]/*` and `/api/admin/staff/*`. Expected matrix
   lives in `role-gates.test.ts` — extend that into a real HTTP test
   here.

4. **Guest request lifecycle** — Create a guest session via
   `resolveGuestSession`. POST `/api/requests` with the right token
   (201), wrong token (403), expired session (410), closed session (410).
   Assert the rate-limit applies only after a successful token check
   (the cross-IP DoS fix).

5. **Webhook idempotency** — POST the same Stripe event ID twice
   concurrently. Assert only one DB mutation runs and the second
   response is `{ received: true, duplicate: true }`.

6. **Split payment finalization** — Create three splits for a single
   session. Fire `payment_intent.succeeded` for splits 1 and 2 — assert
   `session.paidAt` stays null. Fire for split 3 — assert `paidAt` is
   set and exactly one `payment_confirmed` event is emitted (the venue
   room and the guest room each get one; assert exactly that).

7. **Rate-limit (with Upstash in CI)** — Stand up a local Upstash REST
   stub (or `npm:@upstash/redis` against `npx redis-cli` via the REST
   shim). Prove the 30s window on `/api/requests` and that two different
   IPs against the same legitimate session share the same bucket
   (sessionId-only key) — but the token check now blocks unauthenticated
   bucket-burning attackers.

8. **Sign-out everywhere** — Sign in, capture cookie A; sign in again,
   capture cookie B; POST `/api/auth/sign-out-everywhere` with cookie B;
   assert subsequent requests with cookie A return 401 (because
   `sessionsValidAfter` bumped past A's `iat`).

9. **Stripe Connect impersonation block** — As an operator, impersonate
   into a venue; POST `/api/admin/v/[slug]/stripe/connect`; expect 403
   `IMPERSONATION_BLOCKED`.

## Infrastructure

- A migrations-applied test DB (separate from dev). `prisma migrate
  reset --force --skip-seed` in the CI job before the suite runs.
- An Upstash REST shim so `rateLimitAsync` exercises the production
  path, not the in-memory fallback. The current unit tests assert the
  in-memory path; we need to assert the Redis-backed path too.
- A Stripe webhook signer (Stripe SDK exports `Webhooks.generateTestHeaderString`).
- A small `request(route, opts)` helper that hits the Next.js app via
  the App Router test harness (`@testing-library/next/server-test` once
  it exists, or `unstable_NextRequest` shim today).

## Why these aren't here yet

The audit landed a tight set of unit-level guarantees but the team
chose to keep the test DB out of the worktree to avoid checking in
infra. This README is the contract for the next test-infra PR.
