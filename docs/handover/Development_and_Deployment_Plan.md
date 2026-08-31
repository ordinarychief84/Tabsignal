# TabCall — Development & Deployment Plan

**A briefing for the founder.** This document explains, in plain language, where the
product stands today, what I'm proposing to change about how it's built and hosted,
who needs to do what to get started, and the order I'll do the engineering work in.

It's written from two sources: the *Implementation Requirements Specification*
handover document, and a direct, line-by-line audit of the current codebase (the
actual `tabsignal` repository) — so every claim below about "what already exists" has
been checked against real code, not assumed.

---

## TL;DR

- The product works and a surprising amount is already solid — the core "guest asks,
  staff responds" loop, staff accounts, audit logging, and request timing are all
  built and mostly match the spec.
- It was built fast, by one person, with AI assistance ("vibe-coded," in the handover
  doc's own words). That speed shows up as a few places where more got built than the
  spec asked for, and a couple of places that need a security and correctness pass
  before I'd trust it in front of paying customers.
- I'm proposing to split the single project into three repositories — a website
  frontend, a backend API, and an Android app for a wearable staff device — instead of
  continuing as one tangled Next.js project. This is the right move for where the
  product is headed, but it is real, non-trivial engineering work, not a config
  change. Section B explains why.
- To build and test all of this properly, I need a small set of hosted services set
  up (a server host, a database, a cache, a message queue). Section C is a literal
  checklist of who clicks what.
- Section D answers nine open technical questions the handover document explicitly
  flagged for review, using evidence from the real code rather than guesswork.
- Sections E and F are the actual development plan and deployment plan.

---

## A. Where the product stands today

Think of the current app as one project that does two jobs at once: it's the website
guests and staff use, *and* it's the engine that stores data and makes decisions
behind the scenes. That's a normal way to build a first version fast, but it's not how
I want to keep building as the product grows.

**What's already solid** (confirmed by reading the actual code, not just the plan for it):

- The core loop — guest sends a request, it lands on a server's phone, three taps
  close it out — is built and matches the spec closely, down to the exact timestamps
  the requirements document calls for (when a request was made, routed,
  acknowledged, started, and finished).
- A request that nobody acknowledges in time automatically escalates and flags a
  manager — already working, with a configurable time limit per venue.
- One owner account can already run more than one venue — this was an open question
  in the handover doc, and the answer is: yes, it's already built that way.
- Staff invitations, role changes, suspensions, and other sensitive actions are
  already written to a permanent audit log.
- The old "guests pay through the app" feature has already been fully removed. That
  was flagged as a risk to check for — good news, it's done, and cleanly.

**Where it's ahead of the spec — which isn't automatically a good thing:**

- There's a fairly elaborate kitchen-style order-tracking system already built, when
  the requirements document asks only for a lightweight "here's what I'm interested
  in" signal to the server, not a full order pipeline. This is the clearest sign of
  "vibe-coded" scope creep — real, working code that nobody asked for yet, which now
  has to be maintained. I'll need a decision from you on whether to keep, simplify, or
  strip this out (see Section D and Section G).
- There's also a fully-built companion app for smartwatches, with real code for three
  different watch platforms. Unlike the order-tracking system, this turns out to be a
  head start rather than waste — see Section B, where it lines up directly with the
  plan for a wearable notification device for waiters.
- There's a "shared device for the floor" screen but it's not clear it works the way
  the spec wants for venues that ban staff phones — this needs a product decision,
  not just a bug fix (Section D).

None of this means the product is in bad shape. It means the fast, AI-assisted build
process did what it's good at (a lot of surface area, quickly) and not what it's bad
at (staying inside the lines of what was actually asked for). The plan below accounts
for both.

---

## B. The proposed re-architecture

Right now: **one repository** holds both the website and the backend logic together.
I'm proposing to move to **three repositories**, each with one job:

| Repository | What it is | Why it's separate |
|---|---|---|
| **Backend** | The engine — stores data, enforces the rules, talks to the database | So the website *and* the wearable device app can both talk to the same backend, instead of duplicating that logic |
| **Frontend (web)** | The website — guest QR pages, staff screens, owner dashboard | Built as a "microfrontend monorepo" — explained below |
| **Wearable (Android device)** | A small, purpose-built app for a device a waiter wears — a watch, or a badge on a lanyard, not a phone | Installed by copying the app file straight onto the device (an "APK" — see Glossary), not through the Play Store. Its only job: buzz and show which table needs the waiter |

**What "microfrontend monorepo" means, in plain terms:** the website isn't one giant
program — it's four genuinely different experiences already: what a guest sees, what
a server sees, what an owner sees, and what TabCall's own internal team sees. A
microfrontend setup keeps all four inside one repository (one place to work), but lets
each one be built and deployed on its own. If I ship a fix to the guest screen, I don't
have to
redeploy — or risk breaking — the owner's dashboard. This maps naturally onto how the
product already splits, so it's a sound choice, not an over-engineered one.

**What the wearable app actually is:** not a phone app for guests or a general staff
app — a small program for a dedicated Android-powered device a waiter wears on shift,
whose only job is to buzz and show which table needs them. Because these are
company-owned devices handed to staff rather than personal phones, the app gets copied
directly onto each device instead of downloaded from the Play Store. That's simpler in
one way (no app-store review to wait on) and means more planning in another — I need a
process for how the app actually gets onto each physical device, and how a lost or
reassigned device gets shut off remotely.

**A build worth reconsidering before starting from scratch:** the repository already
contains real, working native code for exactly this device — built directly for the
watch/wearable platform rather than through Expo. Before writing a new one, I want to
evaluate hardening and reusing that existing code instead of starting over. Two
reasons: it may save real time, and a small single-purpose wearable is usually better
served by a lean native app than by Expo/React Native — lighter on the device's
battery, more reliable for background notifications, and easier to lock into "does one
thing only" mode. Expo's biggest advantages (one codebase for iOS and Android, easy
Play Store publishing) don't apply here anyway, since this app isn't going through an
app store at all.

