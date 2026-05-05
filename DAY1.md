# TabCall — Day 1 Build Sheet

After `bash bootstrap.sh` completes (Node + repos installed), run the commands below in order. They scaffold the codebase to match the v2.0 PRD.

---

## 0. Sanity check (after bootstrap)

```bash
node --version    # expect v20+ (LTS)
npm  --version    # expect 10+
ls ~/.claude/skills/_external/
# expect: superpowers/  superpowers-lab/  Skill_Seekers/  awesome-claude-skills/
```

If any of those are missing, re-run `bash bootstrap.sh` and inspect `/tmp/tabcall_bootstrap.log`.

---

## 1. Scaffold the Next.js app (1 min)

```bash
cd ~/Desktop/Tabsignal
# Use a sub-folder so the repo root keeps PRDs, skills/, bootstrap.sh
npx create-next-app@latest app \
  --ts --tailwind --app --src-dir --import-alias "@/*" --no-eslint --use-npm
cd app
npm install zustand zod @stripe/stripe-js stripe socket.io socket.io-client \
  @anthropic-ai/sdk firebase-admin resend @react-email/components \
  next-auth @auth/prisma-adapter @prisma/client \
  @upstash/redis qrcode
npm install -D prisma @types/qrcode
```

## 2. Init Prisma + the data model (5 min)

```bash
npx prisma init --datasource-provider postgresql
```

Then replace `prisma/schema.prisma` with the schema from PRD v2.0 §9 (Organization, Venue, Table, StaffMember, GuestSession, Request, FeedbackReport — 7 entities, no menu/loyalty/happyhour in v1 per YAGNI cut).

```bash
# After editing schema.prisma:
npx prisma migrate dev --name init
npx prisma generate
```

## 3. Backend (Fastify on Railway) — separate package

```bash
cd ~/Desktop/Tabsignal
mkdir api && cd api
npm init -y
npm install fastify @fastify/cors @fastify/helmet zod stripe socket.io \
  @anthropic-ai/sdk firebase-admin resend @prisma/client \
  @upstash/redis
npm install -D typescript @types/node tsx
npx tsc --init
```

## 4. Wire up Stripe Connect (10 min)

- Create a Stripe account in test mode.
- Enable Connect → choose **Express** (faster owner onboarding).
- Generate `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Configure webhook endpoint pointing at `https://<railway-url>/api/webhooks/stripe`, listening for `payment_intent.succeeded` and `account.updated`.

## 5. Anthropic + AI bad-review intercept (PRD §6/F4)

- Get `ANTHROPIC_API_KEY` from https://console.anthropic.com.
- Use `claude-haiku-4-5-20251001` with prompt caching enabled. The classifier prompt + few-shot examples go in the cache; per-request input is just the user's note.

## 6. Vercel + Railway deploys

```bash
# Frontend
cd ~/Desktop/Tabsignal/app
npx vercel link
npx vercel env pull .env.local

# Backend
cd ~/Desktop/Tabsignal/api
# Use Railway dashboard to deploy, or `railway up` after `npm i -g @railway/cli`.
```

## 7. The 5 features (per PRD v2.0 §6, in build order)

| Day | Build |
|---|---|
| 1 | Repo, Vercel, Railway, Supabase, Upstash, Stripe Connect test mode |
| 2 | Setup wizard (F5) on phone form-factor — `/admin/setup` |
| 3 | Guest QR page + request submission (F1) — `/v/[slug]/t/[tableId]` |
| 4 | Staff PWA + Socket.io live queue (F2) — `/staff` |
| 5 | FCM push for backgrounded staff PWA |
| 6 | Bill screen, line items, tax, tip selector (F3 part 1) |
| 7 | Stripe Payment Element + Apple/Google Pay (F3 part 2) |
| 8 | Stripe webhook idempotency + payment confirm push to staff |
| 9 | 5-star feedback screen + Google review deep-link (F4 part 1) |
| 10 | Anthropic Haiku integration, classifier, prompt caching (F4 part 2) |
| 11 | Owner email template + Resend send on bad rating (F4 part 3) |
| 12 | Real-device test (3 iPhones, 3 Androids, 2 carriers) |
| 13 | Founder install at first venue (real Friday night) |
| 14 | First $149 invoice → Day 1 of MRR |

---

## After bootstrap completes

Tell Claude `go` and it will:

1. Verify all 4 reference repos cloned successfully
2. Verify each of the 7 `npx skills add` commands actually worked (or report which didn't)
3. Search `_external/awesome-claude-skills` for matches to the 10 named skills (Rube MCP, Document Suite, etc.)
4. Begin step 1 of the build sheet above
