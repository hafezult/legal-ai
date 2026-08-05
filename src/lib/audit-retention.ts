/** Default retention for workspace audit rows (configurable retention UI is roadmap). */
export const DEFAULT_AUDIT_RETENTION_DAYS = 365

/** Cap rows deleted per purge pass so a catch-up cannot lock the table. */
export const AUDIT_PURGE_BATCH_SIZE = 2_000

/** In-process cooldown between opportunistic purge attempts. */
export const AUDIT_PURGE_COOLDOWN_MS = 60 * 60 * 1000

/** Cutoff timestamp for the retention window. */
export function auditRetentionCutoff(
  now: Date = new Date(),
  retentionDays: number = DEFAULT_AUDIT_RETENTION_DAYS
): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
}

let lastAuditPurgeAt = 0

/** Test helper — reset opportunistic purge throttle. */
export function resetAuditPurgeThrottleForTests(): void {
  lastAuditPurgeAt = 0
}

/**
 * Returns true when an opportunistic purge may run, then stamps the cooldown.
 * Pure throttle — callers still perform the delete.
 */
export function claimAuditPurgeSlot(nowMs: number = Date.now()): boolean {
  if (nowMs - lastAuditPurgeAt < AUDIT_PURGE_COOLDOWN_MS) return false
  lastAuditPurgeAt = nowMs
  return true
}
