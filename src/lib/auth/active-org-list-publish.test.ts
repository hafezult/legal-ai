import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { decideActiveOrganizationListPublish } from "./active-org-list-publish.ts"

describe("decideActiveOrganizationListPublish", () => {
  it("publishes when membership holds and active pointer matches", () => {
    assert.equal(
      decideActiveOrganizationListPublish({
        gatheredOrganizationId: "org_a",
        lockedActiveOrganizationId: "org_a",
        membershipOk: true,
      }),
      true
    )
  })

  it("withholds when the actor switched active org concurrently", () => {
    assert.equal(
      decideActiveOrganizationListPublish({
        gatheredOrganizationId: "org_a",
        lockedActiveOrganizationId: "org_b",
        membershipOk: true,
      }),
      false
    )
  })

  it("withholds when membership failed closed", () => {
    assert.equal(
      decideActiveOrganizationListPublish({
        gatheredOrganizationId: "org_a",
        lockedActiveOrganizationId: "org_a",
        membershipOk: false,
      }),
      false
    )
  })

  it("withholds when locked active pointer is null after a gather", () => {
    assert.equal(
      decideActiveOrganizationListPublish({
        gatheredOrganizationId: "org_a",
        lockedActiveOrganizationId: null,
        membershipOk: true,
      }),
      false
    )
  })

  it("allows personal/empty gathers without an active pointer check", () => {
    assert.equal(
      decideActiveOrganizationListPublish({
        gatheredOrganizationId: null,
        lockedActiveOrganizationId: null,
        membershipOk: true,
      }),
      true
    )
  })
})
