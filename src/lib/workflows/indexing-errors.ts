/** Thrown when another non-stale pipeline claim already holds the document. */
export class IndexingInProgressError extends Error {
  readonly documentId: string

  constructor(documentId: string) {
    super(
      `Document ${documentId}: indexing already in progress. Retry after it finishes or stalls.`
    )
    this.name = "IndexingInProgressError"
    this.documentId = documentId
  }
}

/** Thrown when a newer claim superseded this run mid-pipeline. */
export class IndexingRunSupersededError extends Error {
  readonly documentId: string
  readonly runId: string

  constructor(documentId: string, runId: string) {
    super(
      `Document ${documentId}: indexing run ${runId} was superseded by a newer claim.`
    )
    this.name = "IndexingRunSupersededError"
    this.documentId = documentId
    this.runId = runId
  }
}

export function isIndexingInProgressError(
  error: unknown
): error is IndexingInProgressError {
  return (
    error instanceof IndexingInProgressError ||
    (error instanceof Error && error.name === "IndexingInProgressError")
  )
}

export function isIndexingRunSupersededError(
  error: unknown
): error is IndexingRunSupersededError {
  return (
    error instanceof IndexingRunSupersededError ||
    (error instanceof Error && error.name === "IndexingRunSupersededError")
  )
}
