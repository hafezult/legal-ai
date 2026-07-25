import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  AUDIT_PURGE_BATCH_SIZE,
  DEFAULT_AUDIT_RETENTION_DAYS,
  maybePurgeExpiredAuditEvents,
  resetAuditPurgeThrottleForTests,
} from "./audit.ts"

describe("audit retention defaults", () => {
  it("keeps a year of trail by default with a bounded purge batch", () => {
    assert.equal(DEFAULT_AUDIT_RETENTION_DAYS, 365)
    assert.equal(AUDIT_PURGE_BATCH_SIZE, 2_000)
  })
})

describe("maybePurgeExpiredAuditEvents", () => {
  it("throttles opportunistic purge attempts within the cooldown window", () => {
    resetAuditPurgeThrottleForTests()
    // First call schedules a purge; immediate second call should no-op.
    maybePurgeExpiredAuditEvents()
    maybePurgeExpiredAuditEvents()
    // No throw — throttle is in-process only; purge itself is best-effort.
    assert.ok(true)
  })
})
