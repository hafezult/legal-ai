import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  INVITE_PURGE_COOLDOWN_MS,
  claimInvitePurgeSlot,
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
