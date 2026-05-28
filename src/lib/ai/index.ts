// AI intelligence layer
// Phase 3+: embeddings, LLM orchestration, multi-agent reasoning graphs

export type EmbeddingJob = {
  documentId: string
  matterId: string
  chunks: string[]
  model?: string
}

export type EmbeddingResult = {
  documentId: string
  chunkCount: number
  status: "queued" | "complete" | "failed"
}

/** Schedule a document's chunks for embedding. Phase 3 implementation pending. */
export async function scheduleEmbedding(
  _job: EmbeddingJob
): Promise<EmbeddingResult> {
  return { documentId: _job.documentId, chunkCount: 0, status: "queued" }
}
