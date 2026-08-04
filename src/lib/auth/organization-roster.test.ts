import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  selectActiveOrganizationId,
  shouldPersistActiveOrganizationRepair,
  sortOrganizationSummaries,
  type OrganizationSummary,
} from "./organization-roster.ts"

function org(
  partial: Pick<OrganizationSummary, "id" | "name" | "role">
): OrganizationSummary {
  return { slug: partial.id, ...partial }
}

describe("sortOrganizationSummaries", () => {
  it("orders owners first, then name", () => {
    const sorted = sortOrganizationSummaries([
      org({ id: "b", name: "Beta", role: "member" }),
      org({ id: "a", name: "Alpha", role: "owner" }),
      org({ id: "c", name: "Charlie", role: "owner" }),
      org({ id: "d", name: "Delta", role: "viewer" }),
    ])
    assert.deepEqual(
      sorted.map((row) => row.id),
      ["a", "c", "b", "d"]
    )
  })
})

describe("selectActiveOrganizationId", () => {
  const roster = [
    org({ id: "owned", name: "Owned", role: "owner" }),
    org({ id: "shared", name: "Shared", role: "member" }),
  ]

  it("returns null for an empty roster", () => {
    assert.equal(selectActiveOrganizationId([], "owned"), null)
  })

  it("keeps the preferred active org when still verified", () => {
    assert.equal(selectActiveOrganizationId(roster, "shared"), "shared")
  })

  it("falls back to an owned org when preferred is missing", () => {
    assert.equal(selectActiveOrganizationId(roster, "gone"), "owned")
  })

  it("falls back to the first row when no owned org remains", () => {
    const membersOnly = [
      org({ id: "m1", name: "M1", role: "member" }),
      org({ id: "m2", name: "M2", role: "viewer" }),
    ]
    assert.equal(selectActiveOrganizationId(membersOnly, "gone"), "m1")
  })
})

describe("shouldPersistActiveOrganizationRepair", () => {
  it("persists when soft selection differs from the locked pointer", () => {
    assert.equal(shouldPersistActiveOrganizationRepair(null, "owned"), true)
    assert.equal(shouldPersistActiveOrganizationRepair("gone", "owned"), true)
  })

  it("skips when selection already matches the locked pointer", () => {
    assert.equal(shouldPersistActiveOrganizationRepair("owned", "owned"), false)
  })

  it("skips when there is no selected workspace to persist", () => {
    assert.equal(shouldPersistActiveOrganizationRepair("owned", null), false)
    assert.equal(shouldPersistActiveOrganizationRepair(null, null), false)
  })
})
