import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createReadyReportCache } from "./health-ready-cache.ts"

describe("createReadyReportCache", () => {
  it("returns cached value within TTL without re-fetching", async () => {
    let now = 1_000
    let calls = 0
    const cache = createReadyReportCache<{ n: number }>(5_000, {
      now: () => now,
    })
    const first = await cache.load(async () => {
      calls += 1
      return { n: 1 }
    })
    now = 2_000
    const second = await cache.load(async () => {
      calls += 1
      return { n: 2 }
    })

    assert.deepEqual(first, { n: 1 })
    assert.deepEqual(second, { n: 1 })
    assert.equal(calls, 1)
  })

  it("coalesces concurrent in-flight loads into one fetcher call", async () => {
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const cache = createReadyReportCache<{ n: number }>(5_000)

    const p1 = cache.load(async () => {
      calls += 1
      await gate
      return { n: 7 }
    })
    const p2 = cache.load(async () => {
      calls += 1
      return { n: 99 }
    })

    release()
    const [a, b] = await Promise.all([p1, p2])
    assert.deepEqual(a, { n: 7 })
    assert.deepEqual(b, { n: 7 })
    assert.equal(calls, 1)
  })

  it("re-fetches after TTL expiry", async () => {
    let now = 0
    let calls = 0
    const cache = createReadyReportCache<{ n: number }>(100, {
      now: () => now,
    })
    await cache.load(async () => {
      calls += 1
      return { n: 1 }
    })
    now = 150
    const next = await cache.load(async () => {
      calls += 1
      return { n: 2 }
    })

    assert.deepEqual(next, { n: 2 })
    assert.equal(calls, 2)
  })

  it("clears in-flight on failure so the next caller retries", async () => {
    let calls = 0
    const cache = createReadyReportCache<{ n: number }>(5_000)
    await assert.rejects(
      () =>
        cache.load(async () => {
          calls += 1
          throw new Error("probe failed")
        }),
      /probe failed/
    )
    const recovered = await cache.load(async () => {
      calls += 1
      return { n: 3 }
    })
    assert.deepEqual(recovered, { n: 3 })
    assert.equal(calls, 2)
  })
})
