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

export function chunkDocument(
  text: string,
  headings: string[],
  pageCount: number,
  options: { chunkSize?: number; overlap?: number } = {}
): Chunk[] {
  const chunkTokens = options.chunkSize ?? DEFAULT_CHUNK_TOKENS
  const overlapTokens = options.overlap ?? DEFAULT_OVERLAP_TOKENS
  const charBudget = chunkTokens * AVG_CHARS_PER_TOKEN
  const overlapChars = overlapTokens * AVG_CHARS_PER_TOKEN

  // Split on double newlines (paragraph/clause boundaries)
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 15)

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
    // Update heading context
    const isHeading = headings.includes(para)
    if (isHeading) currentHeading = para

    const wouldExceed = buffer.length + para.length + 2 > charBudget

    if (wouldExceed && buffer.length > 0 && !endsInCitation(buffer)) {
      flush()
      totalCharsConsumed += buffer.length
      // Carry overlap window into next chunk
      const words = buffer.split(/\s+/)
      const overlapWords = Math.ceil(overlapChars / 6) // avg 6 chars/word
      buffer = words.slice(-overlapWords).join(" ") + "\n\n" + para
    } else {
      buffer = buffer ? buffer + "\n\n" + para : para
    }
  }

  flush()
  return chunks
}
