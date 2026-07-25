import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  canRevealHealthDetails,
  indexingSecretRejectedReason,
  isIndexingSecretStrong,
  resolveHealthDetailSecret,
  secretsMatch,
} from "./secret.ts"

describe("indexing secret helpers", () => {
  it("rejects empty and placeholder secrets", () => {
    assert.equal(isIndexingSecretStrong(""), false)
    assert.equal(isIndexingSecretStrong(null), false)
    assert.equal(isIndexingSecretStrong("change-me"), false)
    assert.equal(isIndexingSecretStrong("CHANGE-ME"), false)
    assert.equal(isIndexingSecretStrong("secret"), false)
    assert.equal(isIndexingSecretStrong("ci-indexing-secret"), true)
  })

  it("allows missing secrets only in development", () => {
    assert.equal(
      indexingSecretRejectedReason({ NODE_ENV: "development" }),
      null
    )
    assert.equal(
      indexingSecretRejectedReason({ NODE_ENV: "production" }),
      "INDEXING_SECRET is not configured"
    )
    assert.equal(
      indexingSecretRejectedReason({
        NODE_ENV: "production",
        INDEXING_SECRET: "change-me",
      }),
      "INDEXING_SECRET is too weak for production"
    )
    assert.equal(
      indexingSecretRejectedReason({
        NODE_ENV: "production",
        INDEXING_SECRET: "ci-indexing-secret",
      }),
      null
    )
  })

  it("compares secrets in constant time", () => {
    assert.equal(secretsMatch("abc", "abc"), true)
    assert.equal(secretsMatch("abc", "abd"), false)
    assert.equal(secretsMatch("abc", "abcd"), false)
    assert.equal(secretsMatch("", "abc"), false)
    assert.equal(secretsMatch(null, "abc"), false)
    assert.equal(secretsMatch("abc", null), false)
  })

  it("only reveals health details for strong matching secrets", () => {
    assert.equal(resolveHealthDetailSecret({ INDEXING_SECRET: "change-me" }), null)
    assert.equal(
      resolveHealthDetailSecret({ INDEXING_SECRET: "ci-indexing-secret" }),
      "ci-indexing-secret"
    )
    assert.equal(
      resolveHealthDetailSecret({
        HEALTH_DETAIL_SECRET: "ready-detail-secret",
        INDEXING_SECRET: "ci-indexing-secret",
      }),
      "ready-detail-secret"
    )
    assert.equal(
      canRevealHealthDetails("ci-indexing-secret", {
        INDEXING_SECRET: "ci-indexing-secret",
      }),
      true
    )
    assert.equal(
      canRevealHealthDetails("change-me", { INDEXING_SECRET: "change-me" }),
      false
    )
    assert.equal(
      canRevealHealthDetails("wrong", {
        INDEXING_SECRET: "ci-indexing-secret",
      }),
      false
    )
  })
})
