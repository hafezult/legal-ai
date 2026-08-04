import { STORAGE_BUCKET, getSupabaseAdmin } from "@/lib/storage/client"
import { assertSafeDocxZip } from "@/lib/parsing/docx-zip-preflight"
import {
  detectDocumentType,
  extractHeadings,
  normalizeText,
  type DocType,
} from "@/lib/parsing/text"

export type { DocType }
export { detectDocumentType, extractHeadings, normalizeText }

// ── Types ─────────────────────────────────────────────────────────────────

export type ParseResult = {
  text: string
  pageCount: number
  confidence: number
  headings: string[]
  metadata: Record<string, unknown>
  mimeType: string
}

// ── Parsers ───────────────────────────────────────────────────────────────

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  const { PDFParse } = await import("pdf-parse")
  const parser = new PDFParse({ data: new Uint8Array(buffer) })

  try {
    const result = await parser.getText()
    const text = normalizeText(result.text)

    return {
      text,
      pageCount: result.total || Math.ceil(text.length / 3000),
      confidence: text.length > 200 ? 0.9 : 0.5,
      headings: extractHeadings(text),
      metadata: { pages: result.pages.length },
      mimeType: "application/pdf",
    }
  } finally {
    await parser.destroy()
  }
}

async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  // Structural zip preflight before mammoth expands entry payloads.
  const preflight = assertSafeDocxZip(buffer)
  if (!preflight.ok) {
    throw new Error(preflight.error)
  }

  const mammoth = await import("mammoth")
  const { value, messages } = await mammoth.extractRawText({ buffer })
  const text = normalizeText(value)
  return {
    text,
    pageCount: Math.max(1, Math.ceil(text.split("\n").length / 28)),
    confidence: 0.95,
    headings: extractHeadings(text),
    metadata: {
      warnings: (messages as { type: string }[]).filter((m) => m.type === "warning")
        .length,
      zipEntries: preflight.entryCount,
      zipUncompressedBytes: preflight.uncompressedBytes,
    },
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
    .from(STORAGE_BUCKET)
    .download(storagePath)
  if (error) throw new Error(`Storage download failed: ${error.message}`)
  const buffer = Buffer.from(await data.arrayBuffer())
  return parseDocument(buffer, mimeType, fileName)
}
