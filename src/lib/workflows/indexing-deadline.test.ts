import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { OPENAI_REQUEST_TIMEOUT_MS } from "../ai/openai-client.ts"
import {
  canStartEmbeddingBatch,
  INDEXING_MIN_EMBED_BUDGET_MS,
  INDEXING_PIPELINE_BUDGET_MS,
  INDEXING_POST_EMBED_RESERVE_MS,
  remainingEmbedBudgetMs,
} from "./indexing-deadline.ts"

describe("remainingEmbedBudgetMs", () => {
  it("subtracts elapsed pipeline time and post-embed reserve", () => {
    assert.equal(
      remainingEmbedBudgetMs(0, 100_000),
      INDEXING_PIPELINE_BUDGET_MS - 100_000 - INDEXING_POST_EMBED_RESERVE_MS
    )
  })

  it("clamps at zero when parse/chunk consumed the budget", () => {
    assert.equal(
      remainingEmbedBudgetMs(0, INDEXING_PIPELINE_BUDGET_MS),
      0
    )
    assert.equal(
      remainingEmbedBudgetMs(
        0,
        INDEXING_PIPELINE_BUDGET_MS - INDEXING_POST_EMBED_RESERVE_MS + 1
      ),
      0
    )
  })

  it("accepts custom budgets", () => {
    assert.equal(
      remainingEmbedBudgetMs(1_000, 6_000, {
        pipelineBudgetMs: 20_000,
        postEmbedReserveMs: 5_000,
      }),
      10_000
    )
  })
})

describe("canStartEmbeddingBatch", () => {
  it("requires at least one OpenAI request timeout of headroom", () => {
    assert.equal(INDEXING_MIN_EMBED_BUDGET_MS, OPENAI_REQUEST_TIMEOUT_MS)
    assert.equal(canStartEmbeddingBatch(OPENAI_REQUEST_TIMEOUT_MS), true)
    assert.equal(canStartEmbeddingBatch(OPENAI_REQUEST_TIMEOUT_MS - 1), false)
    assert.equal(canStartEmbeddingBatch(0), false)
  })

  it("rejects non-finite budgets", () => {
    assert.equal(canStartEmbeddingBatch(Number.NaN), false)
    assert.equal(canStartEmbeddingBatch(Number.POSITIVE_INFINITY), false)
  })
})
