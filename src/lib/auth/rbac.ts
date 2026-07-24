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

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
  role: OrgRole
}

/** All organizations the user belongs to, owners first then join order. */
export async function listUserOrganizations(
  userId: string
): Promise<OrganizationSummary[]> {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }],
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

  const summaries = memberships
    .filter((membership) => isOrgRole(membership.role))
    .map((membership) => ({
      ...membership.organization,
      role: membership.role as OrgRole,
    }))

  return summaries.sort((a, b) => {
    if (a.role === "owner" && b.role !== "owner") return -1
    if (b.role === "owner" && a.role !== "owner") return 1
    return a.name.localeCompare(b.name)
  })
}

/** Primary organization for a user (prefer owned workspace). */
export async function getPrimaryOrganization(
  userId: string
): Promise<OrganizationSummary | null> {
  const organizations = await listUserOrganizations(userId)
  if (organizations.length === 0) return null
  return organizations.find((org) => org.role === "owner") ?? organizations[0]
}

/**
 * Active workspace organization for matter creation and settings.
 * Falls back to the primary org when the stored selection is missing or stale.
 */
export async function getActiveOrganization(
  userId: string
): Promise<OrganizationSummary | null> {
  const organizations = await listUserOrganizations(userId)
  if (organizations.length === 0) return null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeOrganizationId: true },
  })

  const active = user?.activeOrganizationId
    ? organizations.find((org) => org.id === user.activeOrganizationId)
    : null

  if (active) return active

  const primary = organizations.find((org) => org.role === "owner") ?? organizations[0]

  if (user && user.activeOrganizationId !== primary.id) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { activeOrganizationId: primary.id },
      })
    } catch {
      /* Best-effort persistence of the active workspace */
    }
  }

  return primary
}

/** Persist the user's active organization when they hold membership. */
export async function setActiveOrganization(
  userId: string,
  organizationId: string
): Promise<OrganizationSummary | null> {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
    select: {
      role: true,
      organization: {
        select: { id: true, name: true, slug: true },
      },
    },
  })
  if (!membership || !isOrgRole(membership.role)) return null

  await prisma.user.update({
    where: { id: userId },
    data: { activeOrganizationId: organizationId },
  })

  return {
    ...membership.organization,
    role: membership.role,
  }
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
  if (existing) {
    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: { activeOrganizationId: true },
    })
    if (!current?.activeOrganizationId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { activeOrganizationId: existing.organizationId },
      })
    }
    return existing.organizationId
  }

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

  await prisma.user.update({
    where: { id: user.id },
    data: { activeOrganizationId: organization.id },
  })

  return organization.id
}

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14

/** Accept outstanding email invites for a newly synced user. */
export async function acceptPendingOrganizationInvites(user: {
  id: string
  email: string
}) {
  if (!user.email) return 0

  const now = new Date()
  const invites = await prisma.organizationInvite.findMany({
    where: {
      email: { equals: user.email, mode: "insensitive" },
      acceptedAt: null,
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      organizationId: true,
      role: true,
    },
  })

  let accepted = 0
  for (const invite of invites) {
    const role: OrgRole =
      invite.role !== "owner" && isOrgRole(invite.role) ? invite.role : "member"

    const existing = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invite.organizationId,
          userId: user.id,
        },
      },
      select: { id: true },
    })

    if (!existing) {
      await prisma.organizationMember.create({
        data: {
          organizationId: invite.organizationId,
          userId: user.id,
          role,
        },
      })
    }

    await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: now },
    })
    accepted += 1
  }

  return accepted
}

export function inviteExpiryDate(from: Date = new Date()) {
  return new Date(from.getTime() + INVITE_TTL_MS)
}

function slugifyOrganizationName(name: string, salt: string) {
  const slugBase =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "workspace"
  return `${slugBase}-${salt}`
}

/**
 * Create an additional organization owned by the user and switch it active.
 */
export async function createOwnedOrganization(
  userId: string,
  nameInput: string
): Promise<OrganizationSummary | { error: string }> {
  const name = nameInput.replace(/\s+/g, " ").trim()
  if (!name || name.length < 2) {
    return { error: "Organization name must be at least 2 characters." }
  }
  if (name.length > 80) {
    return { error: "Organization name must be 80 characters or fewer." }
  }

  const slug = slugifyOrganizationName(name, `${userId.slice(-4)}${Date.now().toString(36).slice(-4)}`)

  try {
    const organization = await prisma.organization.create({
      data: {
        name,
        slug,
        members: {
          create: {
            userId,
            role: "owner",
          },
        },
      },
      select: { id: true, name: true, slug: true },
    })

    await prisma.user.update({
      where: { id: userId },
      data: { activeOrganizationId: organization.id },
    })

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: "owner",
    }
  } catch {
    return { error: "Unable to create organization. Please try a different name." }
  }
}

/**
 * Accept a pending invite by opaque token when the signed-in user's email matches.
 */
export async function acceptOrganizationInviteByToken(
  user: { id: string; email: string },
  token: string
): Promise<
  | { ok: true; organizationId: string; organizationName: string; role: OrgRole }
  | { ok: false; error: string }
> {
  const invite = await prisma.organizationInvite.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      role: true,
      acceptedAt: true,
      expiresAt: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  })

  if (!invite) {
    return { ok: false, error: "Invite not found or link is invalid." }
  }
  if (invite.acceptedAt) {
    return { ok: false, error: "This invite was already accepted." }
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "This invite has expired." }
  }
  if (!user.email || invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      ok: false,
      error: `Sign in with ${invite.email} to accept this invite.`,
    }
  }

  const role: OrgRole =
    invite.role !== "owner" && isOrgRole(invite.role) ? invite.role : "member"

  const existing = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: invite.organizationId,
        userId: user.id,
      },
    },
    select: { id: true },
  })

  if (!existing) {
    await prisma.organizationMember.create({
      data: {
        organizationId: invite.organizationId,
        userId: user.id,
        role,
      },
    })
  }

  await prisma.organizationInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  })

  await prisma.user.update({
    where: { id: user.id },
    data: { activeOrganizationId: invite.organizationId },
  })

  return {
    ok: true,
    organizationId: invite.organizationId,
    organizationName: invite.organization.name,
    role,
  }
}

/** Absolute invite acceptance URL for sharing / mailto delivery. */
export function buildInviteAcceptUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  )
  return `${base}/app/invites/${token}`
}
