/** Cap expired invite rows deleted per opportunistic purge pass. */
export const INVITE_PURGE_BATCH_SIZE = 500

/** In-process cooldown between expired-invite purge attempts. */
export const INVITE_PURGE_COOLDOWN_MS = 60 * 60 * 1000

/** Pending organization invites expire after 14 days. */
export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14

/** Absolute expiry timestamp for a newly issued / refreshed invite. */
export function inviteExpiryDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_MS)
}

let lastInvitePurgeAt = 0

/** Test helper — reset opportunistic invite purge throttle. */
export function resetInvitePurgeThrottleForTests(): void {
  lastInvitePurgeAt = 0
}

/**
 * Returns true when an opportunistic expired-invite purge may run, then stamps
 * the cooldown. Pure throttle — callers still perform the delete.
 */
export function claimInvitePurgeSlot(nowMs: number = Date.now()): boolean {
  if (nowMs - lastInvitePurgeAt < INVITE_PURGE_COOLDOWN_MS) return false
  lastInvitePurgeAt = nowMs
  return true
}
