# Security audit, 2026-05-13

## Summary
14 findings: 0 critical, 5 high, 6 medium, 3 low.
6 fixed in this PR. 8 flagged for review.

Scope covered: new Guest Commerce Module routes (orders, bills, splits, wishlist, promotions), admin venue routes (orders, bills, promotions, branding, pos), the Stripe webhook V2-split branch, POS AES-256-GCM crypto, the SVG XSS guard across three upload endpoints, /guest/[qrToken]/* pages, the admin-redirect helper, and the 20260512_guest_commerce_v2 migration.

## Findings

### Finding #1: Cross-table bill read inside a venue (horizontal IDOR)
Severity: High
File: app/src/app/api/v/[slug]/bills/[billId]/route.ts
Lines: 18-77 (pre-fix), 18-79 (post-fix)
Why it matters: The pre-fix GET only checked that the requesting session belonged to the same venue. Any guest holding a valid session token at venue X could read a bill at venue X for a different table, provided they knew (or guessed) the billId. Bill ids are cuids and not feasibly enumerable, but the moment a bill id leaks (URL share, screenshot, log line, copy-paste in chat), every active session at the venue can fetch full bill data, including item names, prices, and per-split state. The old code also carried a confused "scan up to 50 sessions" comment around a `findFirst` that only ever returns one row.
Fix applied: yes. Replaced the two-pass session lookup with a direct `findUnique` by `sessionToken`, kept the constant-time token compare, and tightened the bill scope to require both `venueId` and `tableId` to match the requesting session. Same-venue / other-table requests now 404.
Recommended fix (if not applied): n/a

### Finding #2: Cross-table split-pay attack inside a venue (horizontal IDOR)
Severity: High
File: app/src/app/api/v/[slug]/bills/[billId]/splits/route.ts
Lines: 99-119 (pre-fix), 76-126 (post-fix)
Why it matters: The pre-fix split POST only verified that the bill's `venueId` matched the venue derived from the slug. A guest at table A who knew a billId belonging to table B could mint a `BillSplitV2` against B's bill, claim its items, get a Stripe `clientSecret`, and complete payment, potentially blocking the legitimate diners at B from paying for those items (a denial-of-service / griefing vector). The webhook would then post the receipt against B's bill but the payer is A's session.
Fix applied: yes. Added `tableId` to the session lookup, added `tableId` to the `SELECT ... FOR UPDATE` raw query on `Bill`, and refuse the split if `billRow.tableId !== session.tableId`. Locking semantics are unchanged.
Recommended fix (if not applied): n/a

### Finding #3: SVG `<script>` guard fails on whitespace-bypass payloads
Severity: High
File:
- app/src/app/api/admin/v/[slug]/branding/logo/route.ts
- app/src/app/api/admin/v/[slug]/branding/banner/route.ts
- app/src/app/api/admin/v/[slug]/promotions/banner/route.ts
Lines:
- branding/logo: 17-18, 63-73 (pre-fix), 17-22, 67-78 (post-fix)
- branding/banner: 17-18, 61-69 (pre-fix), 17-22, 64-75 (post-fix)
- promotions/banner: 16-16, 58-70 (pre-fix), 16-26, 60-71 (post-fix)
Why it matters: The previous regex `/<script/i` matched `<script` case-insensitively but did not tolerate whitespace between `<` and `script`. A payload like `< script src="...">` or `<\tscript ...>` would slip past the sniff. The 4 KB scan window is also tight enough that a `<script` tag straddling the 4 KB boundary (e.g. starting at byte 4093) could be split, leaving only `<sc` visible in the slice. For the promotions banner route, the scan was *only* performed when `contentType === "image/svg+xml"`. A caller can lie about Content-Type and post an SVG with `image/png` Content-Type to bypass the scan entirely.
Fix applied: yes. Replaced `/<script/i` with `/<\s*script\b/i` everywhere (matches `< script`, `<\tscript`, etc.). Increased the scan window from 4 KB to 8 KB to absorb boundary-straddle payloads. In promotions/banner, the scan now runs for every upload regardless of Content-Type.
Recommended fix (if not applied): n/a

### Finding #4: `wishlist/share` POST has no rate limit and fans out to staff realtime channel
Severity: High
File: app/src/app/api/v/[slug]/wishlist/share/route.ts
Lines: 26-29 (pre-fix), 26-43 (post-fix)
Why it matters: Each POST to `/wishlist/share` emits a `wishlist_shared` event into the venue's realtime staff channel (consumed by `app/src/app/staff/queue.tsx`). A guest session can repeatedly hit the share endpoint to flood the staff queue with toast notifications, even though the wishlist contents don't change. The pre-fix route had no per-session, per-venue, or per-IP cap.
Fix applied: yes. Added a 5/min per-session rate limit with the standard `rateLimitAsync` helper. Token validation still happens after the gate, so the cap protects the DB writes and the realtime emit.
Recommended fix (if not applied): n/a

### Finding #5: `wishlist/convert` POST has no rate limit
Severity: Medium
File: app/src/app/api/v/[slug]/wishlist/convert/route.ts
Lines: 26-29 (pre-fix), 27-42 (post-fix)
Why it matters: Lower-impact than `share` (it only flips wishlist status) but a tight loop on this endpoint still produces DB write pressure per session. Added a rate limit for parity with the rest of the guest commerce surface.
Fix applied: yes. 10/min per session.
Recommended fix (if not applied): n/a

### Finding #6: Stripe `clientSecret` passed via URL query string on the pay page
Severity: Medium
File: app/src/app/guest/[qrToken]/pay/page.tsx (consumes), app/src/app/guest/[qrToken]/bill/bill-split-screen.tsx (produces)
Lines:
- pay/page.tsx:11-12, 27-28, 73-74
- bill/bill-split-screen.tsx:96-97
Why it matters: The split-pay flow builds `qs = new URLSearchParams({ split, secret })` and navigates to `/guest/<qrToken>/pay?split=...&secret=...`. The client secret travels in the URL: it can leak through Referer headers when the pay page loads third-party Stripe scripts, end up in browser history, get pasted into chat, or be captured by browser extensions. Stripe's published guidance is that client secrets shouldn't appear in URLs or be logged. The current value is short-lived and scoped to one PaymentIntent, but it grants payment confirmation rights to whoever holds it.
Fix applied: no (touches the produce/consume flow on both client surfaces).
Recommended fix: Instead of redirecting with the secret in the URL, persist it in `sessionStorage` keyed by `splitId` before navigation, then read it from `sessionStorage` on the pay page. Alternatively, expose a small JSON endpoint at `/api/v/<slug>/splits/<splitId>/client-secret?s=<token>` that returns the secret to an authorized session, and have the pay page fetch it on mount. Either keeps the secret out of URLs and out of the document referrer.

### Finding #7: `bill/[billId]` page does not constant-time compare table-bound qrToken
Severity: Medium
File: app/src/lib/session.ts
Lines: 97-99
Why it matters: `resolveGuestSession` compares `qrToken !== table.qrToken` with `!==`. This is the legacy `/v/[slug]/t/[tableId]?s=<qrToken>` path (the new `/guest/[qrToken]/...` path uses `findUnique`, which is fine). The string compare is short-circuiting and could leak prefix-match timing. It's behind an indexed table.qrToken lookup, so the difference is small in practice, but a tightening still helps.
Fix applied: no (existing legacy route, would broaden the scope of this audit; the new `/guest/[qrToken]` path uses a DB-side `findUnique`).
Recommended fix: import `timingSafeEqual` and apply the same `tokensEqual` helper used in the API routes. Same module already imports `randomBytes` from `node:crypto` so the dependency is free.

### Finding #8: Wishlist GET reads body (`req.json()`) on a GET request
Severity: Low
File: app/src/app/api/v/[slug]/wishlist/route.ts
Lines: 95-122
Why it matters: HTTP GET with a request body is technically allowed but ill-defined. `fetch(url, { method: "GET", body: ... })` throws in browsers and some intermediate proxies / load balancers strip bodies on GET. The route also requires `sessionId` + `sessionToken` in the body, which means a casual cache-busting GET would 400. No call site currently uses this GET, so the practical impact is "this endpoint doesn't work the way the verb implies".
Fix applied: no (architectural).
Recommended fix: change to POST or move `sessionId` + `sessionToken` to query string with the same constant-time compare.

### Finding #9: New tables in `20260512_guest_commerce_v2` migration have no RLS
Severity: Medium
File: app/prisma/migrations/20260512_guest_commerce_v2/migration.sql
Lines: 50-271 (every CREATE TABLE in this migration)
Why it matters: 12 new tables (`Order`, `OrderItem`, `Bill`, `BillItem`, `BillSplitV2`, `BillSplitItem`, `Promotion`, `PromotionItem`, `Wishlist`, `WishlistItem`, `VenueBranding`, `PosIntegration`, `PosSyncLog`) ship without `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and without any policies. Supabase exposes these tables to PostgREST under the `anon` and `authenticated` roles unless RLS is on. Direct-postgres connections through Prisma's pooled URL are unaffected (they use the connection-level role), but anyone hitting `https://<project>.supabase.co/rest/v1/Order` with the anon key could enumerate orders, bills, splits, and POS rows including `encryptedCredentials` (encrypted, but still). The user's note says they clicked "Run and enable RLS" in Supabase Studio after the migration; that needs to be verified at the project level.
Fix applied: no (architectural / DB-only).
Recommended fix: add a follow-up migration that enables RLS on every new table and either ships zero permissive policies (so PostgREST returns empty for `anon` / `authenticated` and Prisma's privileged role still has full access) or ships explicit per-table policies. Verify in Supabase Studio with `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('Order','OrderItem','Bill', ...)`.

### Finding #10: Orders route per-session rate cap may starve legitimate retries
Severity: Low
File: app/src/app/api/v/[slug]/orders/route.ts
Lines: 52-66
Why it matters: The order POST is capped at 1 per 30 seconds per session and 30 per minute per IP. If a transient network blip causes the client to retry, the second call within 30s gets a 429 even though the first one might have already failed pre-DB. The IP cap is reasonable; the per-session cap may be too tight in a busy table-share scenario where one tablet drives multiple guests.
Fix applied: no (product decision; the agent comment indicates it's intentional).
Recommended fix: leave as-is for now; if retry support is needed, add a Stripe-style idempotency key based on a client-generated UUID and let same-key retries succeed.

### Finding #11: V2 webhook trusts `tabcall_v2_split_id` without cross-checking metadata venue
Severity: Low
File: app/src/app/api/webhooks/stripe/route.ts
Lines: 99-151
Why it matters: The Stripe signature verification (lines 23-34) is the actual authority. Metadata sits inside the signed payload, so an attacker can't forge values. The branch looks up the split by id, derives the bill, and writes the bill totals. The cross-venue forgery scenario the audit prompt called out (one venue's secret used to settle another's bill) requires forging the signed event, which Stripe prevents. The webhook doesn't cross-check `intent.metadata.tabcall_venue_id` against the bill's venue, but that's belt-and-suspenders rather than a real gap.
Fix applied: no (defensive; not exploitable as described given Stripe signature verification).
Recommended fix: optionally add `if (intent.metadata.tabcall_venue_id && intent.metadata.tabcall_venue_id !== bill.venueId) return;` before mutating, so a misconfigured-by-us API call (not an attacker) is caught.

### Finding #12: POS encryption review (no issue)
Severity: Low (informational)
File: app/src/lib/pos/crypto.ts
Lines: 23-76
Why it matters (no issue): AES-256-GCM with a 12-byte random IV (`randomBytes(IV_BYTES)`) per encrypt, auth tag stored separately, `setAuthTag` called before `final()` on decrypt, no decrypt-then-compare timing leak. Key derivation is `SHA-256("pos-credentials-v1:" + NEXTAUTH_SECRET)` with a length-and-presence check (`secret.length < 32`). Wire format is versioned (`v1:...`). The only soft point is that a NEXTAUTH_SECRET rotation invalidates every existing ciphertext (no key-id ladder), but that's a Day-Two operational concern, not a Day-Zero security gap. Marking as informational so the next auditor knows it was reviewed.
Fix applied: n/a
Recommended fix: when a real rotation is needed, add `v2:` with a side-by-side decrypt for the previous key for a short overlap.

### Finding #13: Admin redirect helper review (no issue)
Severity: Low (informational)
File: app/src/lib/admin-redirect.ts
Lines: 15-30
Why it matters (no issue): The helper redirects to `/staff/login?next=...` when there's no session and to `/admin/v/<slug>/<subpath>` once authenticated. The `subpath` is supplied by static callers (`branding`, `promotions`, `menu`, `bills`, `pos`, `orders`) and never sourced from user input, so there's no open-redirect or path-injection risk. The login `next` parameter is later validated by `staff/login/page.tsx:21` with `next.startsWith("/") && !next.startsWith("//")` before being used, which blocks `//evil.com/...` style open redirects.
Fix applied: n/a
Recommended fix: n/a

### Finding #14: Bills GET endpoint has no rate limit (admin side)
Severity: Low
File: app/src/app/api/admin/v/[slug]/bills/route.ts (and orders, promotions admin GETs)
Lines: throughout
Why it matters: Admin GETs are gated by staff session + plan-and-role check, so the abuse surface is low. A logged-in low-tier staff making expensive recurring queries against the orders / bills tables could still cause DB load if their account is compromised. Most operational dashboards expect to poll these.
Fix applied: no (staff-gated, low risk).
Recommended fix: if the admin dashboards start polling at high rates, add a per-staff-session cap.

## Cross-cutting notes (no separate finding)

- Server-side amount authority: the v2 orders POST resolves prices from `MenuItem.priceCents` server-side, never trusting `subtotalCents` / `priceCents` from the client. The splits POST similarly recomputes `subtotalCents` from `BillItem.priceCents * quantity`. Tip is clamped to 50% of subtotal+tax. Confirmed.
- Constant-time token compare: every new guest commerce route uses the `tokensEqual` helper backed by `node:crypto.timingSafeEqual`. The legacy `resolveGuestSession` does not (see Finding #7).
- Raw SQL: the only raw query in the new module is the `SELECT ... FOR UPDATE` on `Bill` inside the splits route; it uses Prisma's tagged-template `$queryRaw` which parameterizes the value, no injection vector.
- Server-only crypto: `lib/pos/crypto.ts` imports `"server-only"`, preventing accidental client-bundle inclusion.
