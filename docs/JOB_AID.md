# TabCall — Job Aid

One-page quick-reference cards. Print, laminate, stick on the bar.
Each card is sized to fit on a single side of US Letter / A4 in
landscape.

> **For full context, see `docs/USER_GUIDE.md`.**

---

## 🟢 Card 1 — Server / Bartender (the floor)

**Your tool**: the TabCall PWA on your phone, at
`https://www.tab-call.com/staff`. Add to home screen day one.

### When the screen buzzes

1. **Open the app** (icon on home screen, or unlock to PWA).
2. **Top of the queue** is the oldest open request.
3. Tap the row to see: table, request type, age.
4. Pick one action:

| Action | When to use |
|--------|-------------|
| **On it** | You're going there next. Other servers see your name on it. |
| **Hand off** | You can't get there — pass to someone else. |
| **Resolve** | You served / paid / chatted / declined the request. |

### The 3-minute rule

Any request older than **3 minutes** turns coral 🟧 and re-pings
every server assigned to that table. If you see a coral row, tap it
**right now** — that table is about to get annoyed.

### Request types (icon → meaning)

| Icon | Type | What the guest wants |
|------|------|----------------------|
| 🍸 | **Drink** | Order a drink |
| 🧾 | **Bill** | Close the tab — they're paying |
| 🥤 | **Refill** | Top up their existing drink (water, soda) |
| 🆘 | **Help** | Anything else (broken glass, lost item, allergy q) |

### "Check ID" badge

If a row has a coral **CHECK ID** badge, the venue requires you to
verify ID before tapping Resolve. **Don't skip it.** TABC compliance
in TX, store policy elsewhere.

### "Yours" pill

Green "yours" pill on a row = it's at one of the tables you cover.
Surface it first; everyone else is shared.

### When in doubt

Tap **Hand off** to your manager. Don't let a coral row sit.

### Sign in for the first time

1. Manager sends you an invite email.
2. Tap **Open the staff app** in the email.
3. On the staff page, **Add to Home Screen** → fullscreen icon.

### If push notifications don't ring

iOS sometimes blocks PWA push. The app polls every 5 seconds, so
the badge will still flash — but **keep the screen on** during the
shift.

---

## 🟡 Card 2 — Host (door + reservations)

Your tool: the same PWA + the **Reservations** tab in admin.

### When a guest walks in

1. Check the live queue for any door pings.
2. Tap **On it** before walking up — so the bartender knows you're
   handling the door.
3. If they have a reservation, mark **ARRIVED** in the Reservations
   page.
4. When you seat them, mark **SEATED** + assign the table number
   (this links any future requests from that table to the right
   reservation).

### Walk-ins / waitlist

1. Reservations → Waitlist → **Add walk-in** (name + party size +
   phone).
2. When a table opens, mark **SEATED**. Phone gets an SMS (if the
   venue has Twilio configured) saying "your table is ready".

### When the queue gets coral

You're the first line of defense. If you see a coral request and
no server is grabbing it, **walk it to the bar yourself** rather
than just handing off — speed > role.

---

## 🔵 Card 3 — Manager / Owner (back office)

Your tool: the manager dashboard at
`https://www.tab-call.com/admin/v/[slug]`.

### Daily 5-minute check

1. **Dashboard** — open requests count. Should be near 0 mid-shift.
2. **Reviews** — anything new in the last 24 hours? Reply or note.
3. **People → Pending invites** — anyone stuck? Click **Resend
   invite**.
