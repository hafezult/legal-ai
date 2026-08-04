import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createTimedFetch, SUPABASE_FETCH_TIMEOUT_MS } from "./fetch.ts"

function abortError() {
  const err = new Error("The operation was aborted")
  err.name = "AbortError"
  return err
}

describe("createTimedFetch", () => {
  it("exports a bounded default timeout", () => {
    assert.ok(SUPABASE_FETCH_TIMEOUT_MS >= 30_000)
    assert.ok(SUPABASE_FETCH_TIMEOUT_MS <= 180_000)
  })

  it("aborts when the underlying fetch hangs past the timeout", async () => {
    const hung: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) return
        if (signal.aborted) {
          reject(abortError())
          return
        }
        signal.addEventListener("abort", () => reject(abortError()), { once: true })
      })

    const timed = createTimedFetch(40, hung)
    await assert.rejects(() => timed("https://example.supabase.co/storage/v1/object"), {
      name: "AbortError",
    })
  })

  it("forwards successful responses", async () => {
    const timed = createTimedFetch(1_000, async () =>
      new Response("ok", { status: 200 })
    )
    const response = await timed("https://example.supabase.co/storage/v1/bucket")
    assert.equal(response.status, 200)
    assert.equal(await response.text(), "ok")
  })

  it("honours an already-aborted outer signal", async () => {
    const controller = new AbortController()
    controller.abort()
    const timed = createTimedFetch(1_000, async (_input, init) => {
      assert.ok(init?.signal?.aborted)
      throw abortError()
    })
    await assert.rejects(
      () => timed("https://example.supabase.co", { signal: controller.signal }),
      { name: "AbortError" }
    )
  })
})
