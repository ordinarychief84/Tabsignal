# TabCall Wear SDK

Put guest signals on your waiters' wrists. A guest holds the beacon at Table 7; the
watch buzzes; the waiter taps **Got it** without touching their phone; the guest's
timeline flips to *"Maya saw it — on the way."*

This package contains everything needed to build watch apps against TabCall:

| Piece | Where | Status |
| --- | --- | --- |
| TypeScript core client | [`typescript/`](typescript/) | Reference implementation, fully unit-tested (`bun test`) |
| Swift client (watchOS 9+) | [`swift/`](swift/) | SwiftPM package, mirrors the TS core 1:1 |
| Kotlin client (Wear OS) | [`kotlin/`](kotlin/) | Single-file drop-in, zero third-party deps |
| Server API | `app/src/app/api/wear/*` | Ships with the main app |

The TypeScript client is the **source of truth** — it runs on any JS-capable
wearable platform (Fitbit SDK, Samsung Tizen web widgets, React Native companions)
and is what the contract tests exercise. The Swift and Kotlin clients mirror it
method-for-method; keep all three in sync when the API grows.

---

## How pairing works (TV-login pattern)

Watches can't click magic links or type passwords, so:

```
 Waiter's phone (signed in)                    Waiter's watch
 ──────────────────────────                    ─────────────────
 /staff/watch → "Show pairing code"
   POST /api/wear/pair  ──►  6-digit code
   (shown full-screen, 10-min TTL)
                                               enter code
                                               POST /api/wear/claim
                                        ◄──    { token, device, staff, venue }
                                               persist token (Keychain /
                                               EncryptedSharedPreferences)
```

- Codes are **single-use**, hashed at rest, expire in 10 minutes, and minting a new
  one invalidates any unclaimed older code.
- The claim endpoint is unauthenticated by design; it is rate-limited per IP and
  the 6-digit space can't be brute-forced inside the TTL at those limits.
- The device token is a long-lived (180d) bearer JWT **bound to a `WearDevice`
  row**. Every call re-checks the row, so revoking from `/staff/watch` (lost
  watch), suspending the staff member, or "sign out everywhere" kills the token
  on its next request.

## Polling contract (battery-first)

