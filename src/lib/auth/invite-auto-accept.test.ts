import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  shouldAcceptPendingInvites,
  shouldSkipInviteAutoAccept,
} from "./invite-auto-accept.ts"

describe("shouldAcceptPendingInvites", () => {
  it("defaults to false so navigation cannot silently join workspaces", () => {
    assert.equal(shouldAcceptPendingInvites(), false)
    assert.equal(shouldAcceptPendingInvites({}), false)
    assert.equal(
      shouldAcceptPendingInvites({ acceptPendingInvites: false }),
      false
    )
  })

  it("requires an explicit opt-in when auto-accept is re-enabled", () => {
    assert.equal(
      shouldAcceptPendingInvites({ acceptPendingInvites: true }),
      true
    )
  })

  it("honors the invite-route skip header even when opt-in is true", () => {
    assert.equal(
      shouldAcceptPendingInvites({
        acceptPendingInvites: true,
        skipHeader: "1",
      }),
      false
    )
    assert.equal(
      shouldAcceptPendingInvites({
        acceptPendingInvites: true,
        skipHeader: null,
      }),
      true
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
