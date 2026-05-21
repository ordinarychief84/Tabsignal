/**
 * Test-runner preload. Captures the REAL `@/lib/rate-limit` module
 * exports onto globalThis once, before any test file is loaded.
 *
 * Why this exists
 * ---------------
 * Five test files (auth-start-flow, signup-flow, staff-invite-flow,
 * staff-password-flow, admin-change-password-flow) stub
 * `@/lib/rate-limit` via `mock.module(...)` in their beforeEach
 * blocks. The stub only defines `rateLimitAsync` — the production
 * module also exports `rateLimit` (the sync in-memory variant used
 * by `rate-limit.test.ts`).
 *
 * Bun's `mock.module(...)` is process-wide and persistent. Per the
 * docs, `mock.restore()` does NOT undo it; the only way to revert
 * is to call `mock.module(path, () => realExports)`. By capturing
 * the real exports at preload time (before any sibling has a chance
 * to call mock.module), we hand consumers a reliable reference they
 * can use to restore the module to its true behaviour.
 *
 * On macOS readdir is alphabetical so `rate-limit.test.ts` happens
 * to load before the polluters and never sees the problem. On
 * Linux CI readdir order is filesystem-dependent — the polluters
 * load first, leaving an incomplete mock active, and
 * `rate-limit.test.ts`'s static `import { rateLimit }` throws
 * "Export named 'rateLimit' not found".
 *
 * Consumers read the stashed reference via:
 *
 *   const real = (globalThis as Record<string, unknown>).__realRateLimit;
 *
 * Wired in via `app/bunfig.toml`:
 *
 *   [test]
 *   preload = ["./src/lib/__tests__/_setup/preserve-rate-limit.ts"]
 */

import * as realRateLimit from "@/lib/rate-limit";

// Copy the function references into a PLAIN OBJECT before any sibling
// has a chance to call mock.module(). The Bun docs are explicit that
// "mocked ESM modules maintain live bindings, so changing the mock
// will update all existing imports" — including the namespace object
// (`realRateLimit.rateLimitAsync` re-points when a polluter overrides
// the module). A plain object property holding a direct function
// reference is NOT a live binding; Bun's mock layer can't reach in
// and replace it. That's what we need to hand consumers a stable
// snapshot they can restore via `mock.module(path, () => snapshot)`.
const snapshot = {
  rateLimit: realRateLimit.rateLimit,
  rateLimitAsync: realRateLimit.rateLimitAsync,
};

(globalThis as Record<string, unknown>).__realRateLimit = snapshot;
