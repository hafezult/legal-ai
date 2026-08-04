import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { documentContentPath } from "./content-url.ts"

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
