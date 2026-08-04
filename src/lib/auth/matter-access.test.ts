import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  matterAccessWhere,
  matterAccessWhereForActiveOrg,
} from "./matter-access.ts"

describe("matterAccessWhere", () => {
  it("scopes legacy personal matters to the creator and org matters to membership", () => {
    assert.deepEqual(matterAccessWhere("user-1"), {
      OR: [
        { userId: "user-1", organizationId: null },
        { organization: { members: { some: { userId: "user-1" } } } },
      ],
    })
  })

  it("treats detached org matters as personal for whichever userId remains", () => {
    // After Organization delete, Matter.organizationId is SetNull. If a former
    // creator's userId were left intact, matterAccessWhere would restore their
    // access — deleteOwnedOrganization must reassign every org matter to the
    // deleting owner before detach so this predicate cannot revive removed
    // creators.
    const where = matterAccessWhere("former-creator")
    assert.deepEqual(where.OR[0], {
      userId: "former-creator",
      organizationId: null,
    })
    const whereOwner = matterAccessWhere("deleting-owner")
    assert.notDeepEqual(whereOwner.OR[0], where.OR[0])
  })
})

describe("matterAccessWhereForActiveOrg", () => {
  it("falls back to full access where when no active org is selected", () => {
    assert.deepEqual(
      matterAccessWhereForActiveOrg("user-1", null),
      matterAccessWhere("user-1")
    )
    assert.deepEqual(
      matterAccessWhereForActiveOrg("user-1", undefined),
      matterAccessWhere("user-1")
    )
  })

  it("intersects membership access with the active org plus legacy personal matters", () => {
    assert.deepEqual(matterAccessWhereForActiveOrg("user-1", "org-a"), {
      AND: [
        matterAccessWhere("user-1"),
        {
          OR: [
            { organizationId: "org-a" },
            { userId: "user-1", organizationId: null },
          ],
        },
      ],
    })
  })
})
