const RETRYABLE_IN_PROGRESS = new Set([
  "pending",
  "parsing",
  "chunking",
  "embedding",
])

/** Actively claimed pipeline stages (excludes queued `pending`). */
const ACTIVE_INDEXING = new Set(["parsing", "chunking", "embedding"])

/** Minutes after which an in-progress indexing status is treated as stuck. */
export const STALE_INDEXING_MS = 10 * 60 * 1000

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

/** True when a non-stale claim is actively running the indexing pipeline. */
export function documentIndexingBusy(
  doc: {
    indexingStatus: string
    updatedAt?: Date | string | null
  },
  now: Date = new Date()
): boolean {
  if (!ACTIVE_INDEXING.has(doc.indexingStatus)) return false
  const updatedAt = asDate(doc.updatedAt)
  if (!updatedAt) return true
  return now.getTime() - updatedAt.getTime() < STALE_INDEXING_MS
}

/** Documents that should expose a re-index retry control. */
export function documentNeedsRetry(
  doc: {
    indexingStatus: string
    retrievalStatus: string
    updatedAt?: Date | string | null
  },
  now: Date = new Date()
): boolean {
  if (doc.indexingStatus === "failed" || doc.retrievalStatus === "failed") {
    return true
  }

  // Parsed/chunked without embeddings (e.g. OPENAI_API_KEY was unset).
  // Surfaces Retry once a key is configured so lists match the workstation.
  if (doc.indexingStatus === "indexed" && doc.retrievalStatus === "pending") {
    return true
  }

  // Crash/timeout mid-pipeline leaves parsing/chunking/embedding forever.
  // After the stale window, treat as retryable so lists match workstation reindex.
  if (RETRYABLE_IN_PROGRESS.has(doc.indexingStatus)) {
    const updatedAt = asDate(doc.updatedAt)
    if (updatedAt && now.getTime() - updatedAt.getTime() >= STALE_INDEXING_MS) {
      return true
    }
  }

  return false
}
