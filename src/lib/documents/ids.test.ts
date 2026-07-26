import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isDocumentIdShape } from "./ids.ts"

describe("isDocumentIdShape", () => {
  it("accepts Prisma cuid-shaped ids", () => {
    assert.equal(isDocumentIdShape("clxyz0123456789abcdefghij"), true)
    assert.equal(isDocumentIdShape("c" + "a".repeat(24)), true)
    assert.equal(isDocumentIdShape("c" + "b".repeat(32)), true)
  })

  it("rejects empty, short, path-like, and uuid probe strings", () => {
    assert.equal(isDocumentIdShape(""), false)
    assert.equal(isDocumentIdShape("cshort"), false)
    assert.equal(isDocumentIdShape("../etc/passwd"), false)
    assert.equal(isDocumentIdShape("not-a-document-id"), false)
    assert.equal(
      isDocumentIdShape("550e8400-e29b-41d4-a716-446655440000"),
      false
    )
    assert.equal(isDocumentIdShape("C" + "a".repeat(24)), false)
  })
})
