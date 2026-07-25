import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isInviteTokenShape } from "./invite-token.ts"

describe("isInviteTokenShape", () => {
  it("accepts 48-character hex tokens", () => {
    assert.equal(
      isInviteTokenShape("0123456789abcdef0123456789abcdef0123456789abcdef"),
      true
    )
    assert.equal(
      isInviteTokenShape("ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789"),
      true
    )
  })

  it("rejects malformed tokens", () => {
    assert.equal(isInviteTokenShape(""), false)
    assert.equal(isInviteTokenShape("short"), false)
    assert.equal(
      isInviteTokenShape("0123456789abcdef0123456789abcdef0123456789abcdzz"),
      false
    )
    assert.equal(
      isInviteTokenShape("0123456789abcdef0123456789abcdef0123456789abcdef0"),
      false
    )
  })
})
