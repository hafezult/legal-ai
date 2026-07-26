/**
 * Shared sliding-window keys so related mutations cannot be burst across
 * per-action buckets (e.g. matter-delete + draft-delete + document-delete).
 */

export function destructiveMutationKey(userId: string): string {
  return `destructive:${userId}`
}

export function orgAdminMutationKey(userId: string): string {
  return `org-admin:${userId}`
}

export function inviteDecisionKey(userId: string): string {
  return `invite-decision:${userId}`
}
