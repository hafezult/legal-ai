// AI intelligence layer public entrypoint.

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

/** Generate embeddings for a document's chunks using the configured provider. */
export async function scheduleEmbedding(job: EmbeddingJob): Promise<EmbeddingResult> {
  if (!isEmbeddingConfigured()) {
    return { documentId: job.documentId, chunkCount: 0, status: "failed" }
  }

  try {
    const embeddings = await generateBatchEmbeddings(
      job.chunks,
      job.model ? { model: job.model } : {}
    )

    return {
      documentId: job.documentId,
      chunkCount: embeddings.length,
      status: "complete",
    }
  } catch {
    return { documentId: job.documentId, chunkCount: 0, status: "failed" }
  }
}