**The honest scope note:** splitting things this way means pulling business logic
*out* of roughly 140 backend routes currently living inside the website's code, and
turning it into a proper standalone backend service. That is the single biggest piece
of work in this plan — bigger than "add a wearable app" sounds on its own, because the
wearable app can't talk to anything until the backend exists as its own thing. Section
E sequences this properly.

**GitHub — where the code lives:**

Two options, and I recommend the second:

1. **Keep using the existing personal GitHub account** (`ordinarychief84`) and add the
   three new repositories there.
2. **Create a GitHub Organization** (a company account, not a personal one) and invite
   me as a member. — **Recommended.** An Organization means the code and its history
   belong to the company, not to one person's personal account. It's the standard
   setup once more than one person is touching the code, and it makes it easy to add
   or remove developers later without ever moving the repositories.

**What I need from you here:** create the GitHub Organization (free to do), and send
me an invite as a member with admin rights on the three new repositories.

---

## C. Setting up the test environment

This is the infrastructure checklist — the accounts and services needed before any of
the new code can run anywhere other than a laptop. Split by who does what:

### Founder — accounts and access

- [ ] Create the GitHub Organization (or confirm I'm using the existing personal
      account) and invite me as an admin.
- [ ] Create a [Render](https://render.com) account (this is the hosting provider —
      it's what will actually run the website and backend once they're built) and
      invite me as an **admin** team member.
- [ ] Confirm access to the existing [Supabase](https://supabase.com) project (this is
      where the database already lives), or say the word and I'll create a new one.
- [ ] Confirm who controls the domain name (e.g. `tabcall.com`) and its DNS settings —
      this is the account at whatever registrar the domain was bought through (GoDaddy,
      Namecheap, Cloudflare, etc.). I'll need access here to point
      subdomains at the new services.

### Developer — technical setup (once the above access is granted)

