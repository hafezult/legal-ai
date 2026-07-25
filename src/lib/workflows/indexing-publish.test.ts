import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { shouldPreservePublishedIndex } from "./indexing-publish.ts"

describe("shouldPreservePublishedIndex", () => {
  it("preserves only when a published run is already retrieval-ready", () => {
    assert.equal(
      shouldPreservePublishedIndex({
        publishedRunId: "run-a",
        retrievalStatus: "ready",
      }),
      true
    )
    assert.equal(
      shouldPreservePublishedIndex({
        publishedRunId: "run-a",
        retrievalStatus: "pending",
      }),
      false
    )
    assert.equal(
      shouldPreservePublishedIndex({
        publishedRunId: null,
        retrievalStatus: "ready",
      }),
      false
    )
    assert.equal(shouldPreservePublishedIndex({}), false)
  })
})
