import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  AUTH_REQUIRED_ERROR,
  DATA_LAYER_UNREACHABLE_ERROR,
  IDENTITY_UNAVAILABLE_ERROR,
  SESSION_NOT_FOUND_ERROR,
  isAuthRequiredError,
  requireActor,
  requireClerkId,
  resolvePlatformClerkId,
} from "./require-actor.ts"

describe("isAuthRequiredError", () => {
  it("recognizes only the signed-out message", () => {
    assert.equal(isAuthRequiredError(AUTH_REQUIRED_ERROR), true)
    assert.equal(isAuthRequiredError(IDENTITY_UNAVAILABLE_ERROR), false)
    assert.equal(isAuthRequiredError(SESSION_NOT_FOUND_ERROR), false)
  })
})

describe("requireClerkId", () => {
  it("returns the clerk id when auth resolves a session", async () => {
    const result = await requireClerkId({
      auth: async () => ({ userId: "clerk_abc" }),
    })
    assert.deepEqual(result, { ok: true, clerkId: "clerk_abc" })
  })

  it("returns auth-required when there is no session", async () => {
    const result = await requireClerkId({
      auth: async () => ({ userId: null }),
    })
    assert.deepEqual(result, { ok: false, error: AUTH_REQUIRED_ERROR })
    assert.equal(!result.ok && isAuthRequiredError(result.error), true)
  })

  it("fails closed when auth throws", async () => {
    const result = await requireClerkId({
      auth: async () => {
        throw new Error("clerk down")
      },
    })
    assert.deepEqual(result, { ok: false, error: IDENTITY_UNAVAILABLE_ERROR })
  })
})

describe("requireActor", () => {
  it("returns the persisted user for a valid clerk session", async () => {
    const result = await requireActor({
      auth: async () => ({ userId: "clerk_abc" }),
      findUserByClerkId: async (clerkId) => {
        assert.equal(clerkId, "clerk_abc")
        return {
          id: "user_1",
          email: "a@example.com",
          name: "Ada",
        }
      },
    })
    assert.deepEqual(result, {
      ok: true,
      clerkId: "clerk_abc",
      user: { id: "user_1", email: "a@example.com", name: "Ada" },
    })
  })

  it("propagates identity failures before touching the data layer", async () => {
    let lookedUp = false
    const result = await requireActor({
      auth: async () => ({ userId: null }),
      findUserByClerkId: async () => {
        lookedUp = true
        return null
      },
    })
    assert.deepEqual(result, { ok: false, error: AUTH_REQUIRED_ERROR })
    assert.equal(lookedUp, false)
  })

  it("returns session-not-found when the app user row is missing", async () => {
    const result = await requireActor({
      auth: async () => ({ userId: "clerk_abc" }),
      findUserByClerkId: async () => null,
    })
    assert.deepEqual(result, { ok: false, error: SESSION_NOT_FOUND_ERROR })
  })

  it("fails closed when the data layer throws", async () => {
    const result = await requireActor({
      auth: async () => ({ userId: "clerk_abc" }),
      findUserByClerkId: async () => {
        throw new Error("db down")
      },
    })
    assert.deepEqual(result, {
      ok: false,
      error: DATA_LAYER_UNREACHABLE_ERROR,
    })
  })
})

describe("resolvePlatformClerkId", () => {
  it("maps signed-out to unauthenticated", async () => {
    const result = await resolvePlatformClerkId({
      auth: async () => ({ userId: null }),
    })
    assert.deepEqual(result, { status: "unauthenticated" })
  })

  it("maps identity outages to unavailable", async () => {
    const result = await resolvePlatformClerkId({
      auth: async () => {
        throw new Error("clerk down")
      },
    })
    assert.deepEqual(result, {
      status: "unavailable",
      error: IDENTITY_UNAVAILABLE_ERROR,
    })
  })

  it("returns the clerk id when ready", async () => {
    const result = await resolvePlatformClerkId({
      auth: async () => ({ userId: "clerk_abc" }),
    })
    assert.deepEqual(result, { status: "ok", clerkId: "clerk_abc" })
  })
})
