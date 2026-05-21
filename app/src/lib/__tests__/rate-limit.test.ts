/**
 * Rate limiter contract tests. The in-memory path is deterministic and
 * doesn't need Redis. The prod-fail-closed branch is exercised by
 * temporarily flipping NODE_ENV.
 */

import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

// Sibling test files (signup-flow, auth-start-flow, etc.) stub
// `@/lib/rate-limit` via `mock.module(...)` in their beforeEach,
// providing a factory that only defines `rateLimitAsync` — the real
// module also exports `rateLimit`. Bun's mock.module is process-wide
// and `mock.restore()` doesn't undo it (per docs), so on Linux CI's
// readdir order — where the polluters load before us — a static
// `import { rateLimit }` throws SyntaxError at file-load time.
//
// Fix: the test-runner preload (bunfig.toml → preserve-rate-limit.ts)
// captures the REAL module exports onto globalThis BEFORE any test
// file loads. Here we use that snapshot to restore the module to its
// genuine implementation, then dynamic-import the bindings.
type RealRateLimit = typeof import("../rate-limit");
const realRateLimit = (globalThis as Record<string, unknown>).__realRateLimit as RealRateLimit;
mock.module("@/lib/rate-limit", () => realRateLimit);

let rateLimit!: RealRateLimit["rateLimit"];
let rateLimitAsync!: RealRateLimit["rateLimitAsync"];
beforeAll(async () => {
  ({ rateLimit, rateLimitAsync } = await import("../rate-limit"));
});

afterEach(() => {
  (process.env as Record<string, string>).NODE_ENV = "test";
});

describe("in-memory rateLimit", () => {
  test("first hit ok, second hit over max → blocked", () => {
    const key = `t-${Math.random()}`;
    expect(rateLimit(key, { windowMs: 60_000, max: 1 }).ok).toBe(true);
    expect(rateLimit(key, { windowMs: 60_000, max: 1 }).ok).toBe(false);
  });

  test("separate keys don't share buckets", () => {
    const a = `t-a-${Math.random()}`;
    const b = `t-b-${Math.random()}`;
    expect(rateLimit(a, { windowMs: 60_000, max: 1 }).ok).toBe(true);
    expect(rateLimit(b, { windowMs: 60_000, max: 1 }).ok).toBe(true);
  });

  test("window expiry resets count", async () => {
    const key = `t-exp-${Math.random()}`;
    expect(rateLimit(key, { windowMs: 30, max: 1 }).ok).toBe(true);
    await new Promise(r => setTimeout(r, 50));
    expect(rateLimit(key, { windowMs: 30, max: 1 }).ok).toBe(true);
  });
});

describe("rateLimitAsync prod posture (no Upstash configured)", () => {
  test("dev: falls back to in-memory (open path)", async () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    const r = await rateLimitAsync(`dev-${Math.random()}`, { windowMs: 60_000, max: 1 });
    expect(r.ok).toBe(true);
  });

  test("production without Upstash: fails closed", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    const r = await rateLimitAsync(`prod-${Math.random()}`, { windowMs: 60_000, max: 5 });
    // We assert the SHAPE of the failure — exact retryAfterMs is windowMs
    // when failing closed without any prior count.
    expect(r.ok).toBe(false);
  });
});

/**
 * Cross-IP DoS isolation: the /api/requests fix scopes the limiter
 * bucket by sessionId only *after* the session token check has
 * passed. We can't unit-test the route here, but we can prove the
 * limiter itself isolates by key — which is the property the fix relies
 * on.
 */
describe("cross-key isolation (fixes /api/requests DoS)", () => {
  test("sessionId-only key: separate sessions never collide", () => {
    const s1 = `req:${Math.random()}`;
    const s2 = `req:${Math.random()}`;
    expect(rateLimit(s1, { windowMs: 30_000, max: 1 }).ok).toBe(true);
    expect(rateLimit(s2, { windowMs: 30_000, max: 1 }).ok).toBe(true);
    expect(rateLimit(s1, { windowMs: 30_000, max: 1 }).ok).toBe(false);
    expect(rateLimit(s2, { windowMs: 30_000, max: 1 }).ok).toBe(false);
  });
});
