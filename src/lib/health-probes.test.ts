import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { probeClerk, probeSupabaseStorage, type FetchLike } from "./health-probes.ts"

describe("probeClerk", () => {
  it("reports missing when keys are absent", async () => {
    const probe = await probeClerk({})
    assert.equal(probe.status, "missing")
    assert.equal(probe.configured, false)
  })

  it("reports ok on HTTP 200", async () => {
    const fetchImpl: FetchLike = async () => ({ ok: true, status: 200 })
    const probe = await probeClerk({
      publishableKey: "pk_test",
      secretKey: "sk_test",
      fetchImpl,
    })
    assert.equal(probe.status, "ok")
    assert.equal(probe.configured, true)
  })

  it("reports degraded on auth failure", async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 401 })
    const probe = await probeClerk({
      publishableKey: "pk_test",
      secretKey: "sk_bad",
      fetchImpl,
    })
    assert.equal(probe.status, "degraded")
    assert.match(probe.detail, /rejected/i)
  })
})

describe("probeSupabaseStorage", () => {
  it("reports missing when credentials absent", async () => {
    const probe = await probeSupabaseStorage({})
    assert.equal(probe.status, "missing")
  })

  it("reports ok on HTTP 200", async () => {
    const fetchImpl: FetchLike = async () => ({ ok: true, status: 200 })
    const probe = await probeSupabaseStorage({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      fetchImpl,
    })
    assert.equal(probe.status, "ok")
  })

  it("reports degraded on network errors", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("offline")
    }
    const probe = await probeSupabaseStorage({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      fetchImpl,
    })
    assert.equal(probe.status, "degraded")
    assert.match(probe.detail, /network error/i)
  })
})
