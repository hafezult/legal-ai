/** Cap expired invite rows deleted per opportunistic purge pass. */
export const INVITE_PURGE_BATCH_SIZE = 500

/** In-process cooldown between expired-invite purge attempts. */
export const INVITE_PURGE_COOLDOWN_MS = 60 * 60 * 1000

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
