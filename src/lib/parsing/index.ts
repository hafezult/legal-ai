// Parsing layer
// Phase 3+: PDF text extraction, OCR, clause segmentation, chunk splitting

export type ParseJob = {
  storagePath: string
  mimeType: string
  documentId: string
  matterId: string
}

export type ParsedChunk = {
  text: string
  index: number
  pageRef?: number
  tokenCount?: number
}

export type ParseResult = {
  chunks: ParsedChunk[]
  pageCount?: number
  wordCount?: number
  metadata: Record<string, unknown>
}

/** Extract text and segment into chunks for embedding. Phase 3 implementation pending. */
export async function parseDocument(
  _job: ParseJob
): Promise<ParseResult | null> {
  return null
}
