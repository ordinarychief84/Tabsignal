# TabCall Operations Runbook

Procedures for production incidents and recurring ops tasks.

---

## Local development database (required setup)

Local dev runs against **local Postgres only**. `scripts/assert-dev-db.mjs`
front-runs `dev` and every `db:*` script and refuses a remote
`DATABASE_URL` (the months of dev-against-prod are over — that's how the
P3009 saga started). Escape hatch for conscious remote work (incident
inspection): `ALLOW_REMOTE_DB=1 bun run db:studio`.

First-time setup (Homebrew):

```bash
brew install postgresql@16 && brew services start postgresql@16
createdb tabcall_dev
# .env.local (note the explicit user — Prisma doesn't default to the OS user):
#   DATABASE_URL="postgresql://<your-macos-username>@localhost:5432/tabcall_dev"
#   DIRECT_URL="postgresql://<your-macos-username>@localhost:5432/tabcall_dev"
bun run db:bootstrap   # replays the full migration chain (see below)
bun run db:seed        # "The Local Dev Taproom" + tables + staff + menu + open tab
```

Docker instead: `docker compose -f docker-compose.dev.yml up -d`, then the
same bootstrap + seed (URL: `postgresql://tabcall:tabcall@localhost:5432/tabcall_dev`).

`db:bootstrap` exists because two historical migrations can't replay
verbatim on an empty database (enum-value-used-in-same-transaction, and
RLS on two prod-only Studio-era tables). The originals are untouched —
production's migration history still matches — the bootstrap applies
equivalent variants from `scripts/bootstrap/` and marks them applied.
The seed is idempotent and prints ready-to-open guest QR URLs and staff
logins (`maya@dev.local` / `devpass123`).

---

## P0: Signup is returning 500 (or any DB write fails with "column does not exist")

**Cause:** Production schema is missing columns or tables that the deployed
application code expects. Usually triggered when a PR adds a Prisma migration
that wasn't applied to the prod DB by `prisma migrate deploy`.

**Why this happens here:** Vercel builds run `prisma generate`, NOT
`prisma migrate deploy`. The prebuild hook in `scripts/prebuild-migrate.mjs`
attempts to run `migrate deploy` on production builds, but it cannot
operate on a database whose schema was set up outside Prisma (P3005
"database schema is not empty") or that has a failed migration row
(P3009 "migration failed in target database"). The hook degrades to a
warning in those cases so deploys don't block, but the migration still
needs to be applied manually.

### Fix

1. Open Supabase SQL Editor on a fresh "+ New query" tab:
   https://supabase.com/dashboard/project/ydcftjsmutszeznjhcdv/sql/new

2. Paste the contents of [`scripts/baseline-prod.sql`](../scripts/baseline-prod.sql),
   click **Run**. If a "Potential issue detected — RLS" dialog fires, click
   "Run and enable RLS".

3. The script ends with a diagnostic SELECT. Verify the output:

   | check_name | expected |
   |------------|----------|
   | `venue_cols` | array of 5 columns: country, onboardingCompletedAt, onboardingState, phoneNumber, venueType |
   | `staffstatus_values` | array including `DELETED` |
   | `password_reset_table_exists` | `true` |
   | `failed_migration_row` | `cleared` (or `finished` / `no row`) |
   | `baseline_rows_present` | `4` |

4. Test signup with a fresh email at https://www.tab-call.com/signup
   — should return 201 (or 429 RATE_LIMITED if the IP is throttled, but
   NOT 500).

5. After this is applied, future Vercel deploys with new Prisma
   migrations will apply via the prebuild hook automatically. No more
   manual SQL.

### Adding a new schema change after this

Standard Prisma workflow works:

```bash
# in your local checkout
cd app
bunx prisma migrate dev --name <description>
git add prisma/
git commit -m "feat: <schema change>"
git push   # PR → merge → Vercel deploy → prebuild runs migrate deploy automatically
```

---

## P0: Vercel build is failing with "exited with 1"

Read the build log to identify the failure mode:

1. https://vercel.com/tab-call-projects/tabsignal/deployments
2. Click the failed deploy
3. Expand "Build Logs"

Common modes:

| Error keyword | What's happening | Action |
|--------------|------------------|--------|
| `P3005`, `db_schema_not_empty` | DB has tables but no `_prisma_migrations` history | Run `scripts/baseline-prod.sql` |
| `P3009`, `database schema is not empty` | A previous migration failed | Run `scripts/baseline-prod.sql` (Step 1 clears it) |
| `Module not found "bunx"` | Old prebuild script tried `bunx` | Should be fixed by PR #47; verify `scripts/prebuild-migrate.mjs` uses `node_modules/.bin/prisma` directly |
| `npm run build exited with 1` no further detail | Something other than migrate; inspect "Build Logs" section in the deploy overview | Click "Build Logs" — actual error is at the bottom |

---

## Restaurant onboarding flow check

To verify the end-to-end signup flow is healthy:

```bash
curl -i -X POST 'https://www.tab-call.com/api/signup' \
  -H 'content-type: application/json' \
  -d '{
    "ownerName": "Test Owner",
    "restaurantName": "Healthcheck Diner '"$(date +%s)"'",
    "address": "100 Main St Houston TX 77002",
    "phoneNumber": "+12125551234",
    "country": "US",
    "email": "healthcheck-'"$(date +%s)"'@example.com",
    "password": "StrongHealthcheck-2026",
    "agreeTerms": true
  }'
```

Expected: **HTTP 201** with body like `{"ok":true,"slug":"..."}`.

If 429 RATE_LIMITED: the test IP has been signed up >5 times this hour.
Wait, or use a different IP.

If 500: something is wrong. Inspect Vercel runtime logs and re-run
`scripts/baseline-prod.sql`.

If 400: the request body shape is wrong. Check the route's Zod schema
in `src/app/api/signup/route.ts`.

---

## Rotating the database password

If a `DATABASE_URL` is exposed:

1. https://supabase.com/dashboard/project/ydcftjsmutszeznjhcdv/settings/database
2. Scroll to "Database password" → click **Reset password**
3. Save the new password somewhere safe
4. Vercel auto-syncs the new URL via the Supabase integration (no env
   var update needed — DATABASE_URL is integration-injected, not a
   plain Vercel env var)
5. Vercel re-deploys automatically with the new URL

After rotation, the leaked URL stops working within 1-2 minutes.

---

## Rate limit reset for testing

The signup endpoint is rate-limited to 5/hour per IP. To bypass for
testing:

- Wait an hour, or
- Test from a different IP (cellular, VPN, different network), or
- Drop the rate-limit window in Upstash dashboard:
  https://console.upstash.com — find the key `signup:ip:<your-ip>` and
  delete it.

Don't lower the production rate limit just for testing.
