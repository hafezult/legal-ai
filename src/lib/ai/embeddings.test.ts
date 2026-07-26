import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isEmbeddingDeadlineExceeded } from "./embeddings.ts"

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
