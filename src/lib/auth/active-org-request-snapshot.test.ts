import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createVerifiedOrganizationsSnapshotLoader,
  getOrLoadVerifiedOrganizationsSnapshot,
} from "./active-org-request-snapshot.ts"

describe("getOrLoadVerifiedOrganizationsSnapshot", () => {
  it("dedupes concurrent loads for the same userId in one store", async () => {
    let calls = 0
    const store = new Map<string, Promise<{ id: string; calls: number }>>()

    const load = () =>
      getOrLoadVerifiedOrganizationsSnapshot(store, "user_1", async () => {
        calls += 1
        return { id: "org_a", calls }
      })

    const [first, second] = await Promise.all([load(), load()])

    assert.equal(calls, 1)
    assert.equal(first, second)
    assert.equal(first.id, "org_a")
  })

  it("does not mix snapshots across different user ids", async () => {
    const store = new Map<string, Promise<{ userId: string }>>()

    const [a, b] = await Promise.all([
      getOrLoadVerifiedOrganizationsSnapshot(store, "user_a", async () => ({
        userId: "user_a",
      })),
      getOrLoadVerifiedOrganizationsSnapshot(store, "user_b", async () => ({
        userId: "user_b",
      })),
    ])

    assert.equal(a.userId, "user_a")
    assert.equal(b.userId, "user_b")
  })

  it("allows retry after a rejected load is cleared from the store", async () => {
    const store = new Map<string, Promise<string>>()
    let attempts = 0

    await assert.rejects(
      getOrLoadVerifiedOrganizationsSnapshot(store, "user_1", async () => {
        attempts += 1
        throw new Error("boom")
      }),
      /boom/
    )

    // Rejection clearing is async via pending.catch — wait a tick.
    await Promise.resolve()
    await Promise.resolve()

    const value = await getOrLoadVerifiedOrganizationsSnapshot(
      store,
      "user_1",
      async () => {
        attempts += 1
        return "ok"
      }
    )

    assert.equal(value, "ok")
    assert.equal(attempts, 2)
  })
})

describe("createVerifiedOrganizationsSnapshotLoader", () => {
  it("reuses the store returned by createStore for dedupe", async () => {
    let calls = 0
    const shared = new Map()
    const load = createVerifiedOrganizationsSnapshotLoader(
      () => shared,
      async (userId) => {
        calls += 1
        return {
          organizations: [],
          activeOrganizationId: userId,
        }
      }
    )

    const [a, b] = await Promise.all([load("user_1"), load("user_1")])
    assert.equal(calls, 1)
    assert.equal(a, b)
    assert.equal(a.activeOrganizationId, "user_1")
  })
})
