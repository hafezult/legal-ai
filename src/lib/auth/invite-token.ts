/** Invite tokens are 24 random bytes encoded as 48 hex chars. */
export function isInviteTokenShape(token: string): boolean {
  return /^[a-f0-9]{48}$/i.test(token)
}
