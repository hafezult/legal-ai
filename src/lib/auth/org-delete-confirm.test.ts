import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  normalizeOrgConfirmationName,
  orgDeleteConfirmationMatches,
} from "./org-delete-confirm.ts"

describe("org delete confirmation", () => {
  it("normalizes internal whitespace", () => {
    assert.equal(normalizeOrgConfirmationName("  Acme   Legal  "), "Acme Legal")
  })

  it("matches when confirmation equals the locked name (case-insensitive)", () => {
    assert.equal(
      orgDeleteConfirmationMatches("acme legal", "Acme Legal"),
      true
    )
    assert.equal(
      orgDeleteConfirmationMatches("  Acme   Legal ", "Acme Legal"),
      true
    )
  })

  it("rejects empty or mismatched confirmation against the locked name", () => {
    assert.equal(orgDeleteConfirmationMatches("", "Acme Legal"), false)
    assert.equal(orgDeleteConfirmationMatches("   ", "Acme Legal"), false)
    assert.equal(
      orgDeleteConfirmationMatches("Acme Legal", "Acme Legal Renamed"),
      false
    )
    assert.equal(
      orgDeleteConfirmationMatches("Old Name", "Acme Legal Renamed"),
      false
    )
  })
})
