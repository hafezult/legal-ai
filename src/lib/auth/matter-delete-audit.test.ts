import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveMatterDeleteAuditLabels } from "./matter-delete-audit.ts"

describe("resolveMatterDeleteAuditLabels", () => {
  it("publishes locked title, count, and organization id", () => {
    assert.deepEqual(
      resolveMatterDeleteAuditLabels({
        lockedTitle: "Acme v. Beta",
        lockedDocumentCount: 3,
        lockedOrganizationId: "org_1",
      }),
      {
        title: "Acme v. Beta",
        documentCount: 3,
        organizationId: "org_1",
      }
    )
  })

  it("allows legacy personal matters with a null organization id", () => {
    assert.deepEqual(
      resolveMatterDeleteAuditLabels({
        lockedTitle: "Personal matter",
        lockedDocumentCount: 0,
        lockedOrganizationId: null,
      }),
      {
        title: "Personal matter",
        documentCount: 0,
        organizationId: null,
      }
    )
  })

  it("withholds when the locked title is missing", () => {
    assert.equal(
      resolveMatterDeleteAuditLabels({
        lockedTitle: null,
        lockedDocumentCount: 1,
        lockedOrganizationId: "org_1",
      }),
      null
    )
  })

  it("withholds non-finite or negative document counts", () => {
    assert.equal(
      resolveMatterDeleteAuditLabels({
        lockedTitle: "Acme",
        lockedDocumentCount: Number.NaN,
        lockedOrganizationId: "org_1",
      }),
      null
    )
    assert.equal(
      resolveMatterDeleteAuditLabels({
        lockedTitle: "Acme",
        lockedDocumentCount: -1,
        lockedOrganizationId: "org_1",
      }),
      null
    )
  })
})
