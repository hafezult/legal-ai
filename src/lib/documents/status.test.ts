import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  STALE_INDEXING_MS,
  documentCorpusIndexedWhere,
  documentIndexingBusy,
  documentNeedsRetry,
  documentRetrievalReadyWhere,
  documentRetryOr,
  isDocumentCorpusIndexed,
  isDocumentRetrievalReady,
  publishedChunkCountContribution,
  RETRYABLE_IN_PROGRESS_STATUSES,
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

  it("retries stale queued pending documents", () => {
    const stale = new Date(now.getTime() - STALE_INDEXING_MS - 1_000)
    assert.equal(
      documentNeedsRetry(
        {
          indexingStatus: "pending",
          retrievalStatus: "pending",
          updatedAt: stale,
        },
        now
      ),
      true
    )
  })
})

describe("documentRetryOr", () => {
  it("mirrors documentNeedsRetry branches for SQL composition", () => {
    const staleBefore = new Date("2026-07-24T11:50:00.000Z")
    const branches = documentRetryOr(staleBefore)

    assert.deepEqual(branches[0], { indexingStatus: "failed" })
    assert.deepEqual(branches[1], { retrievalStatus: "failed" })
    assert.deepEqual(branches[2], {
      indexingStatus: "indexed",
      retrievalStatus: "pending",
    })
    assert.deepEqual(branches[3], {
      indexingStatus: { in: [...RETRYABLE_IN_PROGRESS_STATUSES] },
      updatedAt: { lt: staleBefore },
    })
  })
})

describe("isDocumentRetrievalReady", () => {
  it("requires ready retrieval and a published generation (matches search SQL)", () => {
    assert.equal(
      isDocumentRetrievalReady({
        indexingStatus: "retrieval-ready",
        retrievalStatus: "ready",
        publishedRunId: "run-a",
      }),
      true
    )
    assert.equal(
      isDocumentRetrievalReady({
        indexingStatus: "retrieval-ready",
        retrievalStatus: "ready",
      }),
      false
    )
    assert.equal(
      isDocumentRetrievalReady({
        indexingStatus: "indexed",
        retrievalStatus: "ready",
        publishedRunId: "run-a",
      }),
      true
    )
    assert.equal(
      isDocumentRetrievalReady({
        indexingStatus: "retrieval-ready",
        retrievalStatus: "pending",
        publishedRunId: "run-a",
      }),
      false
    )
  })

  it("keeps published docs ready across mid-reindex and failed reindex", () => {
    assert.equal(
      isDocumentRetrievalReady({
        indexingStatus: "embedding",
        retrievalStatus: "ready",
        publishedRunId: "run-prior",
      }),
      true
    )
    assert.equal(
      isDocumentRetrievalReady({
        indexingStatus: "failed",
        retrievalStatus: "ready",
        publishedRunId: "run-prior",
      }),
      true
    )
    assert.equal(
      isDocumentRetrievalReady({
        indexingStatus: "parsing",
        retrievalStatus: "pending",
        publishedRunId: "run-prior",
      }),
      false
    )
  })
})

describe("documentRetrievalReadyWhere", () => {
  it("matches ready + publishedRunId regardless of indexing status", () => {
    assert.deepEqual(documentRetrievalReadyWhere(), {
      retrievalStatus: "ready",
      publishedRunId: { not: null },
    })
  })
})

describe("documentCorpusIndexedWhere", () => {
  it("includes retrieval-ready and mid-reindex published documents", () => {
    assert.deepEqual(documentCorpusIndexedWhere(), {
      OR: [
        { indexingStatus: "retrieval-ready" },
        {
          retrievalStatus: "ready",
          publishedRunId: { not: null },
        },
      ],
    })
  })
})

describe("isDocumentCorpusIndexed", () => {
  it("counts retrieval-ready and published mid/failed reindex docs", () => {
    assert.equal(
      isDocumentCorpusIndexed({
        indexingStatus: "indexed",
        retrievalStatus: "pending",
      }),
      false
    )
    assert.equal(
      isDocumentCorpusIndexed({
        indexingStatus: "retrieval-ready",
        retrievalStatus: "ready",
        publishedRunId: "run-a",
      }),
      true
    )
    assert.equal(
      isDocumentCorpusIndexed({
        indexingStatus: "failed",
        retrievalStatus: "ready",
        publishedRunId: "run-a",
      }),
      true
    )
    assert.equal(
      isDocumentCorpusIndexed({
        indexingStatus: "failed",
        retrievalStatus: "failed",
        publishedRunId: null,
      }),
      false
    )
  })
})

describe("publishedChunkCountContribution", () => {
  it("counts only published generation sizes", () => {
    assert.equal(
      publishedChunkCountContribution({
        publishedRunId: "run-a",
        chunkCount: 12,
      }),
      12
    )
    assert.equal(
      publishedChunkCountContribution({
        publishedRunId: null,
        chunkCount: 12,
      }),
      0
    )
  })
})

describe("documentNeedsRetry with preserved failed reindex", () => {
  it("retries failed indexing even when retrieval stays ready", () => {
    const now = new Date("2026-07-24T12:00:00.000Z")
    assert.equal(
      documentNeedsRetry(
        {
          indexingStatus: "failed",
          retrievalStatus: "ready",
          updatedAt: now,
        },
        now
      ),
      true
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
