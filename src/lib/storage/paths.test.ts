import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { normalizeStoragePaths } from "./paths.ts"

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
