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

/** Unit-test-only strong secret — must not match CI/placeholder denylist prefixes. */
const STRONG_SECRET = "aether-unit-test-secret-e161-k9m2n7p4q8w!"
const STRONG_DETAIL = "ready-detail-secret-e161-min-32chars!!"
const CI_PLACEHOLDER = "aether-ci-validate-e161-k8n3m7p2q5w9x!"

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
    assert.equal(isIndexingSecretStrong(CI_PLACEHOLDER), false)
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-402c-k8n3m7p2q5w9x!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-4db2-r7k3n9p2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-afdd-r7k3n9p2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-caf9-m4n8p2q7w1x5z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-f4be-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-584f-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-13dd-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-bd82-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-8e6b-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-11c5-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-1b7e-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-a0bc-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-838d-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-660b-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-62a0-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-1f07-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-a698-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-d44a-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-dcdf-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-6c57-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-f858-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-9ff9-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-da3a-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-1fd1-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-8eb5-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-928f-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-aa2f-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-2e03-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-c81e-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-394a-k7n3p9q2w5x8z!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-c80a-v6q9m2r8x4p7z1k5!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-edbb-n4k8w2x7m9q3p5z1!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-f414-m7n2p9q4w8x1z5k3!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong("aether-ci-validate-b56a-k4n8p2q7w1x5z3m9!"),
      false
    )
    assert.equal(
      isIndexingSecretStrong(
        "aether-ci-validate-6fe6-8d35f2acc66c89dbc2131668e88687fb2625875e!"
      ),
      false
    )
    assert.equal(
      isIndexingSecretStrong(
        "aether-ci-validate-2999-8ac2c726f0589d00121ea6d2bc6e96b04ab3ed5b!"
      ),
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
        INDEXING_SECRET: CI_PLACEHOLDER,
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
    assert.equal(resolveHealthDetailSecret({ INDEXING_SECRET: CI_PLACEHOLDER }), null)
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
