import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  claimRetrievalStatus,
  inspectionChunkWhere,
  restorePublishedStatusFields,
  shouldPreservePublishedIndex,
  shouldStageChunkCount,
} from "./indexing-publish.ts"

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

describe("claimRetrievalStatus", () => {
  it("keeps ready only for a live published generation (claim CASE branch)", () => {
    assert.equal(
      claimRetrievalStatus({
        publishedRunId: "run-a",
        retrievalStatus: "ready",
      }),
      "ready"
    )
    assert.equal(
      claimRetrievalStatus({
        publishedRunId: "run-a",
        retrievalStatus: "pending",
      }),
      "pending"
    )
    assert.equal(
      claimRetrievalStatus({
        publishedRunId: null,
        retrievalStatus: "ready",
      }),
      "pending"
    )
  })
})

describe("inspectionChunkWhere", () => {
  it("prefers the published generation over the active staging run", () => {
    assert.deepEqual(
      inspectionChunkWhere({
        id: "doc-1",
        publishedRunId: "run-published",
        indexingRunId: "run-staging",
      }),
      { documentId: "doc-1", indexingRunId: "run-published" }
    )
  })

  it("falls back to the active run during first-time indexing", () => {
    assert.deepEqual(
      inspectionChunkWhere({
        id: "doc-1",
        publishedRunId: null,
        indexingRunId: "run-first",
      }),
      { documentId: "doc-1", indexingRunId: "run-first" }
    )
  })

  it("returns an unscoped document filter when no run ids exist", () => {
    assert.deepEqual(inspectionChunkWhere({ id: "doc-1" }), {
      documentId: "doc-1",
    })
  })
})

describe("shouldStageChunkCount", () => {
  it("allows intermediate chunkCount writes only when nothing is published", () => {
    assert.equal(shouldStageChunkCount(false), true)
    assert.equal(shouldStageChunkCount(true), false)
  })
})

describe("restorePublishedStatusFields", () => {
  it("restores parse/retrieval and optionally keeps a durable failed signal", () => {
    assert.deepEqual(restorePublishedStatusFields(), {
      indexingStatus: "retrieval-ready",
      retrievalStatus: "ready",
      parseStatus: "parsed",
    })
    assert.deepEqual(restorePublishedStatusFields({ indexingStatus: "failed" }), {
      indexingStatus: "failed",
      retrievalStatus: "ready",
      parseStatus: "parsed",
    })
  })
})
