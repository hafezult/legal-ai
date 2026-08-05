import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  decideDocumentWorkstationPublish,
  selectLiveWorkstationResearchSessions,
} from "./document-workstation-publish.ts"

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

describe("selectLiveWorkstationResearchSessions", () => {
  const locked = [
    { id: "s1", query: "indemnity cap" },
    { id: "s2", query: "force majeure" },
  ]

  it("publishes sessions re-confirmed under the final matter lock", () => {
    assert.deepEqual(
      selectLiveWorkstationResearchSessions({
        documentPresent: true,
        lockedSessions: locked,
      }),
      locked
    )
  })

  it("omits research queries when the document was deleted after the probe", () => {
    assert.deepEqual(
      selectLiveWorkstationResearchSessions({
        documentPresent: false,
        lockedSessions: locked,
      }),
      []
    )
  })

  it("omits tombstoned sessions by returning only locked rows", () => {
    // Caller re-reads under lock; deleted s2 is absent from lockedSessions.
    assert.deepEqual(
      selectLiveWorkstationResearchSessions({
        documentPresent: true,
        lockedSessions: [{ id: "s1", query: "indemnity cap" }],
      }),
      [{ id: "s1", query: "indemnity cap" }]
    )
  })

  it("returns a shallow copy so callers cannot mutate the locked snapshot", () => {
    const published = selectLiveWorkstationResearchSessions({
      documentPresent: true,
      lockedSessions: locked,
    })
    published.pop()
    assert.equal(locked.length, 2)
  })
})
