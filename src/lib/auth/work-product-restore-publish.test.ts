import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { decideWorkProductRestorePublish } from "./work-product-restore-publish.ts"

describe("decideWorkProductRestorePublish", () => {
  it("publishes the locked title when permission and row are live", () => {
    assert.deepEqual(
      decideWorkProductRestorePublish({
        permissionOk: true,
        workProductPresent: true,
        lockedTitle: "Acme v. Beta",
      }),
      { ok: true, title: "Acme v. Beta" }
    )
  })

  it("withholds when membership is revoked", () => {
    assert.deepEqual(
      decideWorkProductRestorePublish({
        permissionOk: false,
        workProductPresent: true,
        lockedTitle: "Acme v. Beta",
      }),
      { ok: false }
    )
  })

  it("withholds when the work product was deleted after the body load", () => {
    assert.deepEqual(
      decideWorkProductRestorePublish({
        permissionOk: true,
        workProductPresent: false,
        lockedTitle: "Acme v. Beta",
      }),
      { ok: false }
    )
  })

  it("withholds when the locked matter title is unavailable", () => {
    assert.deepEqual(
      decideWorkProductRestorePublish({
        permissionOk: true,
        workProductPresent: true,
        lockedTitle: null,
      }),
      { ok: false }
    )
  })
})
