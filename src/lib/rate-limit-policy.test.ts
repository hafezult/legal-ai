import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  destructiveMutationKey,
  inviteDecisionKey,
  inviteIssuanceKey,
  orgAdminMutationKey,
} from "./rate-limit-policy.ts"

describe("rate-limit-policy keys", () => {
  it("uses shared buckets for destructive, org-admin, and invite mutations", () => {
    assert.equal(destructiveMutationKey("user_1"), "destructive:user_1")
    assert.equal(orgAdminMutationKey("user_1"), "org-admin:user_1")
    assert.equal(inviteDecisionKey("user_1"), "invite-decision:user_1")
    assert.equal(inviteIssuanceKey("user_1"), "invite-issuance:user_1")
  })

  it("keeps invite issuance per-user so orgId cannot fan out buckets", () => {
    assert.equal(inviteIssuanceKey("user_1"), inviteIssuanceKey("user_1"))
    assert.notEqual(inviteIssuanceKey("user_1"), inviteIssuanceKey("user_2"))
    assert.ok(!inviteIssuanceKey("user_1").includes("org_"))
  })
})
