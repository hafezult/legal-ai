/**
 * Whether the actor can write on a matter listed under the active org surface.
 * Org matters follow the active-org role; legacy personal matters grant the
 * creator owner-equivalent write even when the active org role is viewer.
 */
export function canWriteListedMatter(
  matter: { userId: string | null; organizationId: string | null },
  actorUserId: string,
  activeOrgCanWrite: boolean
): boolean {
  if (matter.organizationId === null) {
    return Boolean(matter.userId && matter.userId === actorUserId)
  }
  return activeOrgCanWrite
}
