/** Organization membership roles, ordered from least to most privileged. */
export const ORG_ROLES = ["viewer", "member", "admin", "owner"] as const
export type OrgRole = (typeof ORG_ROLES)[number]

export type OrgPermission =
  | "read"
  | "write"
  | "delete"
  | "manage_members"

const ROLE_RANK: Record<OrgRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
}

const ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<OrgPermission>> = {
  viewer: new Set(["read"]),
  member: new Set(["read", "write"]),
  admin: new Set(["read", "write", "delete", "manage_members"]),
  owner: new Set(["read", "write", "delete", "manage_members"]),
}

export function isOrgRole(value: string): value is OrgRole {
  return (ORG_ROLES as readonly string[]).includes(value)
}

export function roleAtLeast(role: OrgRole, minimum: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum]
}

/** True when the actor outranks the target (strictly greater privilege). */
export function roleStrictlyAbove(actor: OrgRole, target: OrgRole): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target]
}

export function roleHasPermission(role: OrgRole, permission: OrgPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission)
}

/**
 * True when an issuer at `inviterRole` may still authorize acceptance of an
 * invite granting `inviteRole`. Demoted/removed issuers fail closed so a
 * stale link cannot expand membership after mint authority was revoked.
 */
export function inviterCanAuthorizeInviteRole(
  inviterRole: string | null | undefined,
  inviteRole: OrgRole
): boolean {
  if (!inviterRole || !isOrgRole(inviterRole)) return false
  if (!roleAtLeast(inviterRole, "admin")) return false
  return roleStrictlyAbove(inviterRole, inviteRole)
}

/**
 * Resolve how invite acceptance should affect an existing membership.
 * Never demotes — especially never overwrites `owner` with an invite role.
 */
export function resolveInviteAcceptMembership(
  inviteRole: OrgRole,
  existingRole: string | null | undefined
):
  | { action: "create"; effectiveRole: OrgRole }
  | { action: "keep"; effectiveRole: OrgRole }
  | { action: "upgrade"; effectiveRole: OrgRole; fromRole: OrgRole } {
  if (!existingRole) {
    return { action: "create", effectiveRole: inviteRole }
  }
  if (existingRole === "owner") {
    return { action: "keep", effectiveRole: "owner" }
  }
  if (isOrgRole(existingRole) && roleStrictlyAbove(inviteRole, existingRole)) {
    return {
      action: "upgrade",
      effectiveRole: inviteRole,
      fromRole: existingRole,
    }
  }
  if (isOrgRole(existingRole)) {
    return { action: "keep", effectiveRole: existingRole }
  }
  // Unknown legacy role — do not mutate; surface invite role for audit only.
  return { action: "keep", effectiveRole: inviteRole }
}
