import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  STALE_INDEXING_MS,
  documentIndexingBusy,
  documentNeedsRetry,
  isDocumentRetrievalReady,
} from "./status.ts"

describe("documentNeedsRetry", () => {
  const now = new Date("2026-07-24T12:00:00.000Z")

  it("retries failed indexing or retrieval", () => {
    assert.equal(
      documentNeedsRetry(
        { indexingStatus: "failed", retrievalStatus: "pending" },
        now
      ),
      true
    )
    assert.equal(
      documentNeedsRetry(
        { indexingStatus: "indexed", retrievalStatus: "failed" },
        now
      ),
      true
    )
  })

  it("retries indexed documents waiting on embeddings", () => {
    assert.equal(
      documentNeedsRetry(
        { indexingStatus: "indexed", retrievalStatus: "pending" },
        now
      ),
      true
    )
  })

  it("retries stale mid-pipeline statuses only", () => {
    const fresh = new Date(now.getTime() - STALE_INDEXING_MS + 1_000)
    const stale = new Date(now.getTime() - STALE_INDEXING_MS - 1_000)

    assert.equal(
      documentNeedsRetry(
        {
          indexingStatus: "embedding",
          retrievalStatus: "pending",
          updatedAt: fresh,
        },
        now
      ),
      false
    )
    assert.equal(
      documentNeedsRetry(
        {
          indexingStatus: "embedding",
          retrievalStatus: "pending",
          updatedAt: stale,
        },
        now
      ),
      true
    )
  })

  it("does not retry healthy retrieval-ready documents", () => {
    assert.equal(
      documentNeedsRetry(
        {
          indexingStatus: "retrieval-ready",
          retrievalStatus: "ready",
          updatedAt: now,
        },
        now
      ),
      false
    )
  })
})

describe("isDocumentRetrievalReady", () => {
  it("requires both retrieval-ready indexing and ready retrieval", () => {
    assert.equal(
      isDocumentRetrievalReady({
        indexingStatus: "retrieval-ready",
        retrievalStatus: "ready",
      }),
      true
    )
    assert.equal(
      isDocumentRetrievalReady({
        indexingStatus: "indexed",
        retrievalStatus: "ready",
      }),
      false
    )
    assert.equal(
      isDocumentRetrievalReady({
        indexingStatus: "retrieval-ready",
        retrievalStatus: "pending",
      }),
      false
    )
  })
})

describe("documentIndexingBusy", () => {
  const now = new Date("2026-07-24T12:00:00.000Z")

  it("is busy only for non-stale active pipeline stages", () => {
    const fresh = new Date(now.getTime() - 60_000)
    const stale = new Date(now.getTime() - STALE_INDEXING_MS - 1_000)

    assert.equal(
      documentIndexingBusy({ indexingStatus: "chunking", updatedAt: fresh }, now),
      true
    )
    assert.equal(
      documentIndexingBusy({ indexingStatus: "chunking", updatedAt: stale }, now),
      false
    )
    assert.equal(
      documentIndexingBusy({ indexingStatus: "pending", updatedAt: fresh }, now),
      false
    )
    assert.equal(
      documentIndexingBusy(
        { indexingStatus: "retrieval-ready", updatedAt: fresh },
        now
      ),
      false
    )
  })
})
