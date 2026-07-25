import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  AUDIT_PURGE_BATCH_SIZE,
  AUDIT_PURGE_COOLDOWN_MS,
  DEFAULT_AUDIT_RETENTION_DAYS,
  auditRetentionCutoff,
  claimAuditPurgeSlot,
  resetAuditPurgeThrottleForTests,
} from "./audit-retention.ts"

describe("audit retention defaults", () => {
  it("keeps a year of trail by default with a bounded purge batch", () => {
    assert.equal(DEFAULT_AUDIT_RETENTION_DAYS, 365)
    assert.equal(AUDIT_PURGE_BATCH_SIZE, 2_000)
    assert.equal(AUDIT_PURGE_COOLDOWN_MS, 60 * 60 * 1000)
  })

  it("computes the retention cutoff from now", () => {
    const now = new Date("2026-07-25T12:00:00.000Z")
    const cutoff = auditRetentionCutoff(now, 10)
    assert.equal(cutoff.toISOString(), "2026-07-15T12:00:00.000Z")
  })
})

describe("claimAuditPurgeSlot", () => {
  it("throttles opportunistic purge attempts within the cooldown window", () => {
    resetAuditPurgeThrottleForTests()
    const t0 = AUDIT_PURGE_COOLDOWN_MS
    assert.equal(claimAuditPurgeSlot(t0), true)
    assert.equal(claimAuditPurgeSlot(t0 + 1_000), false)
    assert.equal(claimAuditPurgeSlot(t0 + AUDIT_PURGE_COOLDOWN_MS), true)
  })
})
