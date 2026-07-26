import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  detectAllowedDocument,
  hasExpectedSignature,
  sanitizeUploadName,
} from "./upload.ts"

describe("document upload validators", () => {
  it("detects allowed extensions and MIME pairs", () => {
    assert.deepEqual(
      detectAllowedDocument({ name: "Brief.PDF", type: "application/pdf" }),
      { type: "pdf", mimeType: "application/pdf" }
    )
    assert.equal(
      detectAllowedDocument({ name: "brief.pdf", type: "text/plain" }),
      null
    )
    assert.equal(
      detectAllowedDocument({ name: "notes.md", type: "text/plain" }),
      null
    )
  })

  it("checks format signatures", () => {
    assert.equal(
      hasExpectedSignature("pdf", Buffer.from("%PDF-1.4")),
      true
    )
    assert.equal(
      hasExpectedSignature("pdf", Buffer.from("not-a-pdf")),
      false
    )
    assert.equal(
      hasExpectedSignature("docx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])),
      true
    )
    assert.equal(
      hasExpectedSignature("txt", Buffer.from("plain text")),
      true
    )
    assert.equal(
      hasExpectedSignature("txt", Buffer.from([0x00, 0x01, 0x02])),
      false
    )
  })

  it("sanitizes storage object names", () => {
    assert.equal(sanitizeUploadName("My Brief (v2).PDF"), "my_brief_v2_.pdf")
    assert.equal(sanitizeUploadName("a".repeat(200)).length, 120)
    assert.equal(sanitizeUploadName("../secret.pdf"), "secret.pdf")
    assert.equal(sanitizeUploadName("..\\nested\\brief.pdf"), "brief.pdf")
    assert.equal(sanitizeUploadName("...hidden.pdf"), "hidden.pdf")
  })
})

