import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildCitationSnapshot,
  parseCitationSnapshot,
} from "./citation-snapshot.ts"

describe("citationSnapshot", () => {
  it("round-trips compact citation entries", () => {
    const raw = buildCitationSnapshot([
      {
        id: "chunk_1",
        content: "Disclosure obligation under the SPA.",
        fileName: "spa.pdf",
        pageRef: 3,
        headingPath: "Clause 4",
      },
      {
        id: "chunk_2",
        content: "Indemnity cap of £2m.",
        fileName: "spa.pdf",
        pageRef: null,
        headingPath: null,
      },
    ])

    const parsed = parseCitationSnapshot(raw)
    assert.ok(parsed)
    assert.equal(parsed?.length, 2)
    assert.equal(parsed?.[0]?.id, "chunk_1")
    assert.equal(parsed?.[0]?.fileName, "spa.pdf")
    assert.equal(parsed?.[1]?.pageRef, null)
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
})
