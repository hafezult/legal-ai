// Retrieval layer facade for matter-scoped search and citation shaping.

import { indexedChunkCount, semanticSearch } from "@/lib/retrieval/search"

export type RetrievalQuery = {
  query: string
  matterId: string
  topK?: number
  jurisdictionFilter?: string
}

export type RetrievalResult = {
  excerpt: string
  documentId: string
  fileName: string
  score: number
  citation: string
  pageRef?: number
}

export async function retrieveChunks(
  query: RetrievalQuery
): Promise<RetrievalResult[]> {
  const chunks = await semanticSearch(query.query, query.matterId, {
    topK: query.topK,
  })

  return chunks.map((chunk) => ({
    excerpt: chunk.content,
    documentId: chunk.documentId,
    fileName: chunk.fileName,
    score: Math.max(0, 1 - chunk.distance),
    citation: chunk.pageRef ? `${chunk.fileName}, p. ${chunk.pageRef}` : chunk.fileName,
    pageRef: chunk.pageRef ?? undefined,
  }))
}

/** Check whether a matter has sufficient indexed sources for retrieval. */
export async function retrievalReady(matterId: string): Promise<boolean> {
  return (await indexedChunkCount(matterId)) > 0
}
