import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  resolveDocumentDeleteAuditLabels,
  resolveDocumentReindexAuditLabels,
} from "./document-audit-labels.ts"

describe("resolveDocumentDeleteAuditLabels", () => {
  it("publishes locked file name and storage path", () => {
    assert.deepEqual(
      resolveDocumentDeleteAuditLabels({
        lockedFileName: "brief.pdf",
        lockedStoragePath: "org/matter/brief.pdf",
      }),
      {
        fileName: "brief.pdf",
        storagePath: "org/matter/brief.pdf",
      }
    )
  })

  it("allows a null storage path when the locked row has none", () => {
    assert.deepEqual(
      resolveDocumentDeleteAuditLabels({
        lockedFileName: "notes.txt",
        lockedStoragePath: null,
      }),
      {
        fileName: "notes.txt",
        storagePath: null,
      }
    )
  })

  it("withholds when the locked file name is missing", () => {
    assert.equal(
      resolveDocumentDeleteAuditLabels({
        lockedFileName: null,
        lockedStoragePath: "org/matter/brief.pdf",
      }),
      null
    )
    assert.equal(
      resolveDocumentDeleteAuditLabels({
        lockedFileName: "",
        lockedStoragePath: "org/matter/brief.pdf",
      }),
      null
    )
  })

  it("withholds non-string storage paths", () => {
    assert.equal(
      resolveDocumentDeleteAuditLabels({
        lockedFileName: "brief.pdf",
        lockedStoragePath: 12 as unknown as string,
      }),
      null
    )
  })
})

describe("resolveDocumentReindexAuditLabels", () => {
  it("publishes the locked file name", () => {
    assert.deepEqual(
      resolveDocumentReindexAuditLabels({ lockedFileName: "spa.docx" }),
      { fileName: "spa.docx" }
    )
  })

  it("withholds when the locked re-read did not yield a file name", () => {
    assert.equal(
      resolveDocumentReindexAuditLabels({ lockedFileName: null }),
      null
    )
    assert.equal(
      resolveDocumentReindexAuditLabels({ lockedFileName: undefined }),
      null
    )
    assert.equal(resolveDocumentReindexAuditLabels({ lockedFileName: "" }), null)
  })
})
