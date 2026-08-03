// Embedding layer — OpenAI embeddings for pgvector retrieval

import {
  OPENAI_REQUEST_TIMEOUT_MS,
  openAICallBudgetFromDeadline,
} from "@/lib/ai/openai-client"

export type EmbeddingProvider = "openai"

export type EmbeddingConfig = {
  provider: EmbeddingProvider
  model: string
  dimensions: number
}

export const DEFAULT_CONFIG: EmbeddingConfig = {
  provider: "openai",
  model: "text-embedding-3-small",
  dimensions: 1536,
}

/** Minimum remaining budget required to start one embedding request. */
export const EMBEDDING_MIN_REQUEST_BUDGET_MS = OPENAI_REQUEST_TIMEOUT_MS

// ── OpenAI ────────────────────────────────────────────────────────────────

async function openAIEmbed(
  texts: string[],
  model: string,
  options: {
    timeout: number
    maxRetries: number
    signal?: AbortSignal
  }
): Promise<number[][]> {
  const { createOpenAIClient } = await import("@/lib/ai/openai-client")
  const client = await createOpenAIClient({
    timeout: options.timeout,
    maxRetries: options.maxRetries,
  })

  const response = await client.embeddings.create(
    {
      model,
      input: texts.map((t) => t.slice(0, 8000)), // safety truncation
      encoding_format: "float",
    },
    options.signal ? { signal: options.signal } : undefined
  )

  type EmbeddingItem = { index: number; embedding: number[] }
  return (response.data as EmbeddingItem[])
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding)
}

// ── Public API ────────────────────────────────────────────────────────────

/** True when a multi-batch embedding run has hit its wall-clock budget. */
export function isEmbeddingDeadlineExceeded(
  startedAtMs: number,
  nowMs: number,
  deadlineMs: number | undefined
): boolean {
  return (
    typeof deadlineMs === "number" &&
    deadlineMs > 0 &&
    nowMs - startedAtMs >= deadlineMs
  )
}

/** Remaining ms until a wall-clock embedding deadline (undefined when unset). */
export function remainingEmbeddingBudgetMs(
  startedAtMs: number,
  nowMs: number,
  deadlineMs: number | undefined
): number | undefined {
  if (typeof deadlineMs !== "number" || deadlineMs <= 0) return undefined
  return Math.max(0, deadlineMs - Math.max(0, nowMs - startedAtMs))
}

/**
 * True when at least one OpenAI embedding request can finish before the
 * remaining wall-clock budget (aligned with OPENAI_REQUEST_TIMEOUT_MS).
 */
export function canStartEmbeddingRequest(
  remainingMs: number | undefined,
  minBudgetMs: number = EMBEDDING_MIN_REQUEST_BUDGET_MS
): boolean {
  if (remainingMs === undefined) return true
  return (
    Number.isFinite(remainingMs) && remainingMs >= minBudgetMs && minBudgetMs > 0
  )
}

export async function generateEmbedding(
  text: string,
  config: Partial<EmbeddingConfig> = {}
): Promise<number[]> {
  const [embedding] = await generateBatchEmbeddings([text], config)
  return embedding
}

export async function generateBatchEmbeddings(
  texts: string[],
  config: Partial<EmbeddingConfig> = {},
  options: {
    onBatchComplete?: () => void | Promise<void>
    /** Wall-clock deadline so multi-batch embeds fail before serverless maxDuration. */
    deadlineMs?: number
  } = {}
): Promise<number[][]> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const BATCH = 100 // OpenAI max batch size
  const results: number[][] = []
  const startedAt = Date.now()

  for (let i = 0; i < texts.length; i += BATCH) {
    const nowMs = Date.now()
    if (isEmbeddingDeadlineExceeded(startedAt, nowMs, options.deadlineMs)) {
      throw new Error(
        `Embedding deadline exceeded after ${i} of ${texts.length} texts.`
      )
    }

    const remainingMs = remainingEmbeddingBudgetMs(
      startedAt,
      nowMs,
      options.deadlineMs
    )
    if (!canStartEmbeddingRequest(remainingMs)) {
      throw new Error(
        `Insufficient embedding budget remaining after ${i} of ${texts.length} texts (${remainingMs ?? 0}ms).`
      )
    }

    const batch = texts.slice(i, i + BATCH)
    let batchResult: number[][]

    switch (cfg.provider) {
      case "openai": {
        const budget =
          remainingMs === undefined
            ? { timeout: OPENAI_REQUEST_TIMEOUT_MS, maxRetries: 1 }
            : openAICallBudgetFromDeadline(remainingMs)
        if (!budget) {
          throw new Error(
            `Insufficient embedding budget remaining after ${i} of ${texts.length} texts.`
          )
        }

        const controller = new AbortController()
        const abortTimer =
          remainingMs === undefined
            ? null
            : setTimeout(() => controller.abort(), remainingMs)

        try {
          batchResult = await openAIEmbed(batch, cfg.model, {
            timeout: budget.timeout,
            maxRetries: budget.maxRetries,
            signal: controller.signal,
          })
        } finally {
          if (abortTimer) clearTimeout(abortTimer)
        }
        break
      }
    }

    results.push(...batchResult)
    if (options.onBatchComplete) {
      await options.onBatchComplete()
    }
  }

  return results
}

export function isEmbeddingConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY
}
