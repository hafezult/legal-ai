import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildDocumentStoragePath,
  normalizeStoragePaths,
  STORAGE_REMOVE_BATCH_SIZE,
} from "./paths.ts"

describe("normalizeStoragePaths", () => {
  it("deduplicates and drops empty paths", () => {
    assert.deepEqual(
      normalizeStoragePaths(["a/b.pdf", "", "a/b.pdf", "  ", "c/d.docx"]),
      ["a/b.pdf", "c/d.docx"]
    )
  })

  it("returns an empty list for empty input", () => {
    assert.deepEqual(normalizeStoragePaths([]), [])
  })
})

describe("STORAGE_REMOVE_BATCH_SIZE", () => {
  it("keeps multi-path deletes in bounded provider batches", () => {
    assert.ok(STORAGE_REMOVE_BATCH_SIZE >= 50)
    assert.ok(STORAGE_REMOVE_BATCH_SIZE <= 500)
  })
})

describe("buildDocumentStoragePath", () => {
  it("nests clerk/matter and uses a stable unique segment", () => {
    assert.equal(
      buildDocumentStoragePath({
        clerkId: "user_abc",
        matterId: "matter_1",
        fileName: "brief.pdf",
        id: "fixed-id",
      }),
      "user_abc/matter_1/fixed-id-brief.pdf"
    )
  })

  it("generates distinct paths when id is omitted", () => {
    const a = buildDocumentStoragePath({
      clerkId: "user_abc",
      matterId: "matter_1",
      fileName: "brief.pdf",
    })
    const b = buildDocumentStoragePath({
      clerkId: "user_abc",
      matterId: "matter_1",
      fileName: "brief.pdf",
    })
    assert.notEqual(a, b)
    assert.match(a, /^user_abc\/matter_1\/.+-brief\.pdf$/)
  })
})
