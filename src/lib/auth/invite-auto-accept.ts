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
  /** Middleware stamp from `/app/invites/*` — always wins over opt-in. */
  skipHeader?: string | null
}): boolean {
  if (options?.acceptPendingInvites !== true) return false
  if (shouldSkipInviteAutoAccept(options.skipHeader ?? null)) return false
  return true
}

export function shouldSkipInviteAutoAccept(headerValue: string | null): boolean {
  return headerValue === "1"
}
