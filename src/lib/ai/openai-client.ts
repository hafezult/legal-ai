/**
 * Shared OpenAI client factory with a bounded request timeout so hung
 * provider calls fail cleanly instead of waiting for the platform kill.
 */

export const OPENAI_REQUEST_TIMEOUT_MS = 90_000

export async function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.")

  const { OpenAI } = await import("openai")
  return new OpenAI({
    apiKey,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
    maxRetries: 1,
  })
}
