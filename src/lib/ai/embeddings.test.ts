import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  canStartEmbeddingRequest,
  EMBEDDING_MIN_REQUEST_BUDGET_MS,
  isEmbeddingDeadlineExceeded,
  remainingEmbeddingBudgetMs,
} from "./embeddings.ts"
import { OPENAI_REQUEST_TIMEOUT_MS } from "./openai-client.ts"

describe("isEmbeddingDeadlineExceeded", () => {
  it("is false when deadline is unset, zero, or negative", () => {
    assert.equal(isEmbeddingDeadlineExceeded(0, 10_000, undefined), false)
    assert.equal(isEmbeddingDeadlineExceeded(0, 10_000, 0), false)
    assert.equal(isEmbeddingDeadlineExceeded(0, 10_000, -1), false)
  })

  it("is false before the deadline and true at/after it", () => {
    assert.equal(isEmbeddingDeadlineExceeded(1_000, 1_999, 1_000), false)
    assert.equal(isEmbeddingDeadlineExceeded(1_000, 2_000, 1_000), true)
    assert.equal(isEmbeddingDeadlineExceeded(1_000, 2_500, 1_000), true)
  })
})

describe("remainingEmbeddingBudgetMs", () => {
  it("is undefined when deadline is unset", () => {
    assert.equal(remainingEmbeddingBudgetMs(0, 10_000, undefined), undefined)
  })

  it("clamps remaining budget at zero", () => {
    assert.equal(remainingEmbeddingBudgetMs(1_000, 1_500, 1_000), 500)
    assert.equal(remainingEmbeddingBudgetMs(1_000, 3_000, 1_000), 0)
  })
})

describe("canStartEmbeddingRequest", () => {
  it("allows requests when no deadline is set", () => {
    assert.equal(canStartEmbeddingRequest(undefined), true)
  })

  it("requires at least one full OpenAI request budget", () => {
    assert.equal(EMBEDDING_MIN_REQUEST_BUDGET_MS, OPENAI_REQUEST_TIMEOUT_MS)
    assert.equal(canStartEmbeddingRequest(OPENAI_REQUEST_TIMEOUT_MS), true)
    assert.equal(canStartEmbeddingRequest(OPENAI_REQUEST_TIMEOUT_MS - 1), false)
    assert.equal(canStartEmbeddingRequest(0), false)
  })
})
