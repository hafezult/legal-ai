import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { aggregateHealthStatus } from "./health-aggregate.ts"

function probe(status: "ok" | "degraded" | "missing") {
  return { status }
}

describe("aggregateHealthStatus", () => {
  it("stays ok when only optional probes are missing", () => {
    const status = aggregateHealthStatus({
      database: probe("ok"),
      clerk: probe("ok"),
      storage: probe("ok"),
      openai: probe("missing"),
      indexing: probe("missing"),
      upstash: probe("missing"),
    })
    assert.equal(status, "ok")
  })

  it("marks degraded when a critical probe is missing or degraded", () => {
    assert.equal(
      aggregateHealthStatus({
        database: probe("missing"),
        clerk: probe("ok"),
        storage: probe("ok"),
        openai: probe("ok"),
        indexing: probe("ok"),
        upstash: probe("ok"),
      }),
      "degraded"
    )
    assert.equal(
      aggregateHealthStatus({
        database: probe("ok"),
        clerk: probe("degraded"),
        storage: probe("ok"),
        openai: probe("ok"),
        indexing: probe("ok"),
        upstash: probe("ok"),
      }),
      "degraded"
    )
  })

  it("ignores optional openai/indexing/upstash degradation for overall status", () => {
    assert.equal(
      aggregateHealthStatus({
        database: probe("ok"),
        clerk: probe("ok"),
        storage: probe("ok"),
        openai: probe("degraded"),
        indexing: probe("degraded"),
        upstash: probe("degraded"),
      }),
      "ok"
    )
  })
})
