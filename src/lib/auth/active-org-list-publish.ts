/**
 * Final gate before serializing active-organization list/registry pages.
 *
 * Membership alone is insufficient: a concurrent workspace switch can leave
 * the actor still a member of the gathered org while shell chrome now reflects
 * a different `activeOrganizationId`. Fail closed unless the locked active
 * pointer still matches the gathered organization.
 *
 * When no organization was gathered, publish only for true personal/empty
 * workspaces. If the actor still has memberships, a null gather means active
 * repair failed and must not broaden list props across orgs.
 */
export function decideActiveOrganizationListPublish(args: {
  gatheredOrganizationId: string | null | undefined
  lockedActiveOrganizationId: string | null | undefined
  membershipOk: boolean
  hasVerifiedMemberships?: boolean
}): boolean {
  if (!args.gatheredOrganizationId) {
    if (args.hasVerifiedMemberships) return false
    return args.membershipOk
  }
  return (
    args.membershipOk &&
    args.lockedActiveOrganizationId === args.gatheredOrganizationId
  )
}
