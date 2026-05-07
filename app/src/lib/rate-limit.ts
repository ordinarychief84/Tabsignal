/**
 * Rate limiter. Tries Upstash Redis (works across Vercel serverless
 * cold starts and multiple regions); falls back to a single-process
 * in-memory map for local dev.
 *
 * Public surface kept synchronous-looking for compatibility with the
 * existing call sites — but Upstash is over HTTP, so we expose
 * `rateLimitAsync` that callers can `await`. The legacy `rateLimit`
 * stays pinned to the in-memory path; new code should use the async
 * one. On Vercel without Upstash creds the in-memory limiter doesn't
 * actually work (every cold start gets a fresh Map), so callers will
 * effectively skip rate limiting until Upstash env is set — which is
 * the desired graceful degradation.
 */

type Hit = { count: number; firstAt: number };
const buckets = new Map<string, Hit>();

type LimitResult = { ok: boolean; retryAfterMs: number };
type LimitOpts = { windowMs: number; max: number };

export function rateLimit(key: string, opts: LimitOpts): LimitResult {
  const now = Date.now();
  const hit = buckets.get(key);
  if (!hit || now - hit.firstAt > opts.windowMs) {
    buckets.set(key, { count: 1, firstAt: now });
    return { ok: true, retryAfterMs: 0 };
  }
  if (hit.count >= opts.max) {
    return { ok: false, retryAfterMs: opts.windowMs - (now - hit.firstAt) };
  }
  hit.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

let upstashClient: { incr: (k: string) => Promise<number>; pexpire: (k: string, ms: number) => Promise<number>; pttl: (k: string) => Promise<number> } | null = null;
let upstashReady: boolean | null = null;

async function getUpstash() {
  if (upstashReady === false) return null;
  if (upstashClient) return upstashClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    upstashReady = false;
    return null;
  }
  try {
    const { Redis } = await import("@upstash/redis");
    upstashClient = new Redis({ url, token }) as unknown as typeof upstashClient;
    upstashReady = true;
    return upstashClient;
  } catch (e) {
    console.warn("[rate-limit] Upstash unavailable, falling back to in-memory:", e);
    upstashReady = false;
    return null;
  }
}

/**
 * Atomic INCR + PEXPIRE on first hit. Returns ok=false once count
 * exceeds max within the rolling window. The window resets when the
 * key TTLs out, not on each hit — same semantics as the in-memory
 * version.
 */
export async function rateLimitAsync(key: string, opts: LimitOpts): Promise<LimitResult> {
  const r = await getUpstash();
  if (!r) {
    // Fall back to in-memory — useless on serverless cold starts but
    // correct in dev and on a long-lived Fastify process.
    return rateLimit(key, opts);
  }
  try {
    const fullKey = `rl:${key}`;
    const count = await r.incr(fullKey);
    if (count === 1) {
      await r.pexpire(fullKey, opts.windowMs);
    }
    if (count > opts.max) {
      const ttl = await r.pttl(fullKey);
      return { ok: false, retryAfterMs: Math.max(0, ttl) };
    }
    return { ok: true, retryAfterMs: 0 };
  } catch (e) {
    // Network blip — fail open rather than locking out real users.
    console.warn("[rate-limit] Upstash error, failing open:", e);
    return { ok: true, retryAfterMs: 0 };
  }
}
