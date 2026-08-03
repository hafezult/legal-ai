import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  consumeRateLimit,
  decideUpstashRateLimit,
  inMemoryRateLimitBucketCountForTests,
  parseUpstashPipelineRows,
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

describe("parseUpstashPipelineRows", () => {
  it("accepts a well-formed 5-command pipeline body", () => {
    const parsed = parseUpstashPipelineRows([
      { result: 1 },
      { result: 1 },
      { result: 2 },
      { result: 1 },
      { result: ["1000:abc", "1000"] },
    ])
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.count, 2)
      assert.equal(parsed.oldestScore, 1000)
    }
  })

  it("rejects short, errored, or non-numeric ZCARD responses", () => {
    assert.equal(parseUpstashPipelineRows([]).ok, false)
    assert.equal(
      parseUpstashPipelineRows([
        { result: 1 },
        { result: 1 },
        { error: "ERR" },
        { result: 1 },
        { result: [] },
      ]).ok,
      false
    )
    assert.equal(
      parseUpstashPipelineRows([
        { result: 1 },
        { result: 1 },
        { result: "not-a-number" },
        { result: 1 },
        { result: [] },
      ]).ok,
      false
    )
    assert.equal(
      parseUpstashPipelineRows([
        { result: 1 },
        { result: 1 },
        {},
        { result: 1 },
        { result: [] },
      ]).ok,
      false
    )
  })

  it("localOnly skips Upstash and still enforces the in-memory window", async () => {
    resetRateLimitBucketsForTests()
    const previousUrl = process.env.UPSTASH_REDIS_REST_URL
    const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io"
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"
    try {
      const options = { limit: 1, windowMs: 60_000, localOnly: true as const }
      assert.equal((await consumeRateLimit("local-only", options)).ok, true)
      assert.equal((await consumeRateLimit("local-only", options)).ok, false)
    } finally {
      if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL
      else process.env.UPSTASH_REDIS_REST_URL = previousUrl
      if (previousToken === undefined) {
        delete process.env.UPSTASH_REDIS_REST_TOKEN
      } else {
        process.env.UPSTASH_REDIS_REST_TOKEN = previousToken
      }
    }
  })
})
