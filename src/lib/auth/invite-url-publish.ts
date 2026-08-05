/**
 * Final gate before returning a raw invite acceptance URL to an admin UI.
 *
 * Callers must evaluate these flags from a locked re-read after mint/rotate
 * side effects (email / audit / revalidate). Authority alone is not enough —
 * a peer revoke can leave the actor still able to mint that role while the
 * specific token is already dead.
 */
export function decideInviteUrlPublish(args: {
  actorCanAuthorize: boolean
  inviteStillPending: boolean
  inviteRoleMatches: boolean
}): boolean {
  return (
    args.actorCanAuthorize &&
    args.inviteStillPending &&
    args.inviteRoleMatches
  )
}