- [ ] Set up the three GitHub repositories.
- [ ] Set up two Render services on a basic/starter paid tier — one for the website,
      one for the backend. ("Basic tier" is intentional: this is a test environment,
      not the final production setup, so there's no reason to pay for more capacity
      than's needed yet.)
- [ ] Set up **Redis** on Render. In plain terms: Redis is a very fast, temporary
      storage layer. It's used to remember things that need to be checked constantly
      but don't need to live in the permanent database — like "has this person tried
      to log in five times in the last minute" (to stop abuse) or "what's currently in
      the live staff queue" (so the screen updates instantly).
- [ ] Set up **RabbitMQ** via CloudAMQP. In plain terms: a message queue is a to-do
      list for the backend. When something happens that doesn't need to be instant —
      sending an email, asking the AI to read a bad review, compiling a nightly report
      — it gets dropped on this list and handled in the background, instead of making
      a guest or a staff member wait for it.
- [ ] Set up or confirm access to Supabase for the database itself.
- [ ] Point a subdomain at each service, for example:
      - `app.tabcall.com` → the website
      - `api.tabcall.com` → the backend
      - `realtime.tabcall.com` → the live-updates service (what makes the staff queue
        update instantly instead of needing a refresh)

**Why this setup, specifically:** every piece above earns its place because it maps to
something the product already needs today (a live queue, rate-limiting on public
forms, background email sending) or clearly will need soon (a real wearable app
talking to a real API). None of this is "just in case" infrastructure — Section D and Section
F go through the reasoning service by service.

This whole section is scoped as the **test/staging environment** — a safe space to
build and demo the re-architected product before anything touches real customers. Once
it's proven out, the same setup gets mirrored for production (Section F covers that
promotion path).

---

## D. Decisions to lock in now

The requirements document explicitly listed nine open questions for whoever picks this
project up. Here are the answers — most were already settled by how the existing code
actually works; a few are genuine calls that need your input.

**1. What's the current tech stack (framework, database, hosting, real-time)?**
Already answered by the audit: a Next.js website, a Postgres database (via Supabase)
managed through an ORM called Prisma, hand-built login (not a third-party login
service), hosted on Vercel, with a small separate service for live updates. No
decision needed — this is simply the starting point Section B's re-architecture works
from.

**2. Can one owner account run more than one venue?**
**Yes — already built.** The database already models one company owning several
venues, with the ability to grant a team member access across all of them. Nothing new
needs building for this; it may just need a friendlier screen for owners to use it.

**3. Can more than one staff member be assigned to a table?**
**Yes — already built.** A table can have several staff covering it at once (e.g. a
bartender and a floor runner), and a request goes to all of them, not just one
"primary" person. No single-owner-plus-backup model exists or is needed.

**4. What should the "needs attention" and escalation timing be?**
**Already built and configurable.** A request that isn't acknowledged within a set
time (three minutes, by default) automatically escalates to a manager. Each venue can
set their own limit, anywhere from 15 seconds to 30 minutes. No decision needed unless
you want to change the default.

**5. Should the shared floor-station screen be its own account, or a shared login?**
**Genuine open decision — needs your input.** Right now, the "shared screen for venues
that ban staff phones" mode exists, but it works through an individual staff login,
not a device that the whole floor shares. The requirements document treats the
shared-device mode as a *required* option for some venues, not a nice-to-have.
**Recommendation:** build a simple shared "station" login (like a 4-digit code the
whole floor uses on one tablet) rather than asking every server to log in and out of
a shared device with their personal password. Small piece of work, meaningfully better
for the no-phone venues TabCall is trying to support.

**6. What's used for staff invite emails and guest text messages?**
Staff invite emails, password resets, and manager alerts already go out through a
provider called Resend. Text messaging (for things like guest confirmations) is
wired up to a provider called Twilio, but it's currently a placeholder — it quietly
does nothing if it isn't fully configured, rather than sending real texts. No decision
needed; it's ready to switch on when you want it.

**7. What payment/POS code exists, and what can be safely removed?**
The old guest-payment feature (guests paying their bill through the app) has already
been **fully removed** — that's a real risk the audit was designed to catch, and it's
already handled. What remains is billing the *venue* for its own subscription to
TabCall, which is unrelated and should stay. Separately, the audit found a full
kitchen-style order-tracking system (order statuses like "preparing," "ready," etc.)
that goes well beyond what the requirements call for — that spec asks only for a
lightweight "here's what I'm interested in" signal to the server, not an order
pipeline. **Recommendation:** simplify this down to match the spec, or explicitly
decide to keep the fuller version if there's a reason you want it. This is a cost/scope
decision, not a technical blocker.

