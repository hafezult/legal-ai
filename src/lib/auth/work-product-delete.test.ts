import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { canDeleteWorkProduct } from "./work-product-delete.ts"

describe("canDeleteWorkProduct", () => {
  it("lets members delete their own research/drafts/conversations", () => {
    assert.equal(
      canDeleteWorkProduct({
        actorUserId: "u1",
        createdByUserId: "u1",
        matterCanWrite: true,
        matterCanDelete: false,
      }),
      true
    )
  })

  it("blocks members from deleting another member's work product", () => {
    assert.equal(
      canDeleteWorkProduct({
        actorUserId: "u1",
        createdByUserId: "u2",
        matterCanWrite: true,
        matterCanDelete: false,
      }),
      false
    )
  })

  it("allows admins to delete any work product", () => {
    assert.equal(
      canDeleteWorkProduct({
        actorUserId: "admin",
        createdByUserId: "u2",
        matterCanWrite: true,
        matterCanDelete: true,
      }),
      true
    )
  })

  it("requires delete permission for legacy rows without a creator", () => {
    assert.equal(
      canDeleteWorkProduct({
        actorUserId: "u1",
        createdByUserId: null,
        matterCanWrite: true,
        matterCanDelete: false,
      }),
      false
    )
    assert.equal(
      canDeleteWorkProduct({
        actorUserId: "u1",
        createdByUserId: null,
        matterCanWrite: true,
        matterCanDelete: true,
      }),
      true
    )
  })

  it("blocks viewers even for their own rows (no write)", () => {
    assert.equal(
      canDeleteWorkProduct({
        actorUserId: "u1",
        createdByUserId: "u1",
        matterCanWrite: false,
        matterCanDelete: false,
      }),
      false
    )
  })
})
