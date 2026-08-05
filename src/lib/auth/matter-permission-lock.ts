/**
 * Pure helpers for locked matter permission evaluation.
 * Keep free of local/path-alias imports so node:test can load this module
 * under --experimental-strip-types (same constraint as work-product-delete).
 */

const ORG_ROLES = ["viewer", "member", "admin", "owner"] as const
export type LockedOrgRole = (typeof ORG_ROLES)[number]

export type LockedOrgPermission = "read" | "write" | "delete" | "manage_members"

const ROLE_PERMISSIONS: Record<LockedOrgRole, ReadonlySet<LockedOrgPermission>> = {
  viewer: new Set(["read"]),
  member: new Set(["read", "write"]),
  admin: new Set(["read", "write", "delete", "manage_members"]),
  owner: new Set(["read", "write", "delete", "manage_members"]),
}

function isLockedOrgRole(value: string): value is LockedOrgRole {
  return (ORG_ROLES as readonly string[]).includes(value)
}

/**
 * Derive the effective matter role after the caller's transaction has locked
 * the Matter row and (for org matters) the OrganizationMember row.
 */
export function resolveMatterRoleFromLockedMembership(args: {
  organizationId: string | null
  isCreator: boolean
  membershipRole: string | null | undefined
}): LockedOrgRole | null {
  const membership =
    args.membershipRole && isLockedOrgRole(args.membershipRole)
      ? args.membershipRole
      : null

  if (args.organizationId) {
    return membership
  }

  return args.isCreator ? "owner" : membership
}

/** True when the locked role satisfies the requested permission. */
export function lockedMatterRoleAllows(
  role: LockedOrgRole | null,
  permission: LockedOrgPermission
): boolean {
  return Boolean(role && ROLE_PERMISSIONS[role].has(permission))
}