**8. How does the product recognize a returning guest?**
Already built, and built correctly for privacy: a guest is only ever recognized if
they explicitly choose to leave a phone number and verify it with a text code. There's
a clear separation between "this guest gave *this* venue their number" and "this guest
opted into a cross-venue profile" — two different levels of consent, kept separate on
purpose. No decision needed.

**9. What error tracking, audit logging, and timing data exists in production?**
Error tracking software (Sentry) is already wired in. Every sensitive action already
writes to a permanent audit trail. Every request already records the full timeline the
spec asks for (created, routed, acknowledged, started, finished, escalated). This is
one of the stronger-built parts of the existing product — no decision needed.

**Confirmed, not open — the wearable device app:** an earlier pass on this document
flagged the existing smartwatch code as unrequested scope creep needing a keep-or-cut
decision. Since a worn device for waiters is a real, wanted feature, that's settled —
the question now is *how* to build it, not *whether* to. See Section B for the
recommendation: evaluate hardening the existing native code before writing a new one
in Expo.

---

## E. Development plan

This follows the stabilization order the requirements document itself recommends,
adjusted to fold in the repository split from Section B at the right point — doing the
split before the security pass would mean fixing the same bugs twice, in two places.

**Phase 0 — Baseline and audit**
Confirm the current code runs, document what actually exists today (routes, database
tables, login flow, environment settings), and get a clean local copy running.
Nothing gets changed yet — this is measuring twice before cutting.

**Phase 1 — Security and tenant isolation**
Before anything else: confirm one venue's staff genuinely cannot see another venue's
data by tampering with links or IDs, confirm login and permissions are enforced by the
backend (not just hidden buttons on screen), and confirm a removed staff member truly
loses access immediately. This is the highest-priority phase in the requirements
document, and it should stay first here too — it protects every venue's data before
anything new gets added.

**Phase 2 — Repository split (Section B)**
Pull the backend logic out of the website project into its own standalone backend
repository. The website is updated to call that backend over the network instead of
running the logic itself. This is the foundation everything else — including the
wearable app — depends on.

**Phase 3 — Core data cleanup**
Straighten out the venue, staff, table, and request data so there's exactly one
correct version of each — no duplicate or half-finished records left over from rapid
iteration.

**Phase 4 — Owner and staff flows**
Make signup, login, staff invites, table assignment, QR code printing, and the menu
editor fully reliable, now running against the new backend.

**Phase 5 — Guest experience**
Stabilize the guest journey: scan the QR code, see a warm welcome, browse the menu,
save items of interest, send a request, leave feedback at the end.

**Phase 6 — Live operations**
Harden the staff live queue, the shared floor-station mode (including the station
login from Section D, question 5), request routing, and escalation timing.

**Phase 7 — Wearable device app**
Decide whether to harden the existing native wearable code already in the repository
or build fresh, then finish it against the now-stable backend from Phase 2: pairing a
device to a staff member, receiving a request as a notification, and acknowledging it
from the device. Also plan the physical side — how the app gets copied onto each
device, and how a lost or reassigned one gets shut off remotely. Doing this after the
backend split, not before, means it's built once against a real API, instead of
against code that's still moving.

**Phase 8 — Guest relationships**
Phone capture, consent, the guestbook, and lightweight campaign messaging — all
privacy-sensitive, so this comes after the security work in Phase 1 is proven solid.

**Phase 9 — Analytics and monitoring**
Confirm the response-time and feedback metrics the business actually wants to see are
being captured correctly, and that error alerts reach the right person.

**Phase 10 — QA and pilot**
Automated tests, a deliberate attempt to break the cross-venue security boundary,
device testing on real phones and tablets, and a small pilot at one real venue before
a wider release.

Each phase should end with a short, plain-language note confirming what's now working,
so you always know the true state of the product without needing to read code.

---

## F. Deployment plan

