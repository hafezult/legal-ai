import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  documentContentPath,
  isDocumentContentPathIds,
} from "./content-url.ts"

describe("documentContentPath", () => {
  it("builds the authenticated content API path", () => {
    assert.equal(
      documentContentPath(
        "cabcdefghijklmnopqrstuvwx",
        "cabcdefghijklmnopqrstuvwy"
      ),
      "/api/matters/cabcdefghijklmnopqrstuvwx/documents/cabcdefghijklmnopqrstuvwy/content"
    )
  })
})

describe("isDocumentContentPathIds", () => {
  it("accepts cuid-shaped matter and document ids", () => {
    assert.equal(
      isDocumentContentPathIds(
        "cabcdefghijklmnopqrstuvwx",
        "cabcdefghijklmnopqrstuvwy"
      ),
      true
    )
  })

  it("rejects path junk", () => {
    assert.equal(isDocumentContentPathIds("../x", "cabcdefghijklmnopqrstuvwy"), false)
    assert.equal(isDocumentContentPathIds("cabcdefghijklmnopqrstuvwx", "nope"), false)
  })
})
