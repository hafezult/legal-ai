import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { decideMatterCreateActiveOrg } from "./matter-create-active-org.ts"

describe("decideMatterCreateActiveOrg", () => {
  it("allows create when write membership holds and active pointer matches", () => {
    assert.equal(
      decideMatterCreateActiveOrg({
        targetOrganizationId: "org_1",
        lockedActiveOrganizationId: "org_1",
        membershipWriteOk: true,
      }),
      true
    )
  })

  it("withholds when active pointer switched away from the create target", () => {
    assert.equal(
      decideMatterCreateActiveOrg({
        targetOrganizationId: "org_1",
        lockedActiveOrganizationId: "org_2",
        membershipWriteOk: true,
      }),
      false
    )
  })

  it("withholds when locked active pointer is null", () => {
    assert.equal(
      decideMatterCreateActiveOrg({
        targetOrganizationId: "org_1",
        lockedActiveOrganizationId: null,
        membershipWriteOk: true,
      }),
      false
    )
  })

  it("withholds when membership write permission is gone", () => {
    assert.equal(
      decideMatterCreateActiveOrg({
        targetOrganizationId: "org_1",
        lockedActiveOrganizationId: "org_1",
        membershipWriteOk: false,
      }),
      false
    )
  })

  it("withholds empty target organization ids", () => {
    assert.equal(
      decideMatterCreateActiveOrg({
        targetOrganizationId: "",
        lockedActiveOrganizationId: "",
        membershipWriteOk: true,
      }),
      false
    )
  })
})
