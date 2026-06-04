// AI intelligence layer facade.

import { generateBatchEmbeddings } from "./embeddings"

export {
  DEFAULT_CONFIG,
  generateBatchEmbeddings,
  generateEmbedding,
  isEmbeddingConfigured,
  type EmbeddingConfig,
  type EmbeddingProvider,
} from "./embeddings"

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

/** Generate embeddings for a document-sized chunk batch. Persistence is handled by the indexing workflow. */
export async function scheduleEmbedding(job: EmbeddingJob): Promise<EmbeddingResult> {
  try {
    await generateBatchEmbeddings(job.chunks, job.model ? { model: job.model } : {})
    return { documentId: job.documentId, chunkCount: job.chunks.length, status: "complete" }
  } catch {
    return { documentId: job.documentId, chunkCount: 0, status: "failed" }
  }
}
