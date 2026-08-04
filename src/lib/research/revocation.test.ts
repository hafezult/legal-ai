import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  redactResearchOnRevocation,
  RESEARCH_ACCESS_REVOKED_MESSAGE,
  RESEARCH_PERSIST_REVOKED_MESSAGE,
} from "./revocation.ts"

describe("redactResearchOnRevocation", () => {
  it("clears query, answer, chunks, authorities, and session on revocation", () => {
    const redacted = redactResearchOnRevocation({
      query: "What are the privilege risks in this matter?",
      answer: "Privileged analysis with client facts.",
      chunks: [{ id: "c1", content: "secret excerpt" }],
      authorities: {
        cases: ["Smith v Jones"],
        statutes: ["s.1"],
        cpr: ["CPR 1.1"],
        practiceDirs: ["PD 1"],
        statutory: ["SI 1"],
      },
      sessionId: "sess_1",
      retrievalCount: 1,
      error: undefined,
    })

    assert.equal(redacted.query, "")
    assert.equal(redacted.answer, "")
    assert.deepEqual(redacted.chunks, [])
    assert.deepEqual(redacted.authorities, {
      cases: [],
      statutes: [],
      cpr: [],
      practiceDirs: [],
      statutory: [],
    })
    assert.equal(redacted.sessionId, "")
    assert.equal(redacted.retrievalCount, 0)
    assert.equal(redacted.error, RESEARCH_ACCESS_REVOKED_MESSAGE)
  })

  it("accepts a persistence-specific revocation message", () => {
    const redacted = redactResearchOnRevocation(
      {
        answer: "x",
        chunks: [1],
        authorities: {
          cases: ["a"],
          statutes: [],
          cpr: [],
          practiceDirs: [],
          statutory: [],
        },
        sessionId: "s",
        retrievalCount: 3,
      },
      RESEARCH_PERSIST_REVOKED_MESSAGE
    )
    assert.equal(redacted.error, RESEARCH_PERSIST_REVOKED_MESSAGE)
    assert.equal(redacted.retrievalCount, 0)
  })
})
