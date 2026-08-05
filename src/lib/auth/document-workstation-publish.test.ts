import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { decideDocumentWorkstationPublish } from "./document-workstation-publish.ts"

describe("decideDocumentWorkstationPublish", () => {
  it("publishes locked matter labels when permission and document are live", () => {
    assert.deepEqual(
      decideDocumentWorkstationPublish({
        permissionOk: true,
        hasPublishRole: true,
        documentPresent: true,
        lockedTitle: "Acme v. Beta",
        lockedClientName: "Acme Ltd",
      }),
      {
        ok: true,
        matterTitle: "Acme v. Beta",
        matterClient: "Acme Ltd",
      }
    )
  })

  it("normalizes a missing client name to null", () => {
    assert.deepEqual(
      decideDocumentWorkstationPublish({
        permissionOk: true,
        hasPublishRole: true,
        documentPresent: true,
        lockedTitle: "Acme v. Beta",
        lockedClientName: undefined,
      }),
      {
        ok: true,
        matterTitle: "Acme v. Beta",
        matterClient: null,
      }
    )
  })

  it("withholds when membership is revoked", () => {
    assert.deepEqual(
      decideDocumentWorkstationPublish({
        permissionOk: false,
        hasPublishRole: true,
        documentPresent: true,
        lockedTitle: "Acme v. Beta",
        lockedClientName: "Acme Ltd",
      }),
      { ok: false }
    )
  })

  it("withholds when the document was deleted after the body load", () => {
    assert.deepEqual(
      decideDocumentWorkstationPublish({
        permissionOk: true,
        hasPublishRole: true,
        documentPresent: false,
        lockedTitle: "Acme v. Beta",
        lockedClientName: "Acme Ltd",
      }),
      { ok: false }
    )
  })

  it("withholds when the publish role is missing", () => {
    assert.deepEqual(
      decideDocumentWorkstationPublish({
        permissionOk: true,
        hasPublishRole: false,
        documentPresent: true,
        lockedTitle: "Acme v. Beta",
        lockedClientName: "Acme Ltd",
      }),
      { ok: false }
    )
  })
})
