import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  shouldAcceptPendingInvites,
  shouldSkipInviteAutoAccept,
} from "./invite-auto-accept.ts"

describe("shouldAcceptPendingInvites", () => {
  it("defaults to true so general navigation auto-accepts matching invites", () => {
    assert.equal(shouldAcceptPendingInvites(), true)
    assert.equal(shouldAcceptPendingInvites({}), true)
    assert.equal(shouldAcceptPendingInvites({ acceptPendingInvites: true }), true)
  })

  it("can be disabled for the invite Accept/Decline surface", () => {
    assert.equal(
      shouldAcceptPendingInvites({ acceptPendingInvites: false }),
      false
    )
  })
})

describe("shouldSkipInviteAutoAccept", () => {
  it("recognizes the middleware header stamp", () => {
    assert.equal(shouldSkipInviteAutoAccept("1"), true)
    assert.equal(shouldSkipInviteAutoAccept(null), false)
    assert.equal(shouldSkipInviteAutoAccept("0"), false)
    assert.equal(shouldSkipInviteAutoAccept(""), false)
  })
})
