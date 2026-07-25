import { recordAuditEvent } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import {
  ORG_ROLES,
  isOrgRole,
  roleAtLeast,
  roleHasPermission,
  roleStrictlyAbove,
  type OrgPermission,
  type OrgRole,
} from "@/lib/auth/roles"

export {
  ORG_ROLES,
  isOrgRole,
  roleAtLeast,
  roleHasPermission,
  roleStrictlyAbove,
}
export type { OrgPermission, OrgRole }

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

export { canWriteListedMatter } from "@/lib/auth/matter-write"

export type MatterAccess = {
  matterId: string
  organizationId: string | null
  isCreator: boolean
  role: OrgRole | null
}

/**
 * Resolve matter access for a user.
 * Legacy personal matters (organizationId null) grant the creator owner-equivalent
 * permissions. Organization matters always resolve from current membership role.
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
  const membership: OrgRole | null =
    membershipRole && isOrgRole(membershipRole) ? membershipRole : null

  // Org matters: membership is authoritative. Legacy personal matters: creator owns.
  const role: OrgRole | null = matter.organizationId
    ? membership
    : isCreator
      ? "owner"
      : membership

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
      organization: { select: { name: true } },
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
      select: { id: true, role: true },
    })

    let effectiveRole: OrgRole = role

    if (!existing) {
      await prisma.organizationMember.create({
        data: {
          organizationId: invite.organizationId,
          userId: user.id,
          role,
        },
      })
    } else if (existing.role === "owner") {
      effectiveRole = "owner"
    } else if (
      isOrgRole(existing.role) &&
      roleStrictlyAbove(role, existing.role)
    ) {
      // Re-invite with a higher role upgrades the existing membership.
      await prisma.organizationMember.update({
        where: { id: existing.id },
        data: { role },
      })
    } else if (isOrgRole(existing.role)) {
      effectiveRole = existing.role
    }

    await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: now },
    })
    accepted += 1

    await recordAuditEvent({
      userId: user.id,
      action: "organization.invite_accept",
      entityType: "organization_invite",
      entityId: invite.organizationId,
      organizationId: invite.organizationId,
      summary: `Accepted invite to “${invite.organization.name}” as ${effectiveRole}`,
      metadata: { role: effectiveRole, via: "auto_email_match" },
    })
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
    // Do not reveal the invitee email to the wrong signed-in account.
    return {
      ok: false,
      error:
        "Sign in with the email address that received this invite to accept it.",
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
    select: { id: true, role: true },
  })

  let effectiveRole: OrgRole = role

  if (!existing) {
    await prisma.organizationMember.create({
      data: {
        organizationId: invite.organizationId,
        userId: user.id,
        role,
      },
    })
  } else if (existing.role === "owner") {
    effectiveRole = "owner"
  } else if (
    isOrgRole(existing.role) &&
    roleStrictlyAbove(role, existing.role)
  ) {
    await prisma.organizationMember.update({
      where: { id: existing.id },
      data: { role },
    })
  } else if (isOrgRole(existing.role)) {
    effectiveRole = existing.role
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
    role: effectiveRole,
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

/**
 * Transfer organization ownership to another member.
 * The previous owner is demoted to admin.
 */
export async function transferOrganizationOwnership(
  actorUserId: string,
  organizationId: string,
  targetMemberId: string
): Promise<
  | {
      ok: true
      organizationName: string
      previousOwnerEmail: string
      newOwnerEmail: string
    }
  | { ok: false; error: string }
> {
  const actorMembership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: actorUserId },
    },
    select: {
      id: true,
      role: true,
      user: { select: { email: true } },
      organization: { select: { name: true } },
    },
  })

  if (!actorMembership || actorMembership.role !== "owner") {
    return { ok: false, error: "Only the organization owner can transfer ownership." }
  }

  const target = await prisma.organizationMember.findFirst({
    where: { id: targetMemberId, organizationId },
    select: {
      id: true,
      userId: true,
      role: true,
      user: { select: { email: true } },
    },
  })

  if (!target) {
    return { ok: false, error: "Target member not found in this organization." }
  }
  if (target.userId === actorUserId) {
    return { ok: false, error: "You already own this organization." }
  }

  await prisma.$transaction([
    prisma.organizationMember.update({
      where: { id: target.id },
      data: { role: "owner" },
    }),
    prisma.organizationMember.update({
      where: { id: actorMembership.id },
      data: { role: "admin" },
    }),
  ])

  return {
    ok: true,
    organizationName: actorMembership.organization.name,
    previousOwnerEmail: actorMembership.user.email,
    newOwnerEmail: target.user.email,
  }
}

/**
 * Delete an organization owned by the actor.
 * Matters keep their creator ownership with organizationId cleared (SetNull).
 * Requires confirmationName to match the organization name.
 */
export async function deleteOwnedOrganization(
  actorUserId: string,
  organizationId: string,
  confirmationName: string
): Promise<
  | { ok: true; organizationName: string; matterCount: number }
  | { ok: false; error: string }
> {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: actorUserId },
    },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          _count: { select: { matters: true } },
        },
      },
    },
  })

  if (!membership || membership.role !== "owner") {
    return { ok: false, error: "Only the organization owner can delete it." }
  }

  const organizationName = membership.organization.name
  const confirmed = confirmationName.replace(/\s+/g, " ").trim()
  if (!confirmed || confirmed.toLowerCase() !== organizationName.toLowerCase()) {
    return {
      ok: false,
      error: `Type “${organizationName}” exactly to confirm deletion.`,
    }
  }

  const ownedCount = await prisma.organizationMember.count({
    where: { userId: actorUserId, role: "owner" },
  })
  if (ownedCount <= 1) {
    return {
      ok: false,
      error:
        "Create another organization first. You must keep at least one owned workspace.",
    }
  }

  const matterCount = membership.organization._count.matters

  const affectedUsers = await prisma.user.findMany({
    where: { activeOrganizationId: organizationId },
    select: { id: true },
  })

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { activeOrganizationId: organizationId },
      data: { activeOrganizationId: null },
    })
    await tx.organization.delete({ where: { id: organizationId } })
  })

  // Restore valid active workspaces for users who pointed at the deleted org.
  for (const user of affectedUsers) {
    try {
      await getActiveOrganization(user.id)
    } catch {
      /* Best-effort; membership queries still work without a stored selection */
    }
  }

  return { ok: true, organizationName, matterCount }
}
