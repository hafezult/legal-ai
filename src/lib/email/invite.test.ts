import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { escapeHtml } from "./invite.ts"

describe("escapeHtml", () => {
  it("escapes HTML metacharacters used in invite email bodies", () => {
    assert.equal(
      escapeHtml(`Acme & <Partners> "Counsel"`),
      "Acme &amp; &lt;Partners&gt; &quot;Counsel&quot;"
    )
  })

  it("leaves plain text unchanged", () => {
    assert.equal(escapeHtml("North Chambers"), "North Chambers")
  })
})
