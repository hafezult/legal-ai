/**
 * End-to-end indexing wall-clock budget helpers.
 *
 * Route/page maxDuration is 300s. Embedding used to start a fresh 240s deadline
 * after parse/chunk, which could still overrun the platform kill and skip
 * failOrRestore. These helpers subtract elapsed pipeline time (and a post-embed
 * reserve for vector writes) before embedding starts.
 */

/** Wall-clock budget under route/page maxDuration (300s). */
export const INDEXING_PIPELINE_BUDGET_MS = 270_000

/** Reserve after embeddings for vector writes + atomic publish. */
export const INDEXING_POST_EMBED_RESERVE_MS = 30_000

/**
 * Minimum remaining budget required to start an OpenAI embedding batch.
 * Keep aligned with OPENAI_REQUEST_TIMEOUT_MS in src/lib/ai/openai-client.ts.
 */
export const INDEXING_MIN_EMBED_BUDGET_MS = 90_000

/** Remaining ms available for embedding after elapsed time and post-embed reserve. */
export function remainingEmbedBudgetMs(
  startedAtMs: number,
  nowMs: number,
  options: {
    pipelineBudgetMs?: number
    postEmbedReserveMs?: number
  } = {}
): number {
  const pipelineBudgetMs = options.pipelineBudgetMs ?? INDEXING_PIPELINE_BUDGET_MS
  const postEmbedReserveMs =
    options.postEmbedReserveMs ?? INDEXING_POST_EMBED_RESERVE_MS
  // Clamp elapsed at 0 so a backward clock jump cannot inflate the budget.
  const elapsedMs = Math.max(0, nowMs - startedAtMs)
  const maxEmbedBudgetMs = Math.max(0, pipelineBudgetMs - postEmbedReserveMs)
  return Math.max(0, Math.min(maxEmbedBudgetMs, pipelineBudgetMs - elapsedMs - postEmbedReserveMs))
}

/** True when at least one OpenAI embedding batch can finish before the budget. */
export function canStartEmbeddingBatch(
  remainingBudgetMs: number,
  minBatchBudgetMs: number = INDEXING_MIN_EMBED_BUDGET_MS
): boolean {
  return (
    Number.isFinite(remainingBudgetMs) &&
    remainingBudgetMs >= minBatchBudgetMs &&
    minBatchBudgetMs > 0
  )
}
