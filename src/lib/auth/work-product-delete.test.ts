import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { roleHasPermission, type OrgRole } from "./roles.ts"

/**
 * Mirrors requireWorkProductDelete policy without Prisma:
 * creators with write may delete their own rows; otherwise delete is required.
 */
function canDeleteWorkProduct(args: {
  actorRole: OrgRole | null
  actorUserId: string
  createdByUserId: string | null | undefined
}): boolean {
  if (!args.actorRole) return false
  const isCreator = Boolean(
    args.createdByUserId && args.createdByUserId === args.actorUserId
  )
  if (isCreator) return roleHasPermission(args.actorRole, "write")
  return roleHasPermission(args.actorRole, "delete")
}

describe("work-product delete policy", () => {
  it("lets members delete their own research/drafts/conversations", () => {
    assert.equal(
      canDeleteWorkProduct({
        actorRole: "member",
        actorUserId: "u1",
        createdByUserId: "u1",
      }),
      true
    )
  })

  it("blocks members from deleting another member's work product", () => {
    assert.equal(
      canDeleteWorkProduct({
        actorRole: "member",
        actorUserId: "u1",
        createdByUserId: "u2",
      }),
      false
    )
  })

  it("allows admins to delete any work product", () => {
    assert.equal(
      canDeleteWorkProduct({
        actorRole: "admin",
        actorUserId: "admin",
        createdByUserId: "u2",
      }),
      true
    )
  })

  it("requires delete permission for legacy rows without a creator", () => {
    assert.equal(
      canDeleteWorkProduct({
        actorRole: "member",
        actorUserId: "u1",
        createdByUserId: null,
      }),
      false
    )
    assert.equal(
      canDeleteWorkProduct({
        actorRole: "owner",
        actorUserId: "u1",
        createdByUserId: null,
      }),
      true
    )
  })

  it("blocks viewers even for their own rows (no write)", () => {
    assert.equal(
      canDeleteWorkProduct({
        actorRole: "viewer",
        actorUserId: "u1",
        createdByUserId: "u1",
      }),
      false
    )
  })
})
