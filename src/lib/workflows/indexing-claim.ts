/**
 * Pure helpers for indexing lease handoff between authorized claim sites and
 * the in-process pipeline runner.
 */

/** Lease acquired by claimDocumentForIndexing (or a transactional variant). */
export type IndexingClaim = {
  runId: string
  preservePublished: boolean
}

/**
 * Prefer a pre-authorized lease so callers that claimed under matter/member
 * locks do not perform a second unscoped claim after the transaction commits.
 */
export function resolvePipelineClaim(
  preclaimed: IndexingClaim | undefined,
  acquired: IndexingClaim | null
): IndexingClaim | null {
  return preclaimed ?? acquired
}
