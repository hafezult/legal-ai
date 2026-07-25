/**
 * Membership requires explicit Accept on `/app/invites/[token]`.
 * Silent email auto-accept is opt-in only (off by default) so Decline cannot
 * be bypassed by visiting another `/app` route first.
 *
 * Middleware still stamps this header on `/app/invites/*` as defense in depth
 * if a caller re-enables auto-accept on the platform layout.
 */

export const SKIP_INVITE_AUTO_ACCEPT_HEADER = "x-aether-skip-invite-auto-accept"

export function shouldAcceptPendingInvites(options?: {
  acceptPendingInvites?: boolean
}): boolean {
  return options?.acceptPendingInvites === true
}

export function shouldSkipInviteAutoAccept(headerValue: string | null): boolean {
  return headerValue === "1"
}
