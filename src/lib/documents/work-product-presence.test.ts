import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  draftDocumentPresenceByIds,
  researchSessionPresenceByIds,
} from "./work-product-presence.ts"

describe("work-product presence helpers", () => {
  it("returns empty maps for empty id lists without querying", async () => {
    const research = await researchSessionPresenceByIds([])
    const drafts = await draftDocumentPresenceByIds([])
    assert.equal(research.size, 0)
    assert.equal(drafts.size, 0)
  })
})
