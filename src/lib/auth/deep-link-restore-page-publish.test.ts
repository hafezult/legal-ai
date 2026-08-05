import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { decideDeepLinkRestorePagePublish } from "./deep-link-restore-page-publish.ts"

describe("decideDeepLinkRestorePagePublish", () => {
  it("withholds when active-org membership failed", () => {
    assert.deepEqual(
      decideDeepLinkRestorePagePublish({
        membershipOk: false,
        focusedMatterId: "m1",
        pendingMatterId: "m1",
        pendingHasError: false,
        workProductPresent: true,
        lockedTitle: "Acme v. Beta",
      }),
      { ok: false }
    )
  })

  it("publishes error payloads after membership without requiring row liveness", () => {
    assert.deepEqual(
      decideDeepLinkRestorePagePublish({
        membershipOk: true,
        focusedMatterId: "m1",
        pendingMatterId: null,
        pendingHasError: true,
        workProductPresent: false,
        lockedTitle: null,
      }),
      { ok: true, mode: "error" }
    )
  })

  it("publishes bodies with the locked title when row is still live", () => {
    assert.deepEqual(
      decideDeepLinkRestorePagePublish({
        membershipOk: true,
        focusedMatterId: "m1",
        pendingMatterId: "m1",
        pendingHasError: false,
        workProductPresent: true,
        lockedTitle: "Acme v. Beta",
      }),
      { ok: true, mode: "body", title: "Acme v. Beta" }
    )
  })

  it("withholds bodies when the work product was deleted after restore", () => {
    assert.deepEqual(
      decideDeepLinkRestorePagePublish({
        membershipOk: true,
        focusedMatterId: "m1",
        pendingMatterId: "m1",
        pendingHasError: false,
        workProductPresent: false,
        lockedTitle: "Acme v. Beta",
      }),
      { ok: false }
    )
  })

  it("withholds bodies when pending restore binds to a different matter", () => {
    assert.deepEqual(
      decideDeepLinkRestorePagePublish({
        membershipOk: true,
        focusedMatterId: "m1",
        pendingMatterId: "m2",
        pendingHasError: false,
        workProductPresent: true,
        lockedTitle: "Acme v. Beta",
      }),
      { ok: false }
    )
  })

  it("withholds bodies when the locked matter title is unavailable", () => {
    assert.deepEqual(
      decideDeepLinkRestorePagePublish({
        membershipOk: true,
        focusedMatterId: "m1",
        pendingMatterId: "m1",
        pendingHasError: false,
        workProductPresent: true,
        lockedTitle: null,
      }),
      { ok: false }
    )
  })
})
