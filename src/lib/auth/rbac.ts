import { prisma } from "@/lib/prisma"

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

export function roleHasPermission(role: OrgRole, permission: OrgPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission)
}

/** Prisma `where` clause: matters the user owns or can access via org membership. */
export function matterAccessWhere(userId: string) {
  return {
    OR: [
      { userId },
      { organization: { members: { some: { userId } } } },
    ],
  }
}

export type MatterAccess = {
  matterId: string
  organizationId: string | null
  isCreator: boolean
  role: OrgRole | null
}

/**
 * Resolve matter access for a user. Creators always receive owner-equivalent
 * permissions even if org membership is missing (legacy personal matters).
 */
export async function getMatterAccess(
  userId: string,
  matterId: string
): Promise<MatterAccess | null> {
  const matter = await prisma.matter.findFirst({
    where: {
      id: matterId,
      ...matterAccessWhere(userId),
    },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      organization: {
        select: {
          members: {
            where: { userId },
            select: { role: true },
            take: 1,
          },
        },
      },
    },
  })

  if (!matter) return null

  const isCreator = matter.userId === userId
  const membershipRole = matter.organization?.members[0]?.role
  const role: OrgRole | null = isCreator
    ? "owner"
    : membershipRole && isOrgRole(membershipRole)
      ? membershipRole
      : null

  return {
    matterId: matter.id,
    organizationId: matter.organizationId,
    isCreator,
    role,
  }
}

export async function requireMatterPermission(
  userId: string,
  matterId: string,
  permission: OrgPermission
): Promise<
  | { ok: true; access: MatterAccess }
  | { ok: false; error: string }
> {
  try {
    const access = await getMatterAccess(userId, matterId)
    if (!access) {
      return { ok: false, error: "Matter not found or access denied." }
    }
    if (!access.role || !roleHasPermission(access.role, permission)) {
      return {
        ok: false,
        error: `Insufficient organization role for “${permission}”.`,
      }
    }
    return { ok: true, access }
  } catch {
    return { ok: false, error: "Unable to verify workspace permissions." }
  }
}

/** Primary organization for a user (prefer owned workspace). */
export async function getPrimaryOrganization(userId: string) {
  const owned = await prisma.organizationMember.findFirst({
    where: { userId, role: "owner" },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  })
  if (owned) {
    return { ...owned.organization, role: owned.role as OrgRole }
  }

  const any = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  })
  if (!any) return null
  return { ...any.organization, role: any.role as OrgRole }
}

/**
 * Ensure the user has a personal workspace organization. Idempotent.
 */
export async function ensurePersonalOrganization(user: {
  id: string
  name: string | null
  email: string
}) {
  const existing = await prisma.organizationMember.findFirst({
    where: { userId: user.id, role: "owner" },
    select: { organizationId: true },
  })
  if (existing) return existing.organizationId

  const baseName = user.name?.trim() || user.email.split("@")[0] || "Workspace"
  const name = `${baseName}'s workspace`
  const slugBase = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "workspace"
  const slug = `${slugBase}-${user.id.slice(-6)}`

  const organization = await prisma.organization.create({
    data: {
      name,
      slug,
      members: {
        create: {
          userId: user.id,
          role: "owner",
        },
      },
    },
    select: { id: true },
  })

  return organization.id
}
