import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  detectAllowedDocument,
  hasExpectedSignature,
  MAX_UPLOAD_REQUEST_BYTES,
  sanitizeUploadName,
  validateUploadContentLength,
} from "./upload.ts"

describe("document upload validators", () => {
  it("requires Content-Length before multipart parsing", () => {
    assert.deepEqual(validateUploadContentLength(null), {
      ok: false,
      error: "Content-Length header required.",
      status: 411,
    })
    assert.deepEqual(validateUploadContentLength(""), {
      ok: false,
      error: "Content-Length header required.",
      status: 411,
    })
    assert.deepEqual(validateUploadContentLength("   "), {
      ok: false,
      error: "Content-Length header required.",
      status: 411,
    })
  })

  it("rejects invalid and oversize Content-Length values", () => {
    assert.deepEqual(validateUploadContentLength("not-a-number"), {
      ok: false,
      error: "Invalid Content-Length.",
      status: 400,
    })
    assert.deepEqual(validateUploadContentLength("-1"), {
      ok: false,
      error: "Invalid Content-Length.",
      status: 400,
    })
    assert.deepEqual(
      validateUploadContentLength(String(MAX_UPLOAD_REQUEST_BYTES + 1)),
      {
        ok: false,
        error: "File exceeds the 50 MB ingestion limit.",
        status: 413,
      }
    )
  })

  it("accepts finite in-range Content-Length values", () => {
    assert.deepEqual(validateUploadContentLength("0"), {
      ok: true,
      bytes: 0,
    })
    assert.deepEqual(
      validateUploadContentLength(String(MAX_UPLOAD_REQUEST_BYTES)),
      {
        ok: true,
        bytes: MAX_UPLOAD_REQUEST_BYTES,
      }
    )
  })

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

