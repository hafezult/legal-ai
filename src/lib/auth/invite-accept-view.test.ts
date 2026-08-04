import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { decideInviteAcceptPublish } from "./invite-accept-view.ts"

const freshInvite = {
  email: "counsel@example.com",
  role: "member",
  expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  acceptedAt: null,
  organizationName: "North Chambers",
}

describe("decideInviteAcceptPublish", () => {
  it("publishes only when a fresh invite still matches verified emails", () => {
    const decision = decideInviteAcceptPublish({
      verifiedEmails: ["counsel@example.com"],
      freshInvite,
    })
    assert.deepEqual(decision, { kind: "publish", invite: freshInvite })
  })

  it("hides metadata when the invite disappeared after identity lookup", () => {
    const decision = decideInviteAcceptPublish({
      verifiedEmails: ["counsel@example.com"],
      freshInvite: null,
    })
    assert.deepEqual(decision, { kind: "unavailable" })
  })

  it("hides metadata when the invite target rotated to another email", () => {
    const decision = decideInviteAcceptPublish({
      verifiedEmails: ["counsel@example.com"],
      freshInvite: {
        ...freshInvite,
        email: "other@example.com",
      },
    })
    assert.deepEqual(decision, { kind: "unavailable" })
  })
})
