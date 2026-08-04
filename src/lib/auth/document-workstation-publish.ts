/**
 * Final publish gate for the document workstation after unlocked embedding probes.
 *
 * Membership alone is insufficient: the document row must still be live
 * (parity with the content proxy), and matter labels must come from the
 * locked re-read in the same transaction.
 */
export function decideDocumentWorkstationPublish(args: {
  permissionOk: boolean
  hasPublishRole: boolean
  documentPresent: boolean
  lockedTitle: string | null | undefined
  lockedClientName: string | null | undefined
}):
  | { ok: true; matterTitle: string; matterClient: string | null }
  | { ok: false } {
  if (!args.permissionOk || !args.hasPublishRole || !args.documentPresent) {
    return { ok: false }
  }
  if (typeof args.lockedTitle !== "string") return { ok: false }
  return {
    ok: true,
    matterTitle: args.lockedTitle,
    matterClient:
      typeof args.lockedClientName === "string" ? args.lockedClientName : null,
  }
}
