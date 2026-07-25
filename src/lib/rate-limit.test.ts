import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { consumeRateLimit, resetRateLimitBucketsForTests } from "./rate-limit.ts"

describe("consumeRateLimit", () => {
  it("allows bursts up to the limit then blocks", async () => {
    resetRateLimitBucketsForTests()
    const key = `test:${Date.now()}`
    const options = { limit: 2, windowMs: 60_000 }

    assert.equal((await consumeRateLimit(key, options)).ok, true)
    assert.equal((await consumeRateLimit(key, options)).ok, true)

    const blocked = await consumeRateLimit(key, options)
    assert.equal(blocked.ok, false)
    if (!blocked.ok) {
      assert.ok(blocked.retryAfterMs >= 1000)
    }
  })
})
