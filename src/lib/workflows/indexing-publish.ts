/**
 * Pure helpers for atomic reindex publish: keep a prior retrieval-ready index
 * searchable until a replacement run successfully embeds and swaps publishedRunId.
 */

/** True when a document already has a live published generation to preserve. */
export function shouldPreservePublishedIndex(doc: {
  publishedRunId?: string | null
  retrievalStatus?: string | null
}): boolean {
  return Boolean(doc.publishedRunId) && doc.retrievalStatus === "ready"
}

/**
 * Chunk filter for workstation / inspection UIs.
 * Prefer the published generation so mid-reindex staging rows stay hidden.
 * Fall back to the active run (first-time indexing) when nothing is published.
 */
export function inspectionChunkWhere(doc: {
  id: string
  publishedRunId?: string | null
  indexingRunId?: string | null
}): { documentId: string; indexingRunId?: string } {
  if (doc.publishedRunId) {
    return { documentId: doc.id, indexingRunId: doc.publishedRunId }
  }
  if (doc.indexingRunId) {
    return { documentId: doc.id, indexingRunId: doc.indexingRunId }
  }
  return { documentId: doc.id }
}

/**
 * Intermediate pipeline stages must not overwrite Document.chunkCount while a
 * published generation is still live — only publish (or first-time stage) may.
 */
export function shouldStageChunkCount(preservePublished: boolean): boolean {
  return !preservePublished
}
