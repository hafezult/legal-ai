/** Documents that should expose a re-index retry control. */
export function documentNeedsRetry(doc: {
  indexingStatus: string
  retrievalStatus: string
}): boolean {
  return doc.indexingStatus === "failed" || doc.retrievalStatus === "failed"
}
