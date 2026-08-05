import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolvePublishMatterTitle } from "./matter-title-publish.ts"

describe("resolvePublishMatterTitle", () => {
  it("publishes the locked title string, including empty labels", () => {
    assert.equal(resolvePublishMatterTitle({ lockedTitle: "Acme v. Beta" }), "Acme v. Beta")
    assert.equal(resolvePublishMatterTitle({ lockedTitle: "" }), "")
  })

  it("withholds when the locked re-read did not yield a title", () => {
    assert.equal(resolvePublishMatterTitle({ lockedTitle: null }), null)
    assert.equal(resolvePublishMatterTitle({ lockedTitle: undefined }), null)
  })
})
