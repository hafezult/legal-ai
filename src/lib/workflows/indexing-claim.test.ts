import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  resolvePipelineClaim,
  type IndexingClaim,
} from "./indexing-claim.ts"

describe("resolvePipelineClaim", () => {
  const preclaimed: IndexingClaim = {
    runId: "pre-auth-run",
    preservePublished: true,
  }
  const acquired: IndexingClaim = {
    runId: "fresh-run",
    preservePublished: false,
  }

  it("prefers a pre-authorized claim over a freshly acquired lease", () => {
    assert.deepEqual(resolvePipelineClaim(preclaimed, acquired), preclaimed)
  })

  it("uses the acquired lease when no preclaim was provided", () => {
    assert.deepEqual(resolvePipelineClaim(undefined, acquired), acquired)
  })

  it("returns null when neither preclaim nor acquisition succeeded", () => {
    assert.equal(resolvePipelineClaim(undefined, null), null)
  })

  it("keeps a preclaim even when acquisition is null (skip second claim)", () => {
    assert.deepEqual(resolvePipelineClaim(preclaimed, null), preclaimed)
  })
})
