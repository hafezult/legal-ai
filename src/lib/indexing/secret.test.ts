import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  indexingSecretRejectedReason,
  isIndexingSecretStrong,
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
})
