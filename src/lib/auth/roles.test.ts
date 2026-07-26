import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isOrgRole,
  roleAtLeast,
  roleHasPermission,
  roleStrictlyAbove,
} from "./roles.ts"

describe("organization role helpers", () => {
  it("accepts only known org roles", () => {
    assert.equal(isOrgRole("viewer"), true)
    assert.equal(isOrgRole("member"), true)
    assert.equal(isOrgRole("admin"), true)
    assert.equal(isOrgRole("owner"), true)
    assert.equal(isOrgRole("superadmin"), false)
    assert.equal(isOrgRole(""), false)
  })

  it("orders privilege correctly", () => {
    assert.equal(roleAtLeast("admin", "member"), true)
    assert.equal(roleAtLeast("viewer", "member"), false)
    assert.equal(roleStrictlyAbove("owner", "admin"), true)
    assert.equal(roleStrictlyAbove("admin", "admin"), false)
  })

  it("gates permissions by role", () => {
    assert.equal(roleHasPermission("viewer", "read"), true)
    assert.equal(roleHasPermission("viewer", "write"), false)
    assert.equal(roleHasPermission("member", "write"), true)
    assert.equal(roleHasPermission("member", "delete"), false)
    assert.equal(roleHasPermission("admin", "manage_members"), true)
    assert.equal(roleHasPermission("owner", "delete"), true)
  })
})
