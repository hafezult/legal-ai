/**
 * Prisma `where` clause for matters the user may access.
 * Legacy personal matters (no organizationId) remain creator-scoped.
 * Organization matters require current membership — creators who are
 * removed or demoted no longer bypass org RBAC via the userId fallback.
 */
export function matterAccessWhere(userId: string) {
  return {
    OR: [
      { userId, organizationId: null },
      { organization: { members: { some: { userId } } } },
    ],
  }
}

/**
 * Matters visible in the user's active organization workspace.
 * Includes matters attached to that org, plus legacy creator-owned matters
 * with no organizationId (pre-RBAC personal workspaces).
 */
export function matterAccessWhereForActiveOrg(
  userId: string,
  organizationId: string | null | undefined
) {
  if (!organizationId) {
    return matterAccessWhere(userId)
  }

  return {
    AND: [
      matterAccessWhere(userId),
      {
        OR: [
          { organizationId },
          { userId, organizationId: null },
        ],
      },
    ],
  }
}
