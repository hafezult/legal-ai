import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  detectDocumentType,
  extractHeadings,
  normalizeText,
} from "./text.ts"

describe("detectDocumentType", () => {
  it("detects pdf, docx, and txt from mime or extension", () => {
    assert.equal(detectDocumentType("application/pdf", "brief.bin"), "pdf")
    assert.equal(detectDocumentType("application/octet-stream", "brief.PDF"), "pdf")
    assert.equal(
      detectDocumentType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "memo.bin"
      ),
      "docx"
    )
    assert.equal(detectDocumentType("application/octet-stream", "memo.docx"), "docx")
    assert.equal(detectDocumentType("text/plain", "notes.bin"), "txt")
    assert.equal(detectDocumentType("application/octet-stream", "notes.txt"), "txt")
  })

  it("returns unknown for unsupported types", () => {
    assert.equal(detectDocumentType("image/png", "scan.png"), "unknown")
  })
})

describe("normalizeText", () => {
  it("normalizes newlines, spaces, and excess blank lines", () => {
    const raw = "Line one\r\nLine  two\r\n\r\n\r\nLine three  \r\n"
    assert.equal(normalizeText(raw), "Line one\nLine two\n\nLine three")
  })
})

describe("extractHeadings", () => {
  it("extracts common legal heading shapes", () => {
    const text = [
      "PART A INTRODUCTION",
      "1. Background",
      "I. Jurisdiction",
      "SCHEDULE 1 Definitions",
      "This ordinary sentence should not be a heading.",
    ].join("\n")

    const headings = extractHeadings(text)
    assert.ok(headings.includes("PART A INTRODUCTION"))
    assert.ok(headings.includes("1. Background"))
    assert.ok(headings.includes("I. Jurisdiction"))
    assert.ok(headings.includes("SCHEDULE 1 Definitions"))
    assert.ok(!headings.includes("This ordinary sentence should not be a heading."))
  })
})
