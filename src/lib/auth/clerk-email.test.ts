import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  selectVerifiedClerkEmail,
  selectVerifiedClerkEmails,
  unverifiedClerkEmailPlaceholder,
  verifiedClerkEmailMatches,
} from "./clerk-email.ts"

describe("selectVerifiedClerkEmail", () => {
  it("returns the verified primary email lowercased", () => {
    assert.equal(
      selectVerifiedClerkEmail(
        [
          {
            id: "pri",
            emailAddress: "Counsel@Example.com",
            verificationStatus: "verified",
          },
          {
            id: "alt",
            emailAddress: "other@example.com",
            verificationStatus: "verified",
          },
        ],
        "pri"
      ),
      "counsel@example.com"
    )
  })

  it("ignores unverified primary and falls back to another verified address", () => {
    assert.equal(
      selectVerifiedClerkEmail(
        [
          {
            id: "pri",
            emailAddress: "unverified@example.com",
            verificationStatus: "unverified",
          },
          {
            id: "alt",
            emailAddress: "Verified@Example.com",
            verificationStatus: "verified",
          },
        ],
        "pri"
      ),
      "verified@example.com"
    )
  })

  it("returns null when no verified emails exist", () => {
    assert.equal(
      selectVerifiedClerkEmail(
        [
          {
            id: "pri",
            emailAddress: "pending@example.com",
            verificationStatus: "unverified",
          },
          {
            id: "empty",
            emailAddress: "   ",
            verificationStatus: "verified",
          },
        ],
        "pri"
      ),
      null
    )
  })

  it("uses the first verified address when primary id is missing", () => {
    assert.equal(
      selectVerifiedClerkEmail([
        {
          id: "a",
          emailAddress: "first@example.com",
          verificationStatus: "verified",
        },
        {
          id: "b",
          emailAddress: "second@example.com",
          verificationStatus: "verified",
        },
      ]),
      "first@example.com"
    )
  })
})

describe("selectVerifiedClerkEmails", () => {
  it("returns all distinct verified emails lowercased", () => {
    assert.deepEqual(
      selectVerifiedClerkEmails([
        {
          id: "pri",
          emailAddress: "Counsel@Example.com",
          verificationStatus: "verified",
        },
        {
          id: "alt",
          emailAddress: "Other@Example.com",
          verificationStatus: "verified",
        },
        {
          id: "dup",
          emailAddress: "counsel@example.com",
          verificationStatus: "verified",
        },
        {
          id: "pending",
          emailAddress: "pending@example.com",
          verificationStatus: "unverified",
        },
      ]),
      ["counsel@example.com", "other@example.com"]
    )
  })

  it("returns an empty list when none are verified", () => {
    assert.deepEqual(
      selectVerifiedClerkEmails([
        {
          id: "pri",
          emailAddress: "pending@example.com",
          verificationStatus: "unverified",
        },
      ]),
      []
    )
  })
})

describe("verifiedClerkEmailMatches", () => {
  it("matches any verified address against the invite target", () => {
    assert.equal(
      verifiedClerkEmailMatches(
        ["counsel@example.com", "alt@firm.com"],
        "Alt@Firm.com"
      ),
      true
    )
    assert.equal(
      verifiedClerkEmailMatches(["counsel@example.com"], "other@example.com"),
      false
    )
    assert.equal(verifiedClerkEmailMatches([], "counsel@example.com"), false)
    assert.equal(verifiedClerkEmailMatches(["counsel@example.com"], "  "), false)
  })
})

describe("unverifiedClerkEmailPlaceholder", () => {
  it("builds a stable per-clerk placeholder", () => {
    assert.equal(
      unverifiedClerkEmailPlaceholder("user_abc"),
      "unverified+user_abc@users.invalid"
    )
  })
})
