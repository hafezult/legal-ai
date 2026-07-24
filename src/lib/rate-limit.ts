type Bucket = {
  timestamps: number[]
}

const buckets = new Map<string, Bucket>()

/**
 * Simple in-process sliding-window rate limiter for expensive server actions.
 * Best-effort only — resets on process restart and is not shared across instances.
 */
export function consumeRateLimit(
  key: string,
  options: { limit: number; windowMs: number }
): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now()
  const bucket = buckets.get(key) ?? { timestamps: [] }
  bucket.timestamps = bucket.timestamps.filter((stamp) => now - stamp < options.windowMs)

  if (bucket.timestamps.length >= options.limit) {
    const oldest = bucket.timestamps[0] ?? now
    const retryAfterMs = Math.max(1000, options.windowMs - (now - oldest))
    buckets.set(key, bucket)
    return { ok: false, retryAfterMs }
  }

  bucket.timestamps.push(now)
  buckets.set(key, bucket)
  return { ok: true }
}
