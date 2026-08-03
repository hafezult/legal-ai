import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildCitationSnapshot,
  parseCitationSnapshot,
  sessionReferencesDocument,
  snapshotEntriesForDocument,
} from "./citation-snapshot.ts"

describe("citationSnapshot", () => {
  it("round-trips compact citation entries with documentId", () => {
    const raw = buildCitationSnapshot([
      {
        id: "chunk_1",
        content: "Disclosure obligation under the SPA.",
        fileName: "spa.pdf",
        pageRef: 3,
        headingPath: "Clause 4",
        documentId: "doc_spa",
      },
      {
        id: "chunk_2",
        content: "Indemnity cap of £2m.",
        fileName: "spa.pdf",
        pageRef: null,
        headingPath: null,
        documentId: "doc_spa",
      },
    ])

    const parsed = parseCitationSnapshot(raw)
    assert.ok(parsed)
    assert.equal(parsed?.length, 2)
    assert.equal(parsed?.[0]?.id, "chunk_1")
    assert.equal(parsed?.[0]?.fileName, "spa.pdf")
    assert.equal(parsed?.[0]?.documentId, "doc_spa")
    assert.equal(parsed?.[1]?.pageRef, null)
    assert.equal(parsed?.[1]?.documentId, "doc_spa")
  })

  it("truncates oversized excerpt content", () => {
    const raw = buildCitationSnapshot([
      {
        id: "chunk_long",
        content: "x".repeat(10_000),
        fileName: "brief.docx",
        pageRef: 1,
        headingPath: null,
      },
    ])
    const parsed = parseCitationSnapshot(raw)
    assert.ok(parsed)
    assert.ok((parsed?.[0]?.content.length ?? 0) <= 4_000)
  })

  it("rejects malformed snapshot payloads", () => {
    assert.equal(parseCitationSnapshot(null), null)
    assert.equal(parseCitationSnapshot(""), null)
    assert.equal(parseCitationSnapshot("{"), null)
    assert.equal(parseCitationSnapshot("[]"), null)
    assert.equal(parseCitationSnapshot(JSON.stringify([{ id: 1 }])), null)
  })

  it("parses legacy snapshots without documentId", () => {
    const legacy = JSON.stringify([
      {
        id: "old",
        content: "Legacy excerpt",
        fileName: "spa.pdf",
        pageRef: 1,
        headingPath: null,
      },
    ])
    const parsed = parseCitationSnapshot(legacy)
    assert.ok(parsed)
    assert.equal(parsed?.[0]?.documentId, undefined)
    assert.equal(parsed?.[0]?.fileName, "spa.pdf")
  })

  it("matches sessions by live chunk ids or snapshot documentId after reindex", () => {
    const snapshot = buildCitationSnapshot([
      {
        id: "old-chunk",
        content: "Prior publish excerpt.",
        fileName: "spa.pdf",
        pageRef: 2,
        headingPath: null,
        documentId: "doc_spa",
      },
    ])

    assert.equal(
      sessionReferencesDocument(
        { chunkIds: ["live-1"], citationSnapshot: null },
        { id: "doc_spa", fileName: "spa.pdf", chunkIds: ["live-1", "live-2"] }
      ),
      true
    )
    assert.equal(
      sessionReferencesDocument(
        { chunkIds: ["old-chunk"], citationSnapshot: snapshot },
        { id: "doc_spa", fileName: "spa.pdf", chunkIds: ["new-chunk"] }
      ),
      true
    )
    assert.equal(
      sessionReferencesDocument(
        { chunkIds: ["other"], citationSnapshot: snapshot },
        { id: "doc_other", fileName: "other.pdf", chunkIds: ["new-chunk"] }
      ),
      false
    )

    const excerpts = snapshotEntriesForDocument(snapshot, {
      id: "doc_spa",
      fileName: "spa.pdf",
    })
    assert.equal(excerpts.length, 1)
    assert.equal(excerpts[0]?.id, "old-chunk")
  })

  it("does not cross-link same-named files when documentId differs", () => {
    const snapshot = buildCitationSnapshot([
      {
        id: "chunk-a",
        content: "From document A",
        fileName: "spa.pdf",
        pageRef: 1,
        headingPath: null,
        documentId: "doc_a",
      },
    ])

    assert.equal(
      sessionReferencesDocument(
        { chunkIds: ["gone"], citationSnapshot: snapshot },
        { id: "doc_b", fileName: "spa.pdf", chunkIds: ["new"] }
      ),
      false
    )
    assert.equal(
      snapshotEntriesForDocument(snapshot, { id: "doc_b", fileName: "spa.pdf" })
        .length,
      0
    )
    assert.equal(
      snapshotEntriesForDocument(snapshot, { id: "doc_a", fileName: "spa.pdf" })
        .length,
      1
    )
  })

  it("falls back to fileName for legacy snapshots without documentId", () => {
    const legacy = buildCitationSnapshot([
      {
        id: "legacy-chunk",
        content: "Filename-only linkage",
        fileName: "spa.pdf",
        pageRef: 1,
        headingPath: null,
      },
    ])
    assert.equal(
      sessionReferencesDocument(
        { chunkIds: ["gone"], citationSnapshot: legacy },
        { id: "doc_spa", fileName: "spa.pdf", chunkIds: ["new"] }
      ),
      true
    )
    assert.equal(snapshotEntriesForDocument(legacy, "spa.pdf").length, 1)
  })
})
