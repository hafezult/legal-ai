import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveMemberAuditLabels } from "./member-audit-labels.ts"

describe("resolveMemberAuditLabels", () => {
  it("publishes locked previous role and email", () => {
    assert.deepEqual(
      resolveMemberAuditLabels({
        lockedPreviousRole: "viewer",
        lockedEmail: "counsel@example.com",
      }),
      {
        previousRole: "viewer",
        email: "counsel@example.com",
      }
    )
  })

  it("withholds when the locked previous role is missing", () => {
    assert.equal(
      resolveMemberAuditLabels({
        lockedPreviousRole: null,
        lockedEmail: "counsel@example.com",
      }),
      null
    )
    assert.equal(
      resolveMemberAuditLabels({
        lockedPreviousRole: "",
        lockedEmail: "counsel@example.com",
      }),
      null
    )
  })

  it("withholds when the locked email is missing", () => {
    assert.equal(
      resolveMemberAuditLabels({
        lockedPreviousRole: "admin",
        lockedEmail: null,
      }),
      null
    )
    assert.equal(
      resolveMemberAuditLabels({
        lockedPreviousRole: "admin",
        lockedEmail: "",
      }),
      null
    )
  })
})
