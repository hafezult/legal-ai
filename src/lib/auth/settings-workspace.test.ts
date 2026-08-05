import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { decideSettingsAccessPublish } from "./settings-workspace.ts"

describe("decideSettingsAccessPublish", () => {
  it("publishes only when a verified active org and access snapshot both exist", () => {
    assert.equal(
      decideSettingsAccessPublish({
        activeOrganizationId: "org_1",
        accessOk: true,
      }),
      true
    )
  })

  it("withholds when there is no verified active organization", () => {
    assert.equal(
      decideSettingsAccessPublish({
        activeOrganizationId: null,
        accessOk: true,
      }),
      false
    )
  })

  it("withholds when access detail failed closed", () => {
    assert.equal(
      decideSettingsAccessPublish({
        activeOrganizationId: "org_1",
        accessOk: false,
      }),
      false
    )
  })
})
