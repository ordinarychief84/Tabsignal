// Naive in-memory rate limiter for dev / single-instance.
// Production: swap to Upstash Redis (UPSTASH_REDIS_REST_URL).

type Hit = { count: number; firstAt: number };
const buckets = new Map<string, Hit>();

export function rateLimit(key: string, opts: { windowMs: number; max: number }): { ok: boolean; retryAfterMs: number } {
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