Watches don't hold sockets. `GET /api/wear/queue` returns `pollAfterMs` — the
server's suggested delay before the next poll: **~5s while anything is open,
~20s when the floor is quiet.** Honor it (the TS client's `startPolling` does).
On Wear OS, also register the watch's FCM token via `POST /api/wear/fcm-token`;
new guest requests then push to the watch directly (same targeting as the phone
PWA: assigned staff first, everyone active otherwise), so a buzz wakes the app
between polls. On watchOS, lean on the paired iPhone for wake-ups.

## API reference

Base URL: your deployment (e.g. `https://tab-call.com`). All bodies JSON.
Authenticated calls send `Authorization: Bearer <deviceToken>`.

### `POST /api/wear/pair` *(staff cookie session — the phone side)*
→ `201 { code, expiresAt, ttlSeconds }` — rate limit 20/hour/staff.

### `POST /api/wear/claim` *(unauthenticated — the watch side)*
Body: `{ code: "123456", name: "Maya's Watch", platform: "wearos" | "watchos" | "tizen" | "fitbit" | "other" }`
→ `201 { apiVersion, token, device: {id,name,platform}, staff: {id,name}, venue: {name,slug} }`
Errors: `401 CODE_INVALID` (wrong / expired / used — indistinguishable on purpose),
`403 STAFF_INACTIVE`, `429 RATE_LIMITED`.

### `GET /api/wear/queue` *(bearer)*
→ `200 { serverTime, staff: {id,name}, pollAfterMs, requests: [ { id, type, status, table, note, idCheck, ageSeconds, assignedToMe, mine, ackedBy } ] }`
Open requests only (`PENDING | ACKNOWLEDGED | ESCALATED`), oldest first, max 50.
`idCheck: true` → show a badge: venue policy requires checking ID before serving.

### `POST /api/wear/requests/{id}/ack` *(bearer)*
First-acker-wins; racing a colleague returns `200 { alreadyAcked: true, ackedBy }`
rather than an error. `409 ALREADY_RESOLVED` if it was closed already.

### `POST /api/wear/requests/{id}/resolve` *(bearer)*
Body: `{ action: "SERVED" | "COMPED" | "REFUSED" | "ESCALATED" | "NOT_ACTIONABLE" | "OTHER", note? }`
The action is **required** — analytics split "served" from "comped because we
made them wait". Idempotent: `{ alreadyResolved: true }` on repeats.

### `POST /api/wear/fcm-token` *(bearer)*
Body: `{ token: "<fcm-token>" }` or `{ token: null }` to clear.

### `GET /api/wear/devices` + `DELETE /api/wear/devices/{id}` *(staff cookie session)*
Power the paired-devices list on `/staff/watch`. Watch apps don't call these.

### Auth failure codes (all HTTP 401 → wipe token, re-pair)
`UNAUTHORIZED` · `DEVICE_NOT_FOUND` · `DEVICE_REVOKED` · `TOKEN_ROTATED` ·
`SIGNED_OUT_EVERYWHERE`. HTTP 403 `STAFF_INACTIVE` = suspended/removed staff.

---

## Quickstart: TypeScript

```ts
import { TabCallWear } from "@tabcall/wear-sdk";

const sdk = new TabCallWear({
  baseUrl: "https://tab-call.com",
  token: await storage.get("tabcall_wear_token"),      // restore
  onToken: t => storage.set("tabcall_wear_token", t),  // persist
});

if (!sdk.isPaired) {
  await sdk.pair(codeTypedByUser, { name: "Maya's Versa", platform: "fitbit" });
}

const stop = sdk.startPolling(
  queue => render(queue.requests),          // honors pollAfterMs + backoff
  { onError: e => { if (e.needsRepair) showPairingScreen(); } },
);

// Buttons:
await sdk.acknowledge(req.id);              // "Got it"
await sdk.resolve(req.id, "SERVED");        // "Done"
```

## Quickstart: watchOS (Swift)

Add the package in Xcode (`sdk/tabcall-wear/swift`) → target *TabCallWear*.

```swift
import TabCallWear

let sdk = TabCallWear(
    baseURL: URL(string: "https://tab-call.com")!,
    token: Keychain.read("tabcall_wear_token"),
    onToken: { Keychain.write("tabcall_wear_token", $0) }
)

// Pairing screen (watch keypad) → sdk.pair(code: entered)
// Queue view:
let queue = try await sdk.queue()
// schedule next refresh after queue.pollAfterMs; buttons call
// sdk.acknowledge(item.id) / sdk.resolve(item.id, action: .served)
```

SwiftUI sketch of a queue row: table label + type icon, `ageSeconds` as a
ticking badge, swipe-trailing **Got it**, long-press → resolution picker
(`ResolutionAction.allCases`). Keep one extended runtime session alive during a
shift so polling continues with the wrist down.

## Quickstart: Wear OS (Kotlin)

Copy [`kotlin/TabCallWearClient.kt`](kotlin/TabCallWearClient.kt) into your app
(package `com.tabcall.wear`) — it has zero third-party dependencies.

```kotlin
val sdk = TabCallWearClient(
    baseUrl = "https://tab-call.com",
    token = prefs.getString("tabcall_wear_token", null),
    onToken = { prefs.edit().putString("tabcall_wear_token", it).apply() },
)

// All methods are blocking — call on Dispatchers.IO:
viewModelScope.launch(Dispatchers.IO) {
    if (!sdk.isPaired) sdk.pair(code, "Maya's Galaxy Watch")
    while (isActive) {
        val q = sdk.queue()
        withContext(Dispatchers.Main) { render(q.requests) }
        delay(q.pollAfterMs)
    }
}

// In your FirebaseMessagingService:
override fun onNewToken(token: String) {
    scope.launch(Dispatchers.IO) { sdk.registerPushToken(token) }
}
// onMessageReceived → post an OngoingActivity/notification and refresh the queue.
```

Catch `WearException` everywhere; `needsRepair == true` → wipe the stored token
and show the pairing screen.

---

## UX guidance for watch apps

- **Sort:** `assignedToMe` first, then oldest `ageSeconds`. A waiter's own
  tables are their world; everything else is backup.
- **One-tap ack, two-tap resolve.** Ack is the time-critical action (it flips
  the guest's timeline to "seen"); resolution detail can wait until after the
  table is served.
- **Escalation shading:** the server flips `status` to `ESCALATED` at ~3 min
  unacked. Tint those rows and vibrate again.
- **`idCheck: true`** → show the badge *before* the ack button; it exists for
  liquor-law compliance.
- **Race losses are normal.** `alreadyAcked: true` with a colleague's name is a
  success state ("Dee got it"), not an error.

## Versioning

`apiVersion: 1` is returned at claim time. Additive changes (new fields) won't
bump it; breaking changes ship as `/api/wear/v2/*` with a deprecation window.
Clients send `x-tabcall-wear-sdk: <lang>/<semver>` so the server can measure
adoption before retiring anything.
