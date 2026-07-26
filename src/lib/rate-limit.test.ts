import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  consumeRateLimit,
  decideUpstashRateLimit,
  inMemoryRateLimitBucketCountForTests,
  resetRateLimitBucketsForTests,
} from "./rate-limit.ts"

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

  it("evicts stale/overflow in-memory buckets under key flood", async () => {
    resetRateLimitBucketsForTests()
    const options = { limit: 5, windowMs: 60_000 }
    for (let i = 0; i < 5_050; i += 1) {
      assert.equal((await consumeRateLimit(`flood:${i}`, options)).ok, true)
    }
    assert.ok(inMemoryRateLimitBucketCountForTests() <= 5_000)
  })
})

describe("decideUpstashRateLimit", () => {
  it("allows counts within the limit", () => {
    const decision = decideUpstashRateLimit({
      count: 2,
      limit: 2,
      windowMs: 60_000,
      now: 10_000,
      member: "10:abc",
      oldestScore: 1_000,
    })
    assert.equal(decision.ok, true)
  })

  it("rejects over-limit attempts and names the member to remove", () => {
    const decision = decideUpstashRateLimit({
      count: 3,
      limit: 2,
      windowMs: 60_000,
      now: 10_000,
      member: "10000:abc",
      oldestScore: 1_000,
    })
    assert.equal(decision.ok, false)
    if (!decision.ok) {
      assert.equal(decision.rejectMember, "10000:abc")
      assert.equal(decision.retryAfterMs, 51_000)
    }
  })
})