4. **Audit log** — quick scroll for anything unexpected (a server
   added when you weren't around).

### Hire a new server

1. **People** → top card → **Invite a teammate**.
2. Enter name + email + role = **Server**.
3. Click **Send invite**. They get a magic link in seconds.
4. After they sign in once, the row flips from **INVITED** to
   **ACTIVE**.
5. Click their **⋯ menu** → **Edit tables** to assign which tables
   they cover.

### Fire / suspend a server

1. **People** → find the row.
2. **⋯ menu** → **Suspend** (reversible, keeps history) or
   **Remove** (permanent, Owner-only).

### Tonight's kill switches

Settings → **Tonight** card. Three toggles you can flip mid-shift:
- **Guest request queue** — turns off the four buttons on the QR
  page if the kitchen is slammed.
- **Pre-order at QR** — disables the menu/pre-order tab.
- **Reservations + waitlist** — returns 404 on the public booking
  page.

Existing data is preserved. Flip back on when you're ready.

### Bad-rating intercept

When a 1–3★ rating lands, it goes to the alert emails set in
**Settings → Alerts routing**. Each email has:
- Table + table label
- Server who was on the table (if assigned)
- AI's best guess at root cause
- Suggested action

**Reply directly to the email** — it's just notification, not a
chat thread. Or comp the table in person before they leave.

### Bill that won't close

If a guest can't pay:
1. Check **Settings → Payments — Stripe Connect** — is it green
   "Charges enabled"?
2. If not, complete the Stripe onboarding (3–5 min).
3. Until Stripe is connected, you can take cash and mark the
   session done from the dashboard.

### Print QR tents

QR tents → click **Open printer** → print to a regular printer.
Each table label is on the back so you don't mix them up.

### Change a server's role

People → click the role chip on the row → pick a new role from
the dropdown. Saves instantly.

> Note: **Managers can't promote anyone to Manager.** Only an Owner
> can mint another Owner or Manager. Prevents privilege cascade.

### Sign out everywhere

Settings → **Account security** → **Sign out everywhere**. Use it
if you lose your phone or someone forwarded your magic-link email
by accident.

---

## 🟣 Card 4 — TabCall founder / operator

Your tool: the operator console at
`https://www.tab-call.com/operator` (or bookmark
`https://www.tab-call.com/founder`).

### The 30-second morning check

1. `/operator` — KPI strip:
   - Orgs / Venues / Staff seats — should grow gradually
   - Guests · 24h — daily volume
   - Paid · 24h — settled tabs
2. `/operator/audit` — anything weird in the last 24 hours? Suspends
   you didn't expect, OWNER demoted by a Manager, etc.
3. `/operator/settings` → **INTEGRATIONS** — should be **N/N live**.
   Any UNSET = something's broken; investigate immediately.

### Add another founder

1. Vercel → tabsignal → Settings → Environment Variables.
2. Edit `OPERATOR_EMAILS` → comma-separated list.
3. Redeploy production (Deployments → top row → ⋯ → Redeploy).
4. They sign in via `/staff/login` → auto-routed to `/operator` on
   no-`next` sign-in.

### Flip a venue's plan (concierge upgrade)

After the 15-min setup call:
1. `/operator/orgs/[orgId]/billing`
2. Pick **Growth** or **Pro**.
3. **Note:** this only updates DB state. Pair with a Stripe
   Subscription in the Stripe dashboard if you want recurring
   billing.

### Broadcast a notice

`/operator/orgs/[orgId]/broadcast` — push a banner to every venue
in the org. Use sparingly (e.g. "5pm fee schedule change", "outage
postmortem").

### Impersonate a venue's staff (support)

`/operator/orgs/[orgId]/members` → find the user → **Impersonate**.
You'll get their session for the next 15 minutes. Used for
debugging customer reports — log out when you're done.

### When a venue says "I can't sign in"

1. Check Resend logs for their email. Was the magic link sent?
   Delivered?
2. If sent + delivered: ask them to check spam. If still not there,
   **People page → ⋯ Resend invite**.
3. If not sent: their email isn't a `StaffMember`. They need to
   sign up at `/signup` first OR be invited by an existing manager.
4. If they say it goes to `/staff` instead of admin: their venue's
   slug doesn't match the URL they were given. Check `Venue.slug`
   in the operator console.

### When a webhook fails

`/operator/settings` → INTEGRATIONS → Stripe live? If not, check
Stripe Dashboard → Webhooks. Re-deliver from there if needed.

### Wiping test data

For test venues / staff you want to nuke, email the developer team
or use the Supabase console → SQL editor with explicit per-id
DELETEs (do **not** TRUNCATE — that wipes everything).

---

## 🔴 Emergency reference

| Thing's on fire | First action |
|-----------------|--------------|
| Stripe is down | `/operator/settings` → confirm Stripe LIVE pill. Bills can't close → broadcast to venues. |
| Resend is down | Magic links won't arrive. Manually mint via Vercel logs (`devLink` in dev) or wait for recovery. |
| `OPERATOR_EMAILS` got wiped | Founder lockout. Re-add via Vercel env + redeploy. |
| Bad-rating email isn't going out | Settings → Alerts routing → check email is set + valid. |
| Whole site is 5xx | Vercel → tabsignal → Deployments → check latest production status. Roll back from the ⋯ menu if needed. |
| `prisma migrate` ran but old code still deployed | Old Prisma client doesn't know new columns → 500s. Deploy/promote the new code with the matching schema. |

---

## 📞 Who to call

- **Stripe issues** → Stripe support (in your Stripe dashboard)
- **Email delivery** → Resend support (resend.com/help)
- **Database** → Supabase support (supabase.com/dashboard)
- **Hosting** → Vercel support (vercel.com/help)
- **TabCall product / billing / outage** → `support@tab-call.com`
- **Press / partnership** → `hello@tab-call.com`

---

*Last updated: 2026-05-11. For the latest, see
`docs/USER_GUIDE.md` in the repo.*
