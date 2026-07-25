// Legal document chunking — preserves clause continuity, avoids splitting citations

export type Chunk = {
  content: string
  chunkIndex: number
  tokenCount: number
  pageRef: number | null
  headingPath: string | null
}

// ~4 chars per token (GPT tokeniser approximation)
const AVG_CHARS_PER_TOKEN = 4
const DEFAULT_CHUNK_TOKENS = 400
const DEFAULT_OVERLAP_TOKENS = 60
/** Hard cap so a pathological extraction cannot flood embeddings/prompts. */
export const MAX_CHUNKS_PER_DOCUMENT = 400

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN)
}

/**
 * Regex patterns for legal citation fragments that must not be split mid-sentence.
 * If a paragraph boundary falls mid-citation, absorb into the current chunk.
 */
const CITATION_PATTERN =
  /\[\d{4}\]|\(\d{4}\)|CPR\s+\d+|s\.\s*\d+|para\.?\s*\d+|Art\.?\s*\d+/i

function endsInCitation(text: string): boolean {
  const tail = text.slice(-120)
  return CITATION_PATTERN.test(tail)
}

/**
 * Split an oversized paragraph/clause into segments that fit the char budget.
 * Prefer sentence boundaries; fall back to hard character cuts.
 */
export function splitOversizedParagraph(
  paragraph: string,
  charBudget: number
): string[] {
  if (paragraph.length <= charBudget) return [paragraph]

  const segments: string[] = []
  let remaining = paragraph

  while (remaining.length > charBudget) {
    const window = remaining.slice(0, charBudget)
    const sentenceBreak = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf(".\n"),
      window.lastIndexOf("? "),
      window.lastIndexOf("! ")
    )
    const spaceBreak = window.lastIndexOf(" ")
    let cut =
      sentenceBreak >= Math.floor(charBudget * 0.4)
        ? sentenceBreak + 1
        : spaceBreak >= Math.floor(charBudget * 0.4)
          ? spaceBreak
          : charBudget

    const piece = remaining.slice(0, cut).trim()
    if (piece) segments.push(piece)
    remaining = remaining.slice(cut).trim()
  }

  if (remaining) segments.push(remaining)
  return segments.length > 0 ? segments : [paragraph.slice(0, charBudget)]
}

export function chunkDocument(
  text: string,
  headings: string[],
  pageCount: number,
  options: {
    chunkSize?: number
    overlap?: number
    maxChunks?: number
  } = {}
): Chunk[] {
  const chunkTokens = options.chunkSize ?? DEFAULT_CHUNK_TOKENS
  const overlapTokens = options.overlap ?? DEFAULT_OVERLAP_TOKENS
  const maxChunks = options.maxChunks ?? MAX_CHUNKS_PER_DOCUMENT
  const charBudget = chunkTokens * AVG_CHARS_PER_TOKEN
  const overlapChars = overlapTokens * AVG_CHARS_PER_TOKEN

  // Split on double newlines (paragraph/clause boundaries), then hard-split
  // any single paragraph that still exceeds the chunk budget.
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 15)
    .flatMap((p) => splitOversizedParagraph(p, charBudget))

  const chunks: Chunk[] = []
  let buffer = ""
  let currentHeading: string | null = headings[0] ?? null
  let totalCharsConsumed = 0

  const flush = () => {
    if (!buffer.trim()) return
    const pageRef =
      pageCount > 1
        ? Math.min(
            pageCount,
            Math.ceil((totalCharsConsumed / Math.max(text.length, 1)) * pageCount) + 1
          )
        : null
    chunks.push({
      content: buffer.trim(),
      chunkIndex: chunks.length,
      tokenCount: estimateTokens(buffer),
      pageRef,
      headingPath: currentHeading,
    })
  }

  for (const para of paragraphs) {
    if (chunks.length >= maxChunks) break

    // Update heading context
    const isHeading = headings.includes(para)
    if (isHeading) currentHeading = para

    const wouldExceed = buffer.length + para.length + 2 > charBudget

    if (wouldExceed && buffer.length > 0 && !endsInCitation(buffer)) {
      flush()
      if (chunks.length >= maxChunks) {
        buffer = ""
        break
      }
      // Carry overlap into the next chunk, but only advance page progress by
      // the unique portion so overlap is not double-counted in pageRef.
      const words = buffer.split(/\s+/)
      const overlapWords = Math.ceil(overlapChars / 6) // avg 6 chars/word
      const overlap = words.slice(-overlapWords).join(" ")
      totalCharsConsumed += Math.max(0, buffer.length - overlap.length)
      buffer = overlap ? `${overlap}\n\n${para}` : para
    } else {
      buffer = buffer ? buffer + "\n\n" + para : para
    }
  }

  if (chunks.length < maxChunks) flush()

  // Guarantee no chunk exceeds the budget even if citation absorption grew it.
  return chunks
    .flatMap((chunk) => {
      if (chunk.content.length <= charBudget * 1.25) return [chunk]
      return splitOversizedParagraph(chunk.content, charBudget).map((content) => ({
        content,
        chunkIndex: 0,
        tokenCount: estimateTokens(content),
        pageRef: chunk.pageRef,
        headingPath: chunk.headingPath,
      }))
    })
    .slice(0, maxChunks)
    .map((chunk, index) => ({ ...chunk, chunkIndex: index }))
}
