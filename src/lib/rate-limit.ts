type Bucket = {
  timestamps: number[]
}

const buckets = new Map<string, Bucket>()

type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number }

function consumeInMemory(
  key: string,
  options: { limit: number; windowMs: number }
): RateLimitResult {
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

function upstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  )
}

/**
 * Optional Upstash Redis REST sliding-window limiter for multi-instance deploys.
 * Falls back to the in-process bucket when unset or on transport errors.
 */
async function consumeUpstash(
  key: string,
  options: { limit: number; windowMs: number }
): Promise<RateLimitResult | null> {
  const base = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "")
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return null

  const redisKey = `aether:rl:${key}`
  const now = Date.now()
  const windowStart = now - options.windowMs
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}`

  try {
    const response = await fetch(`${base}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["ZREMRANGEBYSCORE", redisKey, "-inf", String(windowStart)],
        ["ZADD", redisKey, String(now), member],
        ["ZCARD", redisKey],
        ["PEXPIRE", redisKey, String(options.windowMs)],
        ["ZRANGE", redisKey, "0", "0", "WITHSCORES"],
      ]),
      cache: "no-store",
    })

    if (!response.ok) return null

    const rows = (await response.json()) as Array<{ result?: unknown }>
    const count = Number(rows[2]?.result ?? 0)
    if (!Number.isFinite(count) || count <= options.limit) {
      return { ok: true }
    }

    const oldestRow = rows[4]?.result
    let oldest = now
    if (Array.isArray(oldestRow) && oldestRow.length >= 2) {
      const score = Number(oldestRow[1])
      if (Number.isFinite(score)) oldest = score
    }

    return {
      ok: false,
      retryAfterMs: Math.max(1000, options.windowMs - (now - oldest)),
    }
  } catch {
    return null
  }
}

/**
 * Sliding-window rate limiter for expensive server actions.
 * Uses Upstash Redis when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
 * are set; otherwise best-effort in-process (resets on restart, not shared).
 */
export async function consumeRateLimit(
  key: string,
  options: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  if (upstashConfigured()) {
    const distributed = await consumeUpstash(key, options)
    if (distributed) return distributed
  }
  return consumeInMemory(key, options)
}

/** Test helper — clears in-process buckets between cases. */
export function resetRateLimitBucketsForTests() {
  buckets.clear()
}
