import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  lockedMatterRoleAllows,
  resolveMatterRoleFromLockedMembership,
} from "./matter-permission-lock.ts"

describe("resolveMatterRoleFromLockedMembership", () => {
  it("uses locked membership for organization matters", () => {
    assert.equal(
      resolveMatterRoleFromLockedMembership({
        organizationId: "org_1",
        isCreator: true,
        membershipRole: "member",
      }),
      "member"
    )
  })

  it("returns null when org membership row is missing under lock", () => {
    assert.equal(
      resolveMatterRoleFromLockedMembership({
        organizationId: "org_1",
        isCreator: true,
        membershipRole: null,
      }),
      null
    )
  })

  it("ignores creator fallback for org matters even if membership is viewer", () => {
    assert.equal(
      resolveMatterRoleFromLockedMembership({
        organizationId: "org_1",
        isCreator: true,
        membershipRole: "viewer",
      }),
      "viewer"
    )
  })

  it("grants creator owner on legacy personal matters", () => {
    assert.equal(
      resolveMatterRoleFromLockedMembership({
        organizationId: null,
        isCreator: true,
        membershipRole: null,
      }),
      "owner"
    )
  })

  it("rejects unknown membership role strings", () => {
    assert.equal(
      resolveMatterRoleFromLockedMembership({
        organizationId: "org_1",
        isCreator: false,
        membershipRole: "superuser",
      }),
      null
    )
  })
})

describe("lockedMatterRoleAllows", () => {
  it("allows member write and denies viewer write", () => {
    assert.equal(lockedMatterRoleAllows("member", "write"), true)
    assert.equal(lockedMatterRoleAllows("viewer", "write"), false)
    assert.equal(lockedMatterRoleAllows(null, "write"), false)
  })

  it("requires delete role for destructive non-creator paths", () => {
    assert.equal(lockedMatterRoleAllows("member", "delete"), false)
    assert.equal(lockedMatterRoleAllows("admin", "delete"), true)
  })
})
