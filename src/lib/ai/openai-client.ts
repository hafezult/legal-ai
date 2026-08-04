/**
 * Shared OpenAI client factory with a bounded request timeout so hung
 * provider calls fail cleanly instead of waiting for the platform kill.
 */

export const OPENAI_REQUEST_TIMEOUT_MS = 90_000

export type OpenAIClientOptions = {
  /** Per-request timeout (defaults to OPENAI_REQUEST_TIMEOUT_MS). */
  timeout?: number
  /** SDK retries after transport failures (defaults to 1). */
  maxRetries?: number
}

export async function createOpenAIClient(options: OpenAIClientOptions = {}) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.")

  const timeout = options.timeout ?? OPENAI_REQUEST_TIMEOUT_MS
  const maxRetries = options.maxRetries ?? 1

  const { OpenAI } = await import("openai")
  return new OpenAI({
    apiKey,
    timeout,
    maxRetries,
  })
}

/**
 * Derive a per-call timeout/retry budget from a wall-clock deadline so a late
 * embedding batch cannot start a full timeout+retry after the parent budget.
 */
export function openAICallBudgetFromDeadline(
  remainingMs: number,
  options: {
    requestTimeoutMs?: number
  } = {}
): { timeout: number; maxRetries: number } | null {
  const requestTimeoutMs = options.requestTimeoutMs ?? OPENAI_REQUEST_TIMEOUT_MS
  if (!Number.isFinite(remainingMs) || remainingMs < 1_000) return null

  const timeout = Math.min(requestTimeoutMs, Math.floor(remainingMs))
  if (timeout < 1_000) return null

  // Only retry when a second full attempt still fits in the remaining budget.
  const maxRetries = remainingMs >= timeout * 2 ? 1 : 0
  return { timeout, maxRetries }
}
