import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { extractAuthorities, groupAuthorities } from "./authorities.ts"

describe("extractAuthorities", () => {
  it("extracts neutral citations, reports, CPR, PD, statutes, and SIs", () => {
    const text = [
      "See [2024] UKSC 11 and [2001] AC 232.",
      "Disclosure under CPR 31.6 and PD 31A.",
      "Companies Act 2006, s.172 applies.",
      "Compare SI 2013/1388.",
    ].join(" ")

    const authorities = extractAuthorities(text)
    const types = new Set(authorities.map((a) => a.type))

    assert.ok(types.has("case_neutral"))
    assert.ok(types.has("case_report"))
    assert.ok(types.has("cpr"))
    assert.ok(types.has("practice_dir"))
    assert.ok(types.has("statute"))
    assert.ok(types.has("statutory_inst"))
    assert.ok(authorities.some((a) => a.normalized.includes("[2024] UKSC 11")))
    assert.ok(authorities.some((a) => a.normalized.includes("Companies Act 2006")))
  })

  it("deduplicates normalized citations", () => {
    const text = "[2023] EWCA Civ 456 mentioned twice: [2023] EWCA Civ 456"
    const authorities = extractAuthorities(text)
    const neutrals = authorities.filter((a) => a.type === "case_neutral")

    assert.equal(neutrals.length, 1)
  })

  it("returns an empty list when no authorities are present", () => {
    assert.deepEqual(extractAuthorities("No citations in this note."), [])
  })
})

describe("groupAuthorities", () => {
  it("buckets authorities by family", () => {
    const grouped = groupAuthorities(
      extractAuthorities(
        "[2024] UKSC 11; [2001] AC 232; CPR Part 36; PD 57AC; Equality Act 2010 s.15; S.I. 2020/1234"
      )
    )

    assert.ok(grouped.cases.length >= 2)
    assert.ok(grouped.cpr.length >= 1)
    assert.ok(grouped.practiceDirs.length >= 1)
    assert.ok(grouped.statutes.length >= 1)
    assert.ok(grouped.statutory.length >= 1)
  })
})
