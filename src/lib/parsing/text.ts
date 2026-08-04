export type DocType = "pdf" | "docx" | "txt" | "unknown"

export function detectDocumentType(mimeType: string, fileName: string): DocType {
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    return "pdf"
  }
  if (
    mimeType.includes("wordprocessingml") ||
    fileName.toLowerCase().endsWith(".docx")
  ) {
    return "docx"
  }
  if (mimeType === "text/plain" || fileName.toLowerCase().endsWith(".txt")) {
    return "txt"
  }
  return "unknown"
}

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Extract plausible section headings from document text. */
export function extractHeadings(text: string): string[] {
  const lines = text.split("\n")
  const headings: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.length > 100) continue
    if (
      /^[A-Z][A-Z0-9\s,.:&()\-]+$/.test(t) || // ALL CAPS lines
      /^\d+\.\s+[A-Z]/.test(t) || // 1. Heading
      /^[IVX]+\.\s+[A-Z]/.test(t) || // I. Heading
      /^(?:SCHEDULE|ANNEX|APPENDIX|PART|SECTION|CLAUSE)\s/i.test(t)
    ) {
      headings.push(t)
    }
  }
  return [...new Set(headings)].slice(0, 30)
}
