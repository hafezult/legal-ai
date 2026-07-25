import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  canDeleteListedMatter,
  canWriteListedMatter,
} from "./matter-write.ts"

describe("canWriteListedMatter", () => {
  it("grants creator write on legacy personal matters", () => {
    assert.equal(
      canWriteListedMatter(
        { userId: "u1", organizationId: null },
        "u1",
        false
      ),
      true
    )
    assert.equal(
      canWriteListedMatter(
        { userId: "u1", organizationId: null },
        "u2",
        true
      ),
      false
    )
    assert.equal(
      canWriteListedMatter(
        { userId: null, organizationId: null },
        "u1",
        true
      ),
      false
    )
  })

  it("defers to active org write for organization matters", () => {
    assert.equal(
      canWriteListedMatter(
        { userId: "u1", organizationId: "org1" },
        "u1",
        false
      ),
      false
    )
    assert.equal(
      canWriteListedMatter(
        { userId: "u1", organizationId: "org1" },
        "u2",
        true
      ),
      true
    )
  })
})

describe("canDeleteListedMatter", () => {
  it("grants creator delete on legacy personal matters", () => {
    assert.equal(
      canDeleteListedMatter(
        { userId: "u1", organizationId: null },
        "u1",
        false
      ),
      true
    )
    assert.equal(
      canDeleteListedMatter(
        { userId: "u1", organizationId: null },
        "u2",
        true
      ),
      false
    )
  })

  it("defers to active org delete for organization matters", () => {
    assert.equal(
      canDeleteListedMatter(
        { userId: "u1", organizationId: "org1" },
        "u1",
        false
      ),
      false
    )
    assert.equal(
      canDeleteListedMatter(
        { userId: "u1", organizationId: "org1" },
        "u2",
        true
      ),
      true
    )
  })
})
