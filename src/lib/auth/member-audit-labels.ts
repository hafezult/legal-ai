/**
 * Pure audit-label helper for organization member role/remove events.
 *
 * After Org FOR UPDATE reauth + CAS on the target membership, only labels
 * re-read under that lock (and the target User FOR UPDATE lock for email)
 * may be written to the org audit trail. Pre-lock membership probes are
 * authorization gates and must not echo concurrent role/email changes.
 */
export function resolveMemberAuditLabels(args: {
  lockedPreviousRole: string | null | undefined
  lockedEmail: string | null | undefined
}): { previousRole: string; email: string } | null {
  if (typeof args.lockedPreviousRole !== "string" || !args.lockedPreviousRole) {
    return null
  }
  if (typeof args.lockedEmail !== "string" || !args.lockedEmail) {
    return null
  }
  return {
    previousRole: args.lockedPreviousRole,
    email: args.lockedEmail,
  }
}