**Environments.** Two environments, kept genuinely separate so testing never touches
real venue data:

- **Test/staging** — the environment being set up in Section C. Used for building,
  demoing, and trying things safely.
- **Production** — the same setup, mirrored, once a phase has been proven out in
  staging. Nothing reaches production data by accident; the two use entirely separate
  databases and separate copies of every service.

**Where each piece runs:**

| Service | Runs on | Job |
|---|---|---|
| Website (frontend) | Render | Serves the guest, staff, and owner screens |
| Backend (API) | Render | Enforces the rules, talks to the database |
| Live updates | Render (or its own small service) | Pushes instant updates to the staff queue |
| Database | Supabase | Stores everything permanently |
| Cache | Redis (Render) | Fast, temporary lookups — rate-limiting, live queue state |
| Background jobs | RabbitMQ (CloudAMQP) | Emails, AI review classification, reports |

**Rollout mechanics:**

- Every repository gets an automated check that runs on every code change: does it
  build, do the tests pass. Nothing reaches staging without passing this.
- Moving code from staging to production is a deliberate, visible action — never
  automatic — so a human always signs off before real venues are affected.
- Secrets (passwords, API keys) live only inside Render and Supabase's own settings,
  never inside the code itself, and are never the same values between staging and
  production.
- Database changes are version-controlled and applied through a migration tool, so
  every environment's database structure can be reproduced from scratch if needed.

**Domains:** the production versions of the subdomains from Section C
(`app.tabcall.com`, `api.tabcall.com`, etc.) point at production; a staging prefix
(e.g. `staging.tabcall.com`) points at the test environment, so it's always obvious
which one you're looking at.

**Rollback plan:** if something breaks in production, the previous working version can
be restored on Render within minutes, and database changes are written so they can be
undone — this gets confirmed as part of Phase 10, before the pilot.

---

## G. Risks worth knowing about

- **The product was built very fast, by one person, with AI assistance.** That's not
  a criticism of what exists — a great deal of it is genuinely solid — but it means an
  independent security and correctness pass (Phase 1) is not optional before real
  customer data touches it.
- **The full kitchen-style order-tracking system goes beyond what was actually asked
  for.** Every day it stays in the codebase is a day someone has to keep it working
  even though no venue asked for it yet. Worth a decision sooner rather than later
  (Section D).
- **The repository split (Phase 2) is real engineering work, not a rename.** It's the
  single riskiest phase in this plan because everything downstream — including the
  wearable app — depends on it going cleanly. It's sequenced right after the security
  pass on purpose, so it isn't rushed and doesn't need to be redone.
- **Documentation inside the existing codebase is already inconsistent** — some
  internal docs describe an older version of the plan than the code that's actually
  running. Part of Phase 0 is making sure I'm working from what's actually true
  today — and that anyone who joins the project later can too.

---

## Glossary

- **APK** — the installer file for an Android app. Normally a phone downloads one
  through the Play Store without a person ever seeing it; here, it gets copied
  straight onto the wearable device instead, since it's company-owned hardware, not
  a personal phone downloading from a public store.
- **Repository ("repo")** — a project's folder of code, tracked on GitHub.
- **Backend / API** — the part of the software that stores data and enforces rules,
  as opposed to the part a person actually looks at on screen.
- **Frontend** — the part of the software a person sees and clicks on.
- **Monorepo** — one repository that holds several related projects together.
- **Redis** — a very fast, temporary storage layer, used for things that need
  checking constantly but don't need to be permanent.
- **Message queue (RabbitMQ)** — a background to-do list for tasks that don't need to
  happen instantly, like sending an email.
- **Staging / test environment** — a private copy of the product used for building and
  testing, kept completely separate from real customer data.
- **Subdomain** — a prefix on the company's domain name (like `api.` in
  `api.tabcall.com`) used to point to a specific service.
- **Tenant isolation** — the guarantee that one venue can never see another venue's
  data.

---

*Sources: `TabCall_Implementation_Requirements_Specification_Developer_Handover.docx`,
and a direct audit of the `tabsignal` repository's schema, API routes, and
configuration as of 2026-08-28.*
