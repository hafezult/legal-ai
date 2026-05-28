import { getSupabaseAdmin } from "@/lib/storage/client"

// ── Types ─────────────────────────────────────────────────────────────────

export type ParseResult = {
  text: string
  pageCount: number
  confidence: number
  headings: string[]
  metadata: Record<string, unknown>
  mimeType: string
}

export type DocType = "pdf" | "docx" | "txt" | "unknown"

// ── Utilities ─────────────────────────────────────────────────────────────

export function detectDocumentType(mimeType: string, fileName: string): DocType {
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) return "pdf"
  if (
    mimeType.includes("wordprocessingml") ||
    fileName.toLowerCase().endsWith(".docx")
  ) return "docx"
  if (mimeType === "text/plain" || fileName.toLowerCase().endsWith(".txt")) return "txt"
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
      /^\d+\.\s+[A-Z]/.test(t) ||              // 1. Heading
      /^[IVX]+\.\s+[A-Z]/.test(t) ||           // I. Heading
      /^(?:SCHEDULE|ANNEX|APPENDIX|PART|SECTION|CLAUSE)\s/i.test(t)
    ) {
      headings.push(t)
    }
  }
  return [...new Set(headings)].slice(0, 30)
}

// ── Parsers ───────────────────────────────────────────────────────────────

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  // Dynamic import keeps pdf-parse server-side only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfModule = await import("pdf-parse") as any
  const pdfParse = pdfModule.default ?? pdfModule
  const result = await pdfParse(buffer, {
    // Disable default test-file loading
    max: 0,
  })
  const text = normalizeText(result.text)
  return {
    text,
    pageCount: result.numpages ?? Math.ceil(text.length / 3000),
    confidence: text.length > 200 ? 0.9 : 0.5,
    headings: extractHeadings(text),
    metadata: { info: result.info ?? {}, version: result.version ?? "" },
    mimeType: "application/pdf",
  }
}

async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  const mammoth = await import("mammoth")
  const { value, messages } = await mammoth.extractRawText({ buffer })
  const text = normalizeText(value)
  return {
    text,
    pageCount: Math.max(1, Math.ceil(text.split("\n").length / 28)),
    confidence: 0.95,
    headings: extractHeadings(text),
    metadata: { warnings: (messages as { type: string }[]).filter((m) => m.type === "warning").length },
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }
}

function parseTxt(buffer: Buffer): ParseResult {
  const text = normalizeText(buffer.toString("utf-8"))
  return {
    text,
    pageCount: Math.max(1, Math.ceil(text.length / 3000)),
    confidence: 1.0,
    headings: extractHeadings(text),
    metadata: {},
    mimeType: "text/plain",
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ParseResult> {
  const type = detectDocumentType(mimeType, fileName)
  switch (type) {
    case "pdf":  return parsePdf(buffer)
    case "docx": return parseDocx(buffer)
    case "txt":  return parseTxt(buffer)
    default:
      throw new Error(`Unsupported document type: ${mimeType}`)
  }
}

export async function extractText(
  storagePath: string,
  mimeType: string,
  fileName: string
): Promise<ParseResult> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.storage
    .from("legal-documents")
    .download(storagePath)
  if (error) throw new Error(`Storage download failed: ${error.message}`)
  const buffer = Buffer.from(await data.arrayBuffer())
  return parseDocument(buffer, mimeType, fileName)
}
