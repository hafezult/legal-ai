/**
 * Bounded fetch for Supabase Storage so hung upstream calls fail cleanly
 * instead of waiting for the platform kill. Default budget covers large
 * document upload/download during indexing.
 */

export const SUPABASE_FETCH_TIMEOUT_MS = 120_000

export type FetchLike = typeof fetch

/**
 * Wrap a fetch implementation with an AbortSignal timeout. Callers may still
 * pass their own signal; either abort wins.
 */
export function createTimedFetch(
  timeoutMs: number = SUPABASE_FETCH_TIMEOUT_MS,
  fetchImpl: FetchLike = fetch
): FetchLike {
  return async (input, init) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const onAbort = () => controller.abort()
    const outer = init?.signal
    if (outer) {
      if (outer.aborted) controller.abort()
      else outer.addEventListener("abort", onAbort, { once: true })
    }

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
      if (outer) outer.removeEventListener("abort", onAbort)
    }
  }
}
