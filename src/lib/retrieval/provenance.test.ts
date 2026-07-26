import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildCitationSnapshot,
  orderProvenanceByChunkIds,
  provenanceChunksFromSnapshot,
  resolveProvenanceFromSnapshot,
} from "./citation-snapshot.ts"

describe("orderProvenanceByChunkIds", () => {
  it("preserves the original retrieval hit order", () => {
    const rows = [
      { id: "c", label: "third" },
      { id: "a", label: "first" },
      { id: "b", label: "second" },
    ]
    assert.deepEqual(orderProvenanceByChunkIds(rows, ["a", "b", "c"]), [
      { id: "a", label: "first" },
      { id: "b", label: "second" },
      { id: "c", label: "third" },
    ])
  })

  it("skips missing ids without reordering survivors", () => {
    const rows = [
      { id: "a", label: "first" },
      { id: "c", label: "third" },
    ]
    assert.deepEqual(orderProvenanceByChunkIds(rows, ["a", "missing", "c"]), [
      { id: "a", label: "first" },
      { id: "c", label: "third" },
    ])
  })
})

describe("provenanceChunksFromSnapshot", () => {
  it("maps snapshot entries to distance-0 provenance chunks", () => {
    const snapshot = buildCitationSnapshot([
      {
        id: "chunk-1",
        content: "Operative clause.",
        fileName: "agreement.pdf",
        pageRef: 2,
        headingPath: "Clause 1",
      },
    ])
    const parsed = JSON.parse(snapshot) as Array<{
      id: string
      content: string
      fileName: string
      pageRef: number | null
      headingPath: string | null
    }>
    const chunks = provenanceChunksFromSnapshot(parsed)
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0]?.id, "chunk-1")
    assert.equal(chunks[0]?.distance, 0)
    assert.equal(chunks[0]?.pageRef, 2)
  })
})

describe("resolveProvenanceFromSnapshot", () => {
  it("prefers citation snapshots and orders by chunkIds", () => {
    const snapshot = buildCitationSnapshot([
      {
        id: "b",
        content: "Second hit",
        fileName: "memo.pdf",
        pageRef: 4,
        headingPath: null,
      },
      {
        id: "a",
        content: "First hit",
        fileName: "memo.pdf",
        pageRef: 1,
        headingPath: "Intro",
      },
    ])

    const chunks = resolveProvenanceFromSnapshot(["a", "b"], snapshot)
    assert.ok(chunks)
    assert.deepEqual(
      chunks!.map((chunk) => chunk.id),
      ["a", "b"]
    )
    assert.equal(chunks![0]?.content, "First hit")
    assert.equal(chunks![0]?.distance, 0)
  })

  it("returns snapshot order when chunkIds do not match", () => {
    const snapshot = buildCitationSnapshot([
      {
        id: "snap-1",
        content: "Only snapshot",
        fileName: "brief.pdf",
        pageRef: null,
        headingPath: null,
      },
    ])

    const chunks = resolveProvenanceFromSnapshot(["missing-id"], snapshot)
    assert.ok(chunks)
    assert.equal(chunks!.length, 1)
    assert.equal(chunks![0]?.id, "snap-1")
  })

  it("returns null when no snapshot is present", () => {
    assert.equal(resolveProvenanceFromSnapshot(["a"], null), null)
    assert.equal(resolveProvenanceFromSnapshot(["a"], ""), null)
  })
})
