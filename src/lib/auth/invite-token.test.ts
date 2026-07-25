import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  generateInviteToken,
  hashInviteToken,
  isInviteTokenShape,
} from "./invite-token.ts"

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

describe("invite token hashing", () => {
  it("generates shape-valid tokens", () => {
    const token = generateInviteToken()
    assert.equal(isInviteTokenShape(token), true)
  })

  it("hashes deterministically and never equals the raw token", () => {
    const token = "0123456789abcdef0123456789abcdef0123456789abcdef"
    const hash = hashInviteToken(token)
    assert.equal(hash.length, 64)
    assert.equal(hash, hashInviteToken(token))
    assert.notEqual(hash, token)
    assert.match(hash, /^[a-f0-9]{64}$/)
  })
})
