// Retrieval layer
// Phase 3+: pgvector similarity search, RAG pipelines, citation grounding

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

/** Vector similarity search against indexed matter documents. Phase 3 implementation pending. */
export async function retrieveChunks(
  _query: RetrievalQuery
): Promise<RetrievalResult[]> {
  return []
}

/** Check whether a matter has sufficient indexed sources for retrieval. */
export async function retrievalReady(matterId: string): Promise<boolean> {
  // Phase 3: query pgvector index for indexed chunks matching matterId
  void matterId
  return false
}
