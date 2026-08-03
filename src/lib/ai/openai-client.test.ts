import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  OPENAI_REQUEST_TIMEOUT_MS,
  openAICallBudgetFromDeadline,
} from "./openai-client.ts"

describe("OPENAI_REQUEST_TIMEOUT_MS", () => {
  it("keeps provider calls bounded under platform request budgets", () => {
    assert.ok(OPENAI_REQUEST_TIMEOUT_MS >= 30_000)
    assert.ok(OPENAI_REQUEST_TIMEOUT_MS <= 120_000)
  })
})

describe("openAICallBudgetFromDeadline", () => {
  it("returns null when remaining budget is too small", () => {
    assert.equal(openAICallBudgetFromDeadline(0), null)
    assert.equal(openAICallBudgetFromDeadline(999), null)
    assert.equal(openAICallBudgetFromDeadline(Number.NaN), null)
  })

  it("disables retries when a second attempt would miss the deadline", () => {
    const budget = openAICallBudgetFromDeadline(OPENAI_REQUEST_TIMEOUT_MS)
    assert.ok(budget)
    assert.equal(budget.timeout, OPENAI_REQUEST_TIMEOUT_MS)
    assert.equal(budget.maxRetries, 0)
  })

  it("allows one retry when two full attempts fit", () => {
    const budget = openAICallBudgetFromDeadline(OPENAI_REQUEST_TIMEOUT_MS * 2)
    assert.ok(budget)
    assert.equal(budget.timeout, OPENAI_REQUEST_TIMEOUT_MS)
    assert.equal(budget.maxRetries, 1)
  })

  it("caps timeout to the remaining budget", () => {
    const budget = openAICallBudgetFromDeadline(45_000)
    assert.ok(budget)
    assert.equal(budget.timeout, 45_000)
    assert.equal(budget.maxRetries, 0)
  })
})
