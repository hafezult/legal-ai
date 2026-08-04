import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildContentDisposition,
  sanitizeDownloadFileName,
} from "./content-disposition.ts"

describe("sanitizeDownloadFileName", () => {
  it("strips path segments and control characters", () => {
    assert.equal(sanitizeDownloadFileName("../../secret.pdf"), "secret.pdf")
    assert.equal(sanitizeDownloadFileName("a\\b\\brief.pdf"), "brief.pdf")
    assert.equal(sanitizeDownloadFileName('memo"x.pdf'), "memo_x.pdf")
    assert.equal(sanitizeDownloadFileName("note\nline.txt"), "note_line.txt")
  })

  it("falls back for empty or dot-only names", () => {
    assert.equal(sanitizeDownloadFileName(""), "document")
    assert.equal(sanitizeDownloadFileName("..."), "document")
    assert.equal(sanitizeDownloadFileName("/"), "document")
  })

  it("caps pathological lengths", () => {
    const long = `${"a".repeat(300)}.pdf`
    assert.equal(sanitizeDownloadFileName(long).length, 180)
  })
})

describe("buildContentDisposition", () => {
  it("emits inline disposition with ascii filename and RFC 5987 filename*", () => {
    const header = buildContentDisposition("Opinion.pdf")
    assert.match(header, /^inline; filename="Opinion\.pdf"; filename\*=UTF-8''Opinion\.pdf$/)
  })

  it("supports attachment disposition and encodes unicode names", () => {
    const header = buildContentDisposition("Mémoire.pdf", "attachment")
    assert.match(header, /^attachment; /)
    assert.match(header, /filename\*=UTF-8''M%C3%A9moire\.pdf/)
  })
})
