import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { selectLiveRegistryRows } from "./registry-list-publish.ts"

describe("selectLiveRegistryRows", () => {
  it("preserves probed order and omits tombstones", () => {
    const lockedById = new Map([
      ["b", { id: "b", title: "Beta" }],
      ["a", { id: "a", title: "Alpha" }],
    ])
    assert.deepEqual(
      selectLiveRegistryRows({
        probedIds: ["a", "gone", "b"],
        lockedById,
      }),
      [
        { id: "a", title: "Alpha" },
        { id: "b", title: "Beta" },
      ]
    )
  })

  it("returns an empty list when nothing is live", () => {
    assert.deepEqual(
      selectLiveRegistryRows({
        probedIds: ["a", "b"],
        lockedById: new Map(),
      }),
      []
    )
  })

  it("returns an empty list for an empty probe", () => {
    assert.deepEqual(
      selectLiveRegistryRows({
        probedIds: [],
        lockedById: new Map([["a", { id: "a" }]]),
      }),
      []
    )
  })
})
