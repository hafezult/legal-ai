import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ingestUploadHttpStatus } from "./ingest-upload-status.ts"

describe("ingestUploadHttpStatus", () => {
  it("returns 200 for successful ingest results", () => {
    assert.equal(ingestUploadHttpStatus({ success: true }), 200)
    assert.equal(ingestUploadHttpStatus({}), 200)
  })

  it("returns 400 for validation / client ingest errors", () => {
    assert.equal(
      ingestUploadHttpStatus({ error: "Unsupported format. Accepted: PDF, DOCX, TXT." }),
      400
    )
    assert.equal(
      ingestUploadHttpStatus({
        error: "File exceeds the 50 MB ingestion limit.",
        unavailable: false,
      }),
      400
    )
  })

  it("returns 503 for storage and registration infrastructure outages", () => {
    assert.equal(
      ingestUploadHttpStatus({
        error: "Document storage is unavailable. Check Supabase configuration.",
        unavailable: true,
      }),
      503
    )
    assert.equal(
      ingestUploadHttpStatus({
        error: "Ingestion failed. Document storage rejected the upload.",
        unavailable: true,
      }),
      503
    )
    assert.equal(
      ingestUploadHttpStatus({
        error: "Document registration failed. Storage entry removed.",
        unavailable: true,
      }),
      503
    )
  })
})
