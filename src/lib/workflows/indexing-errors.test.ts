import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  IndexingInProgressError,
  IndexingRunSupersededError,
  isIndexingInProgressError,
  isIndexingRunSupersededError,
} from "./indexing.ts"

describe("indexing error guards", () => {
  it("recognizes IndexingInProgressError instances and name-matched Errors", () => {
    const native = new IndexingInProgressError("doc-1")
    assert.equal(isIndexingInProgressError(native), true)
    assert.equal(isIndexingRunSupersededError(native), false)

    const renamed = new Error("busy")
    renamed.name = "IndexingInProgressError"
    assert.equal(isIndexingInProgressError(renamed), true)

    assert.equal(isIndexingInProgressError(new Error("other")), false)
    assert.equal(isIndexingInProgressError(null), false)
    assert.equal(isIndexingInProgressError("IndexingInProgressError"), false)
  })

  it("recognizes IndexingRunSupersededError instances and name-matched Errors", () => {
    const native = new IndexingRunSupersededError("doc-2", "run-9")
    assert.equal(isIndexingRunSupersededError(native), true)
    assert.equal(isIndexingInProgressError(native), false)
    assert.equal(native.documentId, "doc-2")
    assert.equal(native.runId, "run-9")

    const renamed = new Error("superseded")
    renamed.name = "IndexingRunSupersededError"
    assert.equal(isIndexingRunSupersededError(renamed), true)

    assert.equal(isIndexingRunSupersededError(new Error("other")), false)
    assert.equal(isIndexingRunSupersededError(undefined), false)
  })
})
