/**
 * Final publish gate for the document workstation after unlocked embedding probes.
 *
 * Membership alone is insufficient: the document row must still be live
 * (parity with the content proxy), and matter labels must come from the
 * locked re-read in the same transaction.
 *
 * Research sessions co-serialized on this page are a separate work-product
 * class — use `selectLiveWorkstationResearchSessions` with rows re-confirmed
 * under the same final matter lock so tombstoned queries/excerpts cannot ship
 * from the first-lock snapshot after the unlocked embedding probe.
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

/**
 * Research co-serialized on the document workstation after unlocked probes.
 *
 * Only sessions re-confirmed under the final matter lock may ship query /
 * citation excerpts (parity with restore/deep-link work-product liveness).
 * Tombstoned sessions from the first-lock snapshot are omitted — document
 * publish may still succeed when the source row remains live.
 */
export function selectLiveWorkstationResearchSessions<T extends { id: string }>(args: {
  documentPresent: boolean
  lockedSessions: readonly T[]
}): T[] {
  if (!args.documentPresent) return []
  return args.lockedSessions.slice()
}
