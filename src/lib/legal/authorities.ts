// UK legal authority extraction — cases, statutes, CPR, practice directions

export type AuthorityType =
  | "case_neutral"   // [2024] UKSC 11
  | "case_report"    // [2001] AC 232
  | "statute"        // Companies Act 2006, s.172
  | "cpr"            // CPR 31.6
  | "practice_dir"   // PD 31A
  | "statutory_inst" // SI 2013/1388

export type Authority = {
  citation: string
  type: AuthorityType
  normalized: string
}

// ── Regex patterns ─────────────────────────────────────────────────────────

// Neutral citations: [2024] UKSC 11, [2023] EWCA Civ 456, [2022] EWHC 789 (Comm)
const R_NEUTRAL =
  /\[\d{4}\]\s+(?:UKSC|UKHL|UKPC|EWCA\s+(?:Civ|Crim|Comm)|EWHC(?:\s+\(\w+\))?|EWFC|EWCOP|NICA)\s+\d+(?:\s*\([^)]{1,20}\))?/gi

// Law report citations: [1998] AC 232, (2001) 2 WLR 456
const R_REPORT =
  /(?:\[\d{4}\]|\(\d{4}\))\s+\d*\s*(?:AC|WLR|All ER|All E\.R\.|BCLC|Ch|QB|KB|Fam|Cr App R|Lloyd's Rep|IRLR|ICR|PNLR|EG|EGCS|HLR|P&CR)\s+\d+/gi

// CPR references: CPR 31.6, CPR Part 36, CPR r 44.3
const R_CPR =
  /CPR\s+(?:Pt?\.?\s*|Part\s+|r\.?\s*|rule\s+|rr?\.?\s*)?\d+(?:\.\d+)*(?:\([0-9a-zA-Z]+\))?/gi

// Practice Directions: PD 36, PD 57AC, Practice Direction 31B
const R_PD =
  /(?:PD\s*\d+[A-Z]?|Practice\s+Direction\s+\d+[A-Z]?)(?:\s+para(?:graph)?s?\s*[\d.]+)?/gi

// Statutes: Companies Act 2006, Equality Act 2010 s.15
const R_STATUTE =
  /[A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|and|of|the|for))*\s+Act\s+\d{4}(?:\s*(?:,\s*)?[Ss](?:ection|ect?s?)?\.?\s*\d+[A-Z]?(?:\(\d+\))?(?:\([a-z]\))?)?/g

// Statutory instruments: SI 2013/1388, S.I. 2020/1234
const R_SI = /S\.?I\.?\s*\d{4}\/\d+(?:\s*\([^)]{1,40}\))?/gi

// ── Extraction ─────────────────────────────────────────────────────────────

export function extractAuthorities(text: string): Authority[] {
  const seen = new Set<string>()
  const results: Authority[] = []

  function add(raw: string, type: AuthorityType) {
    const normalized = raw.replace(/\s+/g, " ").trim()
    if (!seen.has(normalized) && normalized.length >= 4) {
      seen.add(normalized)
      results.push({ citation: raw.trim(), type, normalized })
    }
  }

  for (const m of text.matchAll(R_NEUTRAL))   add(m[0], "case_neutral")
  for (const m of text.matchAll(R_REPORT))    add(m[0], "case_report")
  for (const m of text.matchAll(R_CPR))       add(m[0], "cpr")
  for (const m of text.matchAll(R_PD))        add(m[0], "practice_dir")
  for (const m of text.matchAll(R_STATUTE))   add(m[0], "statute")
  for (const m of text.matchAll(R_SI))        add(m[0], "statutory_inst")

  return results
}

export function groupAuthorities(authorities: Authority[]): {
  cases: Authority[]
  statutes: Authority[]
  cpr: Authority[]
  practiceDirs: Authority[]
  statutory: Authority[]
} {
  return {
    cases:       authorities.filter((a) => a.type === "case_neutral" || a.type === "case_report"),
    statutes:    authorities.filter((a) => a.type === "statute"),
    cpr:         authorities.filter((a) => a.type === "cpr"),
    practiceDirs:authorities.filter((a) => a.type === "practice_dir"),
    statutory:   authorities.filter((a) => a.type === "statutory_inst"),
  }
}
