/**
 * Short-TTL readiness report cache with single-flight coalescing so concurrent
 * `/api/ready` callers share one in-flight probe fan-out instead of N.
 */

export type ReadyCacheEntry<T> = {
  expiresAt: number
  value: T
}

export type ReadyReportCache<T> = {
  get: (now?: number) => ReadyCacheEntry<T> | null
  set: (value: T, now?: number) => ReadyCacheEntry<T>
  clear: () => void
  load: (fetcher: () => Promise<T>, now?: number) => Promise<T>
}

export function createReadyReportCache<T>(ttlMs: number): ReadyReportCache<T> {
  let cached: ReadyCacheEntry<T> | null = null
  let inFlight: Promise<T> | null = null

  function get(now = Date.now()): ReadyCacheEntry<T> | null {
    if (cached && cached.expiresAt > now) return cached
    return null
  }

  function set(value: T, now = Date.now()): ReadyCacheEntry<T> {
    cached = { expiresAt: now + ttlMs, value }
    return cached
  }

  function clear() {
    cached = null
    inFlight = null
  }

  async function load(fetcher: () => Promise<T>, now = Date.now()): Promise<T> {
    const hit = get(now)
    if (hit) return hit.value
    if (inFlight) return inFlight

    inFlight = (async () => {
      try {
        const value = await fetcher()
        set(value)
        return value
      } finally {
        inFlight = null
      }
    })()

    return inFlight
  }

  return { get, set, clear, load }
}
