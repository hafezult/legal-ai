/**
 * Pure audit-label helper for matter deletes.
 *
 * After the delete reauth under Matter FOR UPDATE, only labels re-read in that
 * same transaction may be written to the org audit trail. Pre-lock snapshots
 * are probes and must not echo rename-stale titles after the final permission
 * check.
 */
export function resolveMatterDeleteAuditLabels(args: {
  lockedTitle: string | null | undefined
  lockedDocumentCount: number | null | undefined
  lockedOrganizationId: string | null | undefined
}):
  | {
      title: string
      documentCount: number
      organizationId: string | null
    }
  | null {
  if (typeof args.lockedTitle !== "string") return null
  if (
    typeof args.lockedDocumentCount !== "number" ||
    !Number.isFinite(args.lockedDocumentCount) ||
    args.lockedDocumentCount < 0
  ) {
    return null
  }
  if (
    args.lockedOrganizationId !== null &&
    args.lockedOrganizationId !== undefined &&
    typeof args.lockedOrganizationId !== "string"
  ) {
    return null
  }
  return {
    title: args.lockedTitle,
    documentCount: args.lockedDocumentCount,
    organizationId:
      typeof args.lockedOrganizationId === "string"
        ? args.lockedOrganizationId
        : null,
  }
}
