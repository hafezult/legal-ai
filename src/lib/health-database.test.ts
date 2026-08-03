import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { probeDatabase } from "./health-database.ts"

describe("probeDatabase", () => {
  it("reports missing when DATABASE_URL is unset", async () => {
    const probe = await probeDatabase({ databaseUrl: null })
    assert.equal(probe.status, "missing")
    assert.equal(probe.configured, false)
  })

  it("reports ok when the query resolves", async () => {
    const probe = await probeDatabase({
      databaseUrl: "postgresql://example",
      query: async () => 1,
    })
    assert.equal(probe.status, "ok")
    assert.match(probe.detail, /reachable/i)
  })

  it("reports degraded when the query fails", async () => {
    const probe = await probeDatabase({
      databaseUrl: "postgresql://example",
      query: async () => {
        throw new Error("connection refused")
      },
    })
    assert.equal(probe.status, "degraded")
    assert.match(probe.detail, /failed/i)
  })

  it("reports degraded when the query exceeds the timeout", async () => {
    const probe = await probeDatabase({
      databaseUrl: "postgresql://example",
      timeoutMs: 20,
      query: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return 1
      },
    })
    assert.equal(probe.status, "degraded")
    assert.match(probe.detail, /timed out/i)
  })
})
