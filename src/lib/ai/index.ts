// AI intelligence layer facade.

import { generateBatchEmbeddings, isEmbeddingConfigured } from "@/lib/ai/embeddings"

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

export async function scheduleEmbedding(
  job: EmbeddingJob
): Promise<EmbeddingResult> {
  if (!isEmbeddingConfigured()) {
    return { documentId: job.documentId, chunkCount: job.chunks.length, status: "failed" }
  }

  try {
    await generateBatchEmbeddings(job.chunks, job.model ? { model: job.model } : {})
    return { documentId: job.documentId, chunkCount: job.chunks.length, status: "complete" }
  } catch {
    return { documentId: job.documentId, chunkCount: job.chunks.length, status: "failed" }
  }
}
