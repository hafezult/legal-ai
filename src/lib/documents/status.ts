/** Documents that should expose a re-index retry control. */
export function documentNeedsRetry(doc: {
  indexingStatus: string
  retrievalStatus: string
}): boolean {
  if (doc.indexingStatus === "failed" || doc.retrievalStatus === "failed") {
    return true
  }

  // Parsed/chunked without embeddings (e.g. OPENAI_API_KEY was unset).
  // Surfaces Retry once a key is configured so lists match the workstation.
  return doc.indexingStatus === "indexed" && doc.retrievalStatus === "pending"
}
