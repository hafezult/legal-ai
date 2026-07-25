/**
 * Invite Accept/Decline UI must run before email auto-accept claims the row.
 * Middleware stamps this header on `/app/invites/*` so the platform layout
 * can upsert the user without consuming pending invites.
 */

export const SKIP_INVITE_AUTO_ACCEPT_HEADER = "x-aether-skip-invite-auto-accept"

export function shouldAcceptPendingInvites(options?: {
  acceptPendingInvites?: boolean
}): boolean {
  return options?.acceptPendingInvites !== false
}

export function shouldSkipInviteAutoAccept(headerValue: string | null): boolean {
  return headerValue === "1"
}
