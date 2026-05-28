// Semantic retrieval — matter-scoped pgvector cosine similarity search
// Retrieval NEVER crosses matter boundaries.

import { prisma } from "@/lib/prisma"
import { generateEmbedding } from "@/lib/ai/embeddings"

export type RetrievedChunk = {
  id: string
  documentId: string
  matterId: string
  content: string
  chunkIndex: number
  pageRef: number | null
  headingPath: string | null
  distance: number
  fileName: string
}

export type SearchOptions = {
  topK?: number
  distanceThreshold?: number
  documentIds?: string[]
}

/**
 * Embed query then retrieve top-k chunks scoped to a single matter.
 * Raises if OPENAI_API_KEY is not set.
 */
export async function semanticSearch(
  query: string,
  matterId: string,
  options: SearchOptions = {}
): Promise<RetrievedChunk[]> {
  const embedding = await generateEmbedding(query)
  return retrieveByEmbedding(embedding, matterId, options)
}

/**
 * Raw vector retrieval — accepts a pre-computed embedding.
 * Matter isolation is enforced at the SQL level.
 */
export async function retrieveByEmbedding(
  embedding: number[],
  matterId: string,
  options: SearchOptions = {}
): Promise<RetrievedChunk[]> {
  const topK = options.topK ?? 6
  const threshold = options.distanceThreshold ?? 0.8 // cosine distance (lower = closer)
  const vectorLiteral = `[${embedding.join(",")}]`

  type Row = RetrievedChunk & { distance: number }

  let rows: Row[]

  if (options.documentIds?.length) {
    rows = await prisma.$queryRaw<Row[]>`
      SELECT
        dc.id,
        dc."documentId",
        dc."matterId",
        dc.content,
        dc."chunkIndex",
        dc."pageRef",
        dc."headingPath",
        d."fileName",
        (dc.embedding <=> ${vectorLiteral}::vector) AS distance
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d.id = dc."documentId"
      WHERE dc."matterId" = ${matterId}
        AND dc."documentId" = ANY(${options.documentIds}::text[])
        AND dc.embedding IS NOT NULL
        AND (dc.embedding <=> ${vectorLiteral}::vector) < ${threshold}
      ORDER BY distance ASC
      LIMIT ${topK}
    `
  } else {
    rows = await prisma.$queryRaw<Row[]>`
      SELECT
        dc.id,
        dc."documentId",
        dc."matterId",
        dc.content,
        dc."chunkIndex",
        dc."pageRef",
        dc."headingPath",
        d."fileName",
        (dc.embedding <=> ${vectorLiteral}::vector) AS distance
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d.id = dc."documentId"
      WHERE dc."matterId" = ${matterId}
        AND dc.embedding IS NOT NULL
        AND (dc.embedding <=> ${vectorLiteral}::vector) < ${threshold}
      ORDER BY distance ASC
      LIMIT ${topK}
    `
  }

  return rows.map((r) => ({ ...r, distance: Number(r.distance) }))
}

/** Returns count of indexed (embedded) chunks for a matter. */
export async function indexedChunkCount(matterId: string): Promise<number> {
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) AS count
    FROM "DocumentChunk"
    WHERE "matterId" = ${matterId}
      AND embedding IS NOT NULL
  `
  return Number(result[0]?.count ?? 0)
}
