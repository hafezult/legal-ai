/**
 * Final gate before serializing active-organization list/registry pages.
 *
 * Membership alone is insufficient: a concurrent workspace switch can leave
 * the actor still a member of the gathered org while shell chrome now reflects
 * a different `activeOrganizationId`. Fail closed unless the locked active
 * pointer still matches the gathered organization.
 *
 * When no organization was gathered (personal / empty workspace), there is
 * nothing to mismatch against — membershipOk alone decides publish.
 */
export function decideActiveOrganizationListPublish(args: {
  gatheredOrganizationId: string | null | undefined
  lockedActiveOrganizationId: string | null | undefined
  membershipOk: boolean
}): boolean {
  if (!args.gatheredOrganizationId) {
    return args.membershipOk
  }
  return (
    args.membershipOk &&
    args.lockedActiveOrganizationId === args.gatheredOrganizationId
  )
}
