import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { getLivenessReport } from "./health.ts"

describe("getLivenessReport", () => {
  it("returns a cheap ok signal without probing dependencies", () => {
    const report = getLivenessReport()
    assert.equal(report.status, "ok")
    assert.equal(typeof report.checkedAt, "string")
    assert.ok(Number.isFinite(Date.parse(report.checkedAt)))
  })
})
