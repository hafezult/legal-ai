import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  DRAFT_ACCESS_REVOKED_MESSAGE,
  DRAFT_PERSIST_REVOKED_MESSAGE,
  redactDraftOnRevocation,
} from "./revocation.ts"

describe("redactDraftOnRevocation", () => {
  it("clears draft identity, instruction, content, and source chunks on revocation", () => {
    const redacted = redactDraftOnRevocation({
      draftId: "draft_1",
      title: "Advice note",
      instruction: "Summarize privileged client facts",
      content: "Confidential draft body",
      chunks: [{ id: "c1", content: "secret excerpt" }],
      retrievalCount: 2,
      error: undefined,
    })

    assert.equal(redacted.draftId, "")
    assert.equal(redacted.title, "")
    assert.equal(redacted.instruction, "")
    assert.equal(redacted.content, "")
    assert.deepEqual(redacted.chunks, [])
    assert.equal(redacted.retrievalCount, 0)
    assert.equal(redacted.error, DRAFT_ACCESS_REVOKED_MESSAGE)
  })

  it("accepts a persistence-specific revocation message", () => {
    const redacted = redactDraftOnRevocation(
      {
        draftId: "d",
        title: "t",
        content: "c",
        chunks: [1],
        retrievalCount: 4,
      },
      DRAFT_PERSIST_REVOKED_MESSAGE
    )
    assert.equal(redacted.error, DRAFT_PERSIST_REVOKED_MESSAGE)
    assert.equal(redacted.draftId, "")
  })
})
