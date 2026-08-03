type Bucket = {
  timestamps: number[]
}

const buckets = new Map<string, Bucket>()

/** Cap in-process keys so attacker-chosen IPs/ids cannot grow memory unboundedly. */
const MAX_IN_MEMORY_BUCKETS = 5_000

/** Bound Upstash REST so a blackholed Redis cannot stall request handlers. */
const UPSTASH_FETCH_TIMEOUT_MS = 1_500

type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number }

export type RateLimitOptions = {
  limit: number
  windowMs: number
  /**
   * When true, skip Upstash even if configured. Used by cheap liveness probes
   * that must not perform external network I/O.
   */
  localOnly?: boolean
}

export type UpstashPipelineDecision =
  | { ok: true }
  | { ok: false; retryAfterMs: number; rejectMember: string }

export type UpstashPipelineParse =
  | { ok: true; count: number; oldestScore: number | null }
  | { ok: false }

/**
 * Interpret an Upstash pipeline response for the sliding-window limiter.
 * When over limit, callers must ZREM `rejectMember` so denied retries do not
 * accumulate timestamps and extend the lockout window.
 */
export function decideUpstashRateLimit(args: {
  count: number
  limit: number
  windowMs: number
  now: number
  member: string
  oldestScore: number | null
}): UpstashPipelineDecision {
  if (!Number.isFinite(args.count) || args.count <= args.limit) {
    return { ok: true }
  }

  const oldest = Number.isFinite(args.oldestScore)
    ? (args.oldestScore as number)
    : args.now

  return {
    ok: false,
    retryAfterMs: Math.max(1000, args.windowMs - (args.now - oldest)),
    rejectMember: args.member,
  }
}

/**
 * Validate a 5-command Upstash pipeline body (ZREMRANGEBYSCORE, ZADD, ZCARD,
 * PEXPIRE, ZRANGE). Malformed or error-bearing rows return `{ ok: false }` so
 * callers fall back to the in-memory limiter instead of fail-opening.
 */
export function parseUpstashPipelineRows(
  rows: unknown
): UpstashPipelineParse {
  if (!Array.isArray(rows) || rows.length < 5) {
    return { ok: false }
  }

  for (let i = 0; i < 5; i += 1) {
    const row = rows[i]
    if (
      typeof row !== "object" ||
      row === null ||
      ("error" in row && (row as { error?: unknown }).error != null)
    ) {
      return { ok: false }
    }
  }

  const countRaw = (rows[2] as { result?: unknown }).result
  const count = typeof countRaw === "number" ? countRaw : Number(countRaw)
  if (!Number.isFinite(count) || count < 0) {
    return { ok: false }
  }

  const oldestRow = (rows[4] as { result?: unknown }).result
  let oldestScore: number | null = null
  if (Array.isArray(oldestRow) && oldestRow.length >= 2) {
    const score = Number(oldestRow[1])
    if (!Number.isFinite(score)) {
      return { ok: false }
    }
    oldestScore = score
  }

  return { ok: true, count, oldestScore }
}

function evictStaleBuckets(now: number, windowMs: number) {
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter(
      (stamp) => now - stamp < windowMs
    )
    if (bucket.timestamps.length === 0) {
      buckets.delete(key)
    }
  }
  // Map iteration is insertion-ordered; drop oldest keys when still over cap.
  while (buckets.size > MAX_IN_MEMORY_BUCKETS) {
    const oldestKey = buckets.keys().next().value
    if (oldestKey === undefined) break
    buckets.delete(oldestKey)
  }
}

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

  if (buckets.size > MAX_IN_MEMORY_BUCKETS) {
    evictStaleBuckets(now, options.windowMs)
  }

  return { ok: true }
}

/** Test helper — current in-process bucket count. */
export function inMemoryRateLimitBucketCountForTests() {
  return buckets.size
}

function upstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  )
}

async function upstashFetch(
  base: string,
  token: string,
  body: unknown
): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTASH_FETCH_TIMEOUT_MS)
  try {
    return await fetch(`${base}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function upstashCommand(
  base: string,
  token: string,
  command: unknown[]
): Promise<boolean> {
  const response = await upstashFetch(base, token, [command])
  return Boolean(response?.ok)
}

/**
 * Optional Upstash Redis REST sliding-window limiter for multi-instance deploys.
 * Falls back to the in-process bucket when unset, timed out, or malformed.
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
    const response = await upstashFetch(base, token, [
      ["ZREMRANGEBYSCORE", redisKey, "-inf", String(windowStart)],
      ["ZADD", redisKey, String(now), member],
      ["ZCARD", redisKey],
      ["PEXPIRE", redisKey, String(options.windowMs)],
      ["ZRANGE", redisKey, "0", "0", "WITHSCORES"],
    ])

    if (!response?.ok) return null

    let rows: unknown
    try {
      rows = await response.json()
    } catch {
      return null
    }

    const parsed = parseUpstashPipelineRows(rows)
    if (!parsed.ok) return null

    const decision = decideUpstashRateLimit({
      count: parsed.count,
      limit: options.limit,
      windowMs: options.windowMs,
      now,
      member,
      oldestScore: parsed.oldestScore,
    })

    if (!decision.ok) {
      // Drop the rejected attempt so retries do not inflate the window.
      // Retry once; if cleanup still fails, fall back to in-memory so the
      // denied member does not remain and extend distributed lockout.
      const removed =
        (await upstashCommand(base, token, [
          "ZREM",
          redisKey,
          decision.rejectMember,
        ])) ||
        (await upstashCommand(base, token, [
          "ZREM",
          redisKey,
          decision.rejectMember,
        ]))
      if (!removed) return null
      return { ok: false, retryAfterMs: decision.retryAfterMs }
    }

    return { ok: true }
  } catch {
    return null
  }
}

/**
 * Sliding-window rate limiter for expensive server actions.
 * Uses Upstash Redis when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
 * are set (unless `localOnly`); otherwise best-effort in-process (resets on
 * restart, not shared).
 */
export async function consumeRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { localOnly, ...window } = options
  if (!localOnly && upstashConfigured()) {
    const distributed = await consumeUpstash(key, window)
    if (distributed) return distributed
  }
  return consumeInMemory(key, window)
}

/** Test helper — clears in-process buckets between cases. */
export function resetRateLimitBucketsForTests() {
  buckets.clear()
}
