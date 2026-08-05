import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { decideInviteUrlPublish } from "./invite-url-publish.ts"

describe("decideInviteUrlPublish", () => {
  it("publishes only when authority, liveness, and role all match", () => {
    assert.equal(
      decideInviteUrlPublish({
        actorCanAuthorize: true,
        inviteStillPending: true,
        inviteRoleMatches: true,
      }),
      true
    )
  })

  it("withholds when the actor lost invite authority", () => {
    assert.equal(
      decideInviteUrlPublish({
        actorCanAuthorize: false,
        inviteStillPending: true,
        inviteRoleMatches: true,
      }),
      false
    )
  })

  it("withholds when the invite was revoked or accepted", () => {
    assert.equal(
      decideInviteUrlPublish({
        actorCanAuthorize: true,
        inviteStillPending: false,
        inviteRoleMatches: true,
      }),
      false
    )
  })

  it("withholds when the live invite role no longer matches", () => {
    assert.equal(
      decideInviteUrlPublish({
        actorCanAuthorize: true,
        inviteStillPending: true,
        inviteRoleMatches: false,
      }),
      false
    )
  })
})
