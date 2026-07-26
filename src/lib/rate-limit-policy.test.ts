import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  destructiveMutationKey,
  inviteDecisionKey,
  orgAdminMutationKey,
} from "./rate-limit-policy.ts"

describe("rate-limit-policy keys", () => {
  it("uses shared buckets for destructive and org-admin mutations", () => {
    assert.equal(destructiveMutationKey("user_1"), "destructive:user_1")
    assert.equal(orgAdminMutationKey("user_1"), "org-admin:user_1")
    assert.equal(inviteDecisionKey("user_1"), "invite-decision:user_1")
  })
})
