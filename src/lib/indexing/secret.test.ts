import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  canRevealHealthDetails,
  indexingSecretRejectedReason,
  isIndexingSecretStrong,
  MIN_SECRET_LENGTH,
  MIN_SECRET_UNIQUE_CHARS,
  resolveHealthDetailSecret,
  secretsMatch,
} from "./secret.ts"

const STRONG_SECRET = "aether-ci-validate-fd8b-x7k9m2p4q8w1!"
const STRONG_DETAIL = "ready-detail-secret-c498-min-32chars!"

describe("indexing secret helpers", () => {
  it("rejects empty, short, placeholder, and low-entropy secrets", () => {
    assert.equal(isIndexingSecretStrong(""), false)
    assert.equal(isIndexingSecretStrong(null), false)
    assert.equal(isIndexingSecretStrong("change-me"), false)
    assert.equal(isIndexingSecretStrong("CHANGE-ME"), false)
    assert.equal(isIndexingSecretStrong("secret"), false)
    assert.equal(isIndexingSecretStrong("password1"), false)
    assert.equal(isIndexingSecretStrong("admin"), false)
    assert.equal(isIndexingSecretStrong("x"), false)
    assert.equal(isIndexingSecretStrong("ci-indexing-secret"), false)
    assert.equal(
      isIndexingSecretStrong("ci-indexing-secret-613d-min-32chars!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("replace-with-a-long-random-indexing-secret"),
      false
    )
    assert.equal(isIndexingSecretStrong("a".repeat(MIN_SECRET_LENGTH - 1)), false)
    assert.equal(isIndexingSecretStrong("a".repeat(MIN_SECRET_LENGTH)), false)
    assert.equal(isIndexingSecretStrong("ab".repeat(MIN_SECRET_LENGTH)), false)
    assert.equal(isIndexingSecretStrong(STRONG_SECRET), true)
    assert.ok(STRONG_SECRET.length >= MIN_SECRET_LENGTH)
    assert.ok(new Set(STRONG_SECRET).size >= MIN_SECRET_UNIQUE_CHARS)
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
        INDEXING_SECRET: "short-but-not-placeholder",
      }),
      "INDEXING_SECRET is too weak for production"
    )
    assert.equal(
      indexingSecretRejectedReason({
        NODE_ENV: "production",
        INDEXING_SECRET: STRONG_SECRET,
      }),
      null
    )
  })

  it("compares secrets in constant time via digests", () => {
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
      null
    )
    assert.equal(
      resolveHealthDetailSecret({ INDEXING_SECRET: STRONG_SECRET }),
      STRONG_SECRET
    )
    assert.equal(
      resolveHealthDetailSecret({
        HEALTH_DETAIL_SECRET: STRONG_DETAIL,
        INDEXING_SECRET: STRONG_SECRET,
      }),
      STRONG_DETAIL
    )
    assert.equal(
      canRevealHealthDetails(STRONG_SECRET, {
        INDEXING_SECRET: STRONG_SECRET,
      }),
      true
    )
    assert.equal(
      canRevealHealthDetails("change-me", { INDEXING_SECRET: "change-me" }),
      false
    )
    assert.equal(
      canRevealHealthDetails("wrong", {
        INDEXING_SECRET: STRONG_SECRET,
      }),
      false
    )
  })
})
