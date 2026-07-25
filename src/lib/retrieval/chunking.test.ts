import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  MAX_CHUNKS_PER_DOCUMENT,
  chunkDocument,
  estimateTokens,
  splitOversizedParagraph,
} from "./chunking.ts"

describe("estimateTokens", () => {
  it("approximates tokens from character length", () => {
    assert.equal(estimateTokens(""), 0)
    assert.equal(estimateTokens("abcd"), 1)
    assert.equal(estimateTokens("a".repeat(8)), 2)
  })
})

describe("chunkDocument", () => {
  it("splits long clause text into ordered overlapping chunks", () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => {
      const body = `Clause ${i + 1}. ${"word ".repeat(80)}`.trim()
      return body
    })
    const text = paragraphs.join("\n\n")
    const chunks = chunkDocument(text, ["Clause 1."], 4, {
      chunkSize: 120,
      overlap: 20,
    })

    assert.ok(chunks.length >= 2)
    assert.equal(chunks[0]?.chunkIndex, 0)
    assert.equal(chunks[1]?.chunkIndex, 1)
    assert.ok((chunks[0]?.tokenCount ?? 0) > 0)
    assert.ok((chunks[0]?.content.length ?? 0) > 15)
  })

  it("keeps short documents as a single chunk and skips tiny paragraphs", () => {
    const text = "This is a complete operative clause about disclosure obligations.\n\nok\n\n"
    const chunks = chunkDocument(text, [], 1)

    assert.equal(chunks.length, 1)
    assert.equal(chunks[0]?.pageRef, null)
    assert.match(chunks[0]?.content ?? "", /disclosure obligations/)
  })

  it("avoids flushing while the buffer ends in a citation fragment", () => {
    const citationTail =
      "The court relied on the reasoning summarised in [2024] UKSC"
    const next =
      "11 when weighing the disclosure burden under the applicable practice."
    const filler = "word ".repeat(90).trim()
    const text = `${filler}\n\n${citationTail}\n\n${next}`
    const chunks = chunkDocument(text, [], 1, { chunkSize: 80, overlap: 10 })

    assert.ok(chunks.length >= 1)
    assert.ok(
      chunks.some((chunk) => /\[2024\] UKSC/.test(chunk.content)),
      "citation fragment should remain in chunk content"
    )
  })

  it("assigns monotonically nondecreasing page refs within pageCount", () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `Section ${i + 1}. ${"authority ".repeat(70)}`.trim()
    )
    const text = paragraphs.join("\n\n")
    const pageCount = 5
    const chunks = chunkDocument(text, [], pageCount, {
      chunkSize: 100,
      overlap: 20,
    })

    assert.ok(chunks.length >= 3)
    let previous = 1
    for (const chunk of chunks) {
      assert.ok(chunk.pageRef !== null)
      assert.ok((chunk.pageRef ?? 0) >= 1)
      assert.ok((chunk.pageRef ?? 0) <= pageCount)
      assert.ok((chunk.pageRef ?? 0) >= previous)
      previous = chunk.pageRef ?? previous
    }
  })

  it("keeps early document offsets on page 1 without ceil+1 bias", () => {
    const paragraphs = Array.from({ length: 8 }, (_, i) =>
      `Part ${i + 1}. ${"word ".repeat(40)}`.trim()
    )
    const text = paragraphs.join("\n\n")
    const pageCount = 10
    const chunks = chunkDocument(text, [], pageCount, {
      chunkSize: 80,
      overlap: 10,
    })

    assert.ok(chunks.length >= 2)
    assert.equal(chunks[0]?.pageRef, 1)
    // A chunk starting in the first 10% of the document must stay on page 1.
    const early = chunks.find((chunk) => {
      const offset = text.indexOf(chunk.content.slice(0, 40))
      return offset >= 0 && offset / text.length < 0.1
    })
    assert.ok(early)
    assert.equal(early?.pageRef, 1)
  })

  it("hard-splits a single oversized paragraph without newlines", () => {
    const text = `Operative clause. ${"indemnity ".repeat(900)}`.trim()
    const chunks = chunkDocument(text, [], 1, { chunkSize: 80, overlap: 10 })

    assert.ok(chunks.length >= 3)
    const charBudget = 80 * 4
    for (const chunk of chunks) {
      assert.ok(
        chunk.content.length <= charBudget * 1.25,
        `chunk exceeded budget: ${chunk.content.length}`
      )
    }
  })

  it("caps the number of chunks for pathological extractions", () => {
    const paragraphs = Array.from({ length: 80 }, (_, i) =>
      `Clause ${i + 1}. ${"word ".repeat(100)}`.trim()
    )
    const text = paragraphs.join("\n\n")
    const chunks = chunkDocument(text, [], 1, {
      chunkSize: 40,
      overlap: 5,
      maxChunks: 12,
    })

    assert.equal(chunks.length, 12)
    assert.equal(chunks[11]?.chunkIndex, 11)
    assert.ok(MAX_CHUNKS_PER_DOCUMENT >= 12)
  })
})

describe("splitOversizedParagraph", () => {
  it("returns the paragraph unchanged when within budget", () => {
    assert.deepEqual(splitOversizedParagraph("short clause text", 100), [
      "short clause text",
    ])
  })

  it("prefers sentence boundaries when splitting", () => {
    const text = `${"A".repeat(40)}. ${"B".repeat(40)}. ${"C".repeat(40)}.`
    const parts = splitOversizedParagraph(text, 50)
    assert.ok(parts.length >= 2)
    assert.ok(parts.every((part) => part.length <= 50))
  })
})
