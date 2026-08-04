import { verifiedClerkEmailMatches } from "@/lib/auth/clerk-email"

/**
 * Invite metadata safe to show on the accept page after the signed-in account
 * matches the invite target. Callers must load this from a fresh DB read that
 * happens after identity verification — never from a pre-identity snapshot.
 */
export type InviteAcceptPublishRow = {
  email: string
  role: string
  expiresAt: Date
  acceptedAt: Date | null
  organizationName: string
}

export type InviteAcceptPublishDecision =
  | { kind: "unavailable" }
  | { kind: "publish"; invite: InviteAcceptPublishRow }

/**
 * Final publish gate for invite accept UI metadata.
 *
 * After the actor's verified emails match the invite target, only a fresh
 * invite row may supply organization name / role / expiry. A concurrent
 * revoke, accept, or email-target change during identity lookup must not keep
 * stale labels on the page.
 */
export function decideInviteAcceptPublish(args: {
  verifiedEmails: readonly string[]
  freshInvite: InviteAcceptPublishRow | null
}): InviteAcceptPublishDecision {
  if (!args.freshInvite) return { kind: "unavailable" }
  if (
    !verifiedClerkEmailMatches(args.verifiedEmails, args.freshInvite.email)
  ) {
    // Target rotated away from this account — do not reveal the new target or
    // keep the pre-identity organization label.
    return { kind: "unavailable" }
  }
  return { kind: "publish", invite: args.freshInvite }
}
