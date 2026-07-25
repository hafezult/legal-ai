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
