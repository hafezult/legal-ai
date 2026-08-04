import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  PARSED_TEXT_MAX_CHARS,
  isParsedTextTruncated,
} from "./parsed-text.ts"

describe("parsed text cap helpers", () => {
  it("flags only text that hit the persistence ceiling", () => {
    assert.equal(isParsedTextTruncated(null), false)
    assert.equal(isParsedTextTruncated(""), false)
    assert.equal(isParsedTextTruncated("x".repeat(PARSED_TEXT_MAX_CHARS - 1)), false)
    assert.equal(isParsedTextTruncated("x".repeat(PARSED_TEXT_MAX_CHARS)), true)
  })
})
