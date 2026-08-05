/**
 * Final gate before inserting a matter into the gathered active organization.
 *
 * Membership write permission alone is insufficient: a concurrent workspace
 * switch can leave the actor still a member of the gathered org while
 * `User.activeOrganizationId` now points elsewhere. Fail closed unless the
 * locked active pointer still matches the create target.
 */
export function decideMatterCreateActiveOrg(args: {
  targetOrganizationId: string
  lockedActiveOrganizationId: string | null | undefined
  membershipWriteOk: boolean
}): boolean {
  return (
    args.membershipWriteOk &&
    Boolean(args.targetOrganizationId) &&
    args.lockedActiveOrganizationId === args.targetOrganizationId
  )
}
