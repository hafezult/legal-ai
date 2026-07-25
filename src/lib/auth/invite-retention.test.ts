import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  INVITE_PURGE_COOLDOWN_MS,
  INVITE_TTL_MS,
  claimInvitePurgeSlot,
  inviteExpiryDate,
  resetInvitePurgeThrottleForTests,
} from "./invite-retention.ts"

describe("claimInvitePurgeSlot", () => {
  it("allows one claim per cooldown window", () => {
    resetInvitePurgeThrottleForTests()
    const t0 = INVITE_PURGE_COOLDOWN_MS
    assert.equal(claimInvitePurgeSlot(t0), true)
    assert.equal(claimInvitePurgeSlot(t0 + 1_000), false)
    assert.equal(claimInvitePurgeSlot(t0 + INVITE_PURGE_COOLDOWN_MS), true)
  })
})

describe("inviteExpiryDate", () => {
  it("renews acceptance TTL by 14 days from the given instant", () => {
    const from = new Date("2026-07-25T12:00:00.000Z")
    assert.equal(INVITE_TTL_MS, 1000 * 60 * 60 * 24 * 14)
    assert.equal(
      inviteExpiryDate(from).toISOString(),
      "2026-08-08T12:00:00.000Z"
    )
  })
})
