/**
 * Pure audit-label helpers for document delete / reindex events.
 *
 * After Matter FOR UPDATE reauth, only labels re-read under that lock may be
 * written to the org audit trail. Pre-lock / pre-long-work document probes are
 * authorization gates and must not echo rename-stale file names after the
 * final permission check (parity with resolveMatterDeleteAuditLabels).
 */

export function resolveDocumentDeleteAuditLabels(args: {
  lockedFileName: string | null | undefined
  lockedStoragePath: string | null | undefined
}): { fileName: string; storagePath: string | null } | null {
  if (typeof args.lockedFileName !== "string" || !args.lockedFileName) {
    return null
  }
  if (
    args.lockedStoragePath !== null &&
    args.lockedStoragePath !== undefined &&
    typeof args.lockedStoragePath !== "string"
  ) {
    return null
  }
  return {
    fileName: args.lockedFileName,
    storagePath:
      typeof args.lockedStoragePath === "string" ? args.lockedStoragePath : null,
  }
}

export function resolveDocumentReindexAuditLabels(args: {
  lockedFileName: string | null | undefined
}): { fileName: string } | null {
  if (typeof args.lockedFileName !== "string" || !args.lockedFileName) {
    return null
  }
  return { fileName: args.lockedFileName }
}
