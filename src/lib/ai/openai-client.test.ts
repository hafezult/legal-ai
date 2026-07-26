import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { OPENAI_REQUEST_TIMEOUT_MS } from "./openai-client.ts"

describe("OPENAI_REQUEST_TIMEOUT_MS", () => {
  it("keeps provider calls bounded under platform request budgets", () => {
    assert.ok(OPENAI_REQUEST_TIMEOUT_MS >= 30_000)
    assert.ok(OPENAI_REQUEST_TIMEOUT_MS <= 120_000)
  })
})
