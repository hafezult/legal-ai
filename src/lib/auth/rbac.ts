import { randomBytes } from "node:crypto"

import { resolveAppBaseUrl } from "@/lib/app-url"
import { recordAuditEvent } from "@/lib/audit"
import { hashInviteToken, isInviteTokenShape } from "@/lib/auth/invite-token"
import {
  INVITE_PURGE_BATCH_SIZE,
  claimInvitePurgeSlot,
  inviteExpiryDate,
} from "@/lib/auth/invite-retention"
import {
  matterAccessWhere,
  matterAccessWhereForActiveOrg,
} from "@/lib/auth/matter-access"
import { prisma } from "@/lib/prisma"
import {
  lockedMatterRoleAllows,
  resolveMatterRoleFromLockedMembership,
} from "@/lib/auth/matter-permission-lock"
import { decideActiveOrganizationListPublish } from "@/lib/auth/active-org-list-publish"
import { orgDeleteConfirmationMatches } from "@/lib/auth/org-delete-confirm"
import {
  selectActiveOrganizationId,
  sortOrganizationSummaries,
  type OrganizationSummary,
} from "@/lib/auth/organization-roster"
import {
  ORG_ROLES,
  inviterCanAuthorizeInviteRole,
  isOrgRole,
  resolveInviteAcceptMembership,
  roleAtLeast,
  roleHasPermission,
  roleStrictlyAbove,
  type OrgPermission,
  type OrgRole,
} from "@/lib/auth/roles"
import type { Prisma } from "@prisma/client"

export {
  ORG_ROLES,
  inviterCanAuthorizeInviteRole,
  isOrgRole,
  resolveInviteAcceptMembership,
  roleAtLeast,
  roleHasPermission,
  roleStrictlyAbove,
}
export type { OrgPermission, OrgRole }

export {
  selectActiveOrganizationId,
  sortOrganizationSummaries,
  type OrganizationSummary,
} from "@/lib/auth/organization-roster"

export { matterAccessWhere, matterAccessWhereForActiveOrg }

export {
  canDeleteListedMatter,
  canWriteListedMatter,
} from "@/lib/auth/matter-write"

export { canDeleteWorkProduct } from "@/lib/auth/work-product-delete"

export { inviteExpiryDate }

/**
 * Delete expired, unaccepted organization invites (bounded batch).
 * Accepted invites are left alone — they are historical membership evidence.
 */
export async function purgeExpiredOrganizationInvites(
  options: { now?: Date; take?: number } = {}
): Promise<number> {
  const now = options.now ?? new Date()
  const take = options.take ?? INVITE_PURGE_BATCH_SIZE
  const expired = await prisma.organizationInvite.findMany({
    where: {
      acceptedAt: null,
      expiresAt: { lt: now },
    },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take,
  })
  if (expired.length === 0) return 0

  // Re-apply expiry + unaccepted predicates so a concurrent refresh/accept
  // that renews an invite cannot be deleted by a stale purge selection.
  const result = await prisma.organizationInvite.deleteMany({
    where: {
      id: { in: expired.map((row) => row.id) },
      acceptedAt: null,
      expiresAt: { lt: now },
    },
  })
  return result.count
}

/**
 * Best-effort opportunistic purge of expired invites — at most once per
 * process hour so invite mutations stay non-blocking.
 */
export function maybePurgeExpiredOrganizationInvites(): void {
  if (!claimInvitePurgeSlot()) return
  void purgeExpiredOrganizationInvites().catch(() => {
    /* Non-fatal */
  })
}

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

/** Returned when matter permission checks fail due to data-layer outage. */
export const PERMISSION_VERIFY_UNAVAILABLE_ERROR =
  "Unable to verify workspace permissions."

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
    return { ok: false, error: PERMISSION_VERIFY_UNAVAILABLE_ERROR }
  }
}

/**
 * Lock a matter row and re-resolve permission inside the caller's transaction
 * so long-running or check-then-act mutations cannot complete after revocation.
 *
 * For organization matters, lock Organization → OrganizationMember → Matter so
 * lock order matches org delete / ownership / invite writers and avoids
 * deadlocks with Matter-then-Member locking.
 */
export async function requireMatterPermissionLocked(
  tx: Prisma.TransactionClient,
  userId: string,
  matterId: string,
  permission: OrgPermission
): Promise<
  | { ok: true; access: MatterAccess }
  | { ok: false; error: string }
> {
  const peek = await tx.matter.findFirst({
    where: {
      id: matterId,
      ...matterAccessWhere(userId),
    },
    select: {
      id: true,
      organizationId: true,
    },
  })

  if (!peek) {
    return { ok: false, error: "Matter not found or access denied." }
  }

  let membershipRole: string | null | undefined

  if (peek.organizationId) {
    await tx.$queryRaw`
      SELECT id FROM "Organization" WHERE id = ${peek.organizationId} FOR UPDATE
    `
    const lockedMembers = await tx.$queryRaw<Array<{ role: string }>>`
      SELECT role FROM "OrganizationMember"
      WHERE "organizationId" = ${peek.organizationId}
        AND "userId" = ${userId}
      FOR UPDATE
    `
    membershipRole = lockedMembers[0]?.role ?? null
  }

  await tx.$queryRaw`SELECT id FROM "Matter" WHERE id = ${matterId} FOR UPDATE`

  const matter = await tx.matter.findFirst({
    where: {
      id: matterId,
      ...matterAccessWhere(userId),
    },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      status: true,
    },
  })

  if (!matter) {
    return { ok: false, error: "Matter not found or access denied." }
  }

  // Org attach/detach under us would invalidate the membership lock above.
  if (matter.organizationId !== peek.organizationId) {
    return {
      ok: false,
      error: "Matter organization changed concurrently. Retry the request.",
    }
  }

  const isCreator = matter.userId === userId
  const role = resolveMatterRoleFromLockedMembership({
    organizationId: matter.organizationId,
    isCreator,
    membershipRole: matter.organizationId ? membershipRole : null,
  })

  if (!lockedMatterRoleAllows(role, permission) || !role) {
    return {
      ok: false,
      error: `Insufficient organization role for “${permission}”.`,
    }
  }

  return {
    ok: true,
    access: {
      matterId: matter.id,
      organizationId: matter.organizationId,
      isCreator,
      role,
    },
  }
}

/**
 * Delete policy for conversations / research / drafts:
 * - Creators with write may delete their own work product.
 * - Otherwise the actor needs matter `delete` permission (admin/owner).
 * - Legacy rows with no creator require `delete`.
 */
export async function requireWorkProductDelete(
  userId: string,
  matterId: string,
  createdByUserId: string | null | undefined
): Promise<
  | { ok: true; access: MatterAccess }
  | { ok: false; error: string }
> {
  const isCreator = Boolean(createdByUserId && createdByUserId === userId)
  if (isCreator) {
    return requireMatterPermission(userId, matterId, "write")
  }
  return requireMatterPermission(userId, matterId, "delete")
}

/**
 * Locked variant of {@link requireWorkProductDelete} for delete-then-act
 * mutations inside a transaction (serializes against membership revocation).
 */
export async function requireWorkProductDeleteLocked(
  tx: Prisma.TransactionClient,
  userId: string,
  matterId: string,
  createdByUserId: string | null | undefined
): Promise<
  | { ok: true; access: MatterAccess }
  | { ok: false; error: string }
> {
  const isCreator = Boolean(createdByUserId && createdByUserId === userId)
  if (isCreator) {
    return requireMatterPermissionLocked(tx, userId, matterId, "write")
  }
  return requireMatterPermissionLocked(tx, userId, matterId, "delete")
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

  return sortOrganizationSummaries(summaries)
}

/**
 * Shared switcher roster + active workspace under an open transaction.
 *
 * Locks each Organization in sorted id order, then the actor's member row,
 * reads names under those locks, then locks User for activeOrganizationId.
 */
async function verifyUserOrganizationsInTx(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<{
  organizations: OrganizationSummary[]
  activeOrganizationId: string | null
}> {
  const membershipRows = await tx.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true },
  })
  const orgIds = [
    ...new Set(membershipRows.map((row) => row.organizationId)),
  ].sort()

  const verified: OrganizationSummary[] = []
  for (const organizationId of orgIds) {
    const membership = await requireOrganizationMembershipLocked(
      tx,
      userId,
      organizationId
    )
    if (!membership.ok) continue

    const organization = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true },
    })
    if (!organization) continue

    verified.push({
      ...organization,
      role: membership.role,
    })
  }

  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { activeOrganizationId: true },
  })

  const organizations = sortOrganizationSummaries(verified)
  return {
    organizations,
    activeOrganizationId: selectActiveOrganizationId(
      organizations,
      user?.activeOrganizationId
    ),
  }
}

/**
 * Final switcher roster + active workspace under one transaction.
 *
 * Callers must not await further work before serializing the returned roster
 * so concurrent removals cannot leave stale org names/roles in the shell or
 * Settings switcher after a non-final per-row check.
 */
export async function listVerifiedUserOrganizationsWithActive(
  userId: string
): Promise<{
  organizations: OrganizationSummary[]
  activeOrganizationId: string | null
}> {
  try {
    return await prisma.$transaction(async (tx) =>
      verifyUserOrganizationsInTx(tx, userId)
    )
  } catch {
    return { organizations: [], activeOrganizationId: null }
  }
}

export type OrganizationAccessMemberRow = {
  id: string
  role: string
  userId: string
  user: { email: string; name: string | null }
}

export type OrganizationAccessInviteRow = {
  id: string
  email: string
  role: string
  expiresAt: Date
}

async function loadOrganizationAccessDetailInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  organizationId: string
): Promise<
  | {
      ok: true
      role: OrgRole
      name: string
      members: OrganizationAccessMemberRow[]
      invites: OrganizationAccessInviteRow[]
    }
  | { ok: false }
> {
  const membership = await requireOrganizationMembershipLocked(
    tx,
    userId,
    organizationId
  )
  if (!membership.ok) return { ok: false as const }

  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  })
  if (!organization) return { ok: false as const }

  const members = await tx.organizationMember.findMany({
    where: { organizationId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    take: 200,
    select: {
      id: true,
      role: true,
      userId: true,
      user: { select: { email: true, name: true } },
    },
  })

  const canManage = roleHasPermission(membership.role, "manage_members")
  const invites = canManage
    ? await tx.organizationInvite.findMany({
        where: {
          organizationId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
        },
      })
    : []

  return {
    ok: true as const,
    role: membership.role,
    name: organization.name,
    members,
    invites,
  }
}

/**
 * Final locked Settings access roster for one organization.
 *
 * Locks Organization then the actor membership, then reads member/invite rows
 * under those locks. Prefer {@link loadVerifiedSettingsWorkspace} when the
 * switcher roster must not drift across a second await.
 */
export async function loadVerifiedOrganizationAccessDetail(
  userId: string,
  organizationId: string
): Promise<
  | {
      ok: true
      role: OrgRole
      name: string
      members: OrganizationAccessMemberRow[]
      invites: OrganizationAccessInviteRow[]
    }
  | { ok: false }
> {
  try {
    return await prisma.$transaction(async (tx) =>
      loadOrganizationAccessDetailInTx(tx, userId, organizationId)
    )
  } catch {
    return { ok: false }
  }
}

export type SettingsWorkspaceAccess =
  | {
      ok: true
      role: OrgRole
      name: string
      members: OrganizationAccessMemberRow[]
      invites: OrganizationAccessInviteRow[]
    }
  | { ok: false }

/**
 * Final Settings switcher roster + active-org access detail under one
 * transaction.
 *
 * Closing the prior two-step pattern (roster txn, then access-detail txn)
 * prevents non-active org rows from lingering after concurrent removal and
 * keeps the active switcher label aligned with the locked panel name.
 * Serialize from this snapshot with no further awaits.
 */
export async function loadVerifiedSettingsWorkspace(userId: string): Promise<{
  organizations: OrganizationSummary[]
  activeOrganizationId: string | null
  access: SettingsWorkspaceAccess | null
}> {
  try {
    return await prisma.$transaction(async (tx) => {
      const verified = await verifyUserOrganizationsInTx(tx, userId)
      const activeOrganizationId = verified.activeOrganizationId
      if (!activeOrganizationId) {
        return {
          organizations: verified.organizations,
          activeOrganizationId: null,
          access: null,
        }
      }

      const access = await loadOrganizationAccessDetailInTx(
        tx,
        userId,
        activeOrganizationId
      )
      if (!access.ok) {
        return {
          organizations: verified.organizations,
          activeOrganizationId,
          access,
        }
      }

      // Keep switcher label/role for the active org bound to the same locked
      // access snapshot published into the admin panel.
      const organizations = verified.organizations.map((org) =>
        org.id === activeOrganizationId
          ? { ...org, name: access.name, role: access.role }
          : org
      )

      return {
        organizations,
        activeOrganizationId,
        access,
      }
    })
  } catch {
    return {
      organizations: [],
      activeOrganizationId: null,
      access: null,
    }
  }
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
 * Lock Organization then the actor's OrganizationMember row and return the
 * current role. Callers that return admin-only payloads (member emails, invites,
 * health probe details) should re-check with this immediately before serialize
 * so a concurrent demotion cannot fail open.
 *
 * Lock order matches ownership / invite / delete writers: Organization first.
 */
export async function requireOrganizationMembershipLocked(
  tx: Prisma.TransactionClient,
  userId: string,
  organizationId: string
): Promise<
  | { ok: true; role: OrgRole }
  | { ok: false; error: string }
> {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`

  const lockedMembers = await tx.$queryRaw<Array<{ role: string }>>`
    SELECT role FROM "OrganizationMember"
    WHERE "organizationId" = ${organizationId}
      AND "userId" = ${userId}
    FOR UPDATE
  `
  const role = lockedMembers[0]?.role
  if (!role || !isOrgRole(role)) {
    return {
      ok: false,
      error: "Organization membership not found or access denied.",
    }
  }
  return { ok: true, role }
}

/**
 * Final reauth for active-organization read/list pages. Cross-matter registries
 * gather metadata outside a transaction for bounded latency, then call this
 * immediately before serializing props so a concurrent member removal cannot
 * leak stale matter/document titles after the revoke commits.
 *
 * Also requires the locked `User.activeOrganizationId` still equal the gathered
 * organization. Membership alone is not enough — a concurrent workspace switch
 * can leave the actor in the gathered org while shell chrome already shows a
 * different active workspace.
 *
 * Lock order: Organization → OrganizationMember → User.
 */
export async function requireActiveOrganizationReadMembership(
  userId: string,
  organizationId: string | null | undefined
): Promise<
  | { ok: true; role: OrgRole | null }
  | { ok: false; error: string }
> {
  if (!organizationId) return { ok: true, role: null }

  try {
    const locked = await prisma.$transaction(async (tx) => {
      const membership = await requireOrganizationMembershipLocked(
        tx,
        userId,
        organizationId
      )
      if (!membership.ok) return membership

      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { activeOrganizationId: true },
      })

      if (
        !decideActiveOrganizationListPublish({
          gatheredOrganizationId: organizationId,
          lockedActiveOrganizationId: user?.activeOrganizationId,
          membershipOk: true,
        })
      ) {
        return {
          ok: false as const,
          error: "Active organization changed. Refresh and try again.",
        }
      }

      return { ok: true as const, role: membership.role }
    })
    if (!locked.ok) return locked
    return { ok: true, role: locked.role }
  } catch {
    return {
      ok: false,
      error: "Organization membership could not be verified.",
    }
  }
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
    // Repair under the same Organization → member → User lock protocol so a
    // concurrent removal cannot persist a stale active workspace after revoke.
    try {
      await setActiveOrganization(userId, primary.id)
    } catch {
      /* Best-effort persistence of the active workspace */
    }
  }

  return primary
}

/**
 * Persist the user's active organization when they hold membership.
 * Serializes with Organization FOR UPDATE before rewriting activeOrganizationId
 * so concurrent leave/remove/delete cannot report a successful switch after revoke.
 */
export async function setActiveOrganization(
  userId: string,
  organizationId: string
): Promise<OrganizationSummary | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const membership = await requireOrganizationMembershipLocked(
        tx,
        userId,
        organizationId
      )
      if (!membership.ok) return null

      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, slug: true },
      })
      if (!organization) return null

      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
      await tx.user.update({
        where: { id: userId },
        data: { activeOrganizationId: organizationId },
      })

      return {
        ...organization,
        role: membership.role,
      }
    })
  } catch {
    return null
  }
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  )
}

async function activateOwnedOrganizationIfUnset(
  userId: string,
  organizationId: string
) {
  // Serialize with leave/switch/remove active-org writers: Organization →
  // membership proof → User FOR UPDATE before rewriting activeOrganizationId.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
      const membership = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId, userId },
        },
        select: { id: true },
      })
      if (!membership) return

      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
      await tx.user.updateMany({
        where: { id: userId, activeOrganizationId: null },
        data: { activeOrganizationId: organizationId },
      })
    })
  } catch {
    /* Best-effort persistence of the active workspace */
  }
}

/**
 * Ensure the user has a personal workspace organization. Idempotent.
 * Concurrent first-provision callers that race on the deterministic slug
 * recover via P2002 → re-query instead of failing closed as shellLoadFailed.
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
    await activateOwnedOrganizationIfUnset(user.id, existing.organizationId)
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

  const createOwnedWorkspace = async (workspaceSlug: string) =>
    prisma.$transaction(async (tx) => {
      // Serialize concurrent ensureAppUser / personal-org recovery on the User
      // row so two callers cannot dual-provision owned workspaces.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`

      const existingOwned = await tx.organizationMember.findFirst({
        where: { userId: user.id, role: "owner" },
        select: { organizationId: true },
      })
      if (existingOwned) {
        // Only repair a missing active workspace — never clobber a valid switch.
        await tx.user.updateMany({
          where: { id: user.id, activeOrganizationId: null },
          data: { activeOrganizationId: existingOwned.organizationId },
        })
        return existingOwned.organizationId
      }

      const organization = await tx.organization.create({
        data: {
          name,
          slug: workspaceSlug,
          members: {
            create: {
              userId: user.id,
              role: "owner",
            },
          },
        },
        select: { id: true },
      })

      await tx.user.update({
        where: { id: user.id },
        data: { activeOrganizationId: organization.id },
      })

      return organization.id
    })

  try {
    return await createOwnedWorkspace(slug)
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      const raced = await prisma.organizationMember.findFirst({
        where: { userId: user.id, role: "owner" },
        select: { organizationId: true },
      })
      if (raced) {
        await activateOwnedOrganizationIfUnset(user.id, raced.organizationId)
        return raced.organizationId
      }

      // Deterministic slug can remain occupied after transferring the last
      // owned workspace. Provision a unique replacement with nested P2002
      // retry instead of failing every subsequent ensureAppUser call.
      const maxUniqueAttempts = 3
      for (let attempt = 0; attempt < maxUniqueAttempts; attempt++) {
        const uniqueSlug =
          `${slugBase}-${user.id.slice(-6)}-${randomBytes(4).toString("hex")}`.slice(
            0,
            48
          )
        try {
          return await createOwnedWorkspace(uniqueSlug)
        } catch (retryError) {
          if (!isPrismaUniqueViolation(retryError)) throw retryError
          const recovered = await prisma.organizationMember.findFirst({
            where: { userId: user.id, role: "owner" },
            select: { organizationId: true },
          })
          if (recovered) {
            await activateOwnedOrganizationIfUnset(
              user.id,
              recovered.organizationId
            )
            return recovered.organizationId
          }
        }
      }
      throw error
    }
    throw error
  }
}

/**
 * Opt-in helper: accept outstanding email invites without switching the
 * active workspace. Prefer `acceptOrganizationInviteByToken` so users can
 * Decline and so joins never hijack the current workspace.
 */
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
      tokenHash: true,
    },
  })

  let accepted = 0
  for (const invite of invites) {
    const role: OrgRole =
      invite.role !== "owner" && isOrgRole(invite.role) ? invite.role : "member"

    const claimed = await claimOrganizationInviteAcceptance({
      inviteId: invite.id,
      organizationId: invite.organizationId,
      userId: user.id,
      role,
      tokenHash: invite.tokenHash,
      acceptedAt: now,
    })
    if (!claimed.ok) continue

    accepted += 1

    await recordAuditEvent({
      userId: user.id,
      action: "organization.invite_accept",
      entityType: "organization_invite",
      entityId: invite.organizationId,
      organizationId: invite.organizationId,
      summary: `Accepted invite to “${claimed.organizationName}” as ${claimed.effectiveRole}`,
      metadata: { role: claimed.effectiveRole, via: "auto_email_match" },
    })
  }

  // Never switch activeOrganizationId here — only explicit token Accept may.
  return accepted
}

/**
 * Drop pending invites an issuer can no longer authorize after demotion,
 * removal, or ownership transfer. Pass `issuerRole: null` when the issuer
 * left the organization entirely.
 */
export async function purgeUnauthorizedPendingInvites(
  tx: Prisma.TransactionClient,
  organizationId: string,
  issuerUserId: string,
  issuerRole: OrgRole | null
) {
  if (issuerRole === null || !roleAtLeast(issuerRole, "admin")) {
    await tx.organizationInvite.deleteMany({
      where: {
        organizationId,
        invitedByUserId: issuerUserId,
        acceptedAt: null,
      },
    })
    return
  }

  const pending = await tx.organizationInvite.findMany({
    where: {
      organizationId,
      invitedByUserId: issuerUserId,
      acceptedAt: null,
    },
    select: { id: true, role: true },
  })
  const staleIds = pending
    .filter((invite) => {
      const inviteRole: OrgRole =
        invite.role !== "owner" && isOrgRole(invite.role)
          ? invite.role
          : "member"
      return !inviterCanAuthorizeInviteRole(issuerRole, inviteRole)
    })
    .map((invite) => invite.id)
  if (staleIds.length === 0) return
  await tx.organizationInvite.deleteMany({
    where: { id: { in: staleIds } },
  })
}

/**
 * Atomically claim an invite (acceptedAt still null), upsert membership, and
 * mark the invite accepted. Concurrent acceptors lose on the conditional update.
 * When `switchActive` is set, the active workspace update is part of the same
 * transaction so Accept cannot report failure after membership already applied.
 */
async function claimOrganizationInviteAcceptance(args: {
  inviteId: string
  organizationId: string
  userId: string
  role: OrgRole
  /** Must match the token that authorized this accept (blocks rotated links). */
  tokenHash: string
  acceptedAt: Date
  switchActive?: boolean
}): Promise<
  | { ok: true; effectiveRole: OrgRole; organizationName: string }
  | { ok: false; reason: "conflict" | "unavailable" | "stale_authority" }
> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize with ownership transfer / org delete so invite accept cannot
      // demote a concurrently promoted owner (or race last-owner checks).
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${args.organizationId} FOR UPDATE`

      // Re-check issuer mint authority under the org lock so a demoted/removed
      // admin cannot leave a live acceptance link after losing invite rights.
      const inviteRow = await tx.organizationInvite.findFirst({
        where: {
          id: args.inviteId,
          tokenHash: args.tokenHash,
          acceptedAt: null,
          expiresAt: { gt: args.acceptedAt },
        },
        select: { invitedByUserId: true, role: true },
      })
      if (!inviteRow) {
        return { ok: false as const, reason: "conflict" as const }
      }

      const inviteRole: OrgRole =
        inviteRow.role !== "owner" && isOrgRole(inviteRow.role)
          ? inviteRow.role
          : "member"

      const inviterMembership = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: args.organizationId,
            userId: inviteRow.invitedByUserId,
          },
        },
        select: { role: true },
      })
      if (
        !inviterCanAuthorizeInviteRole(inviterMembership?.role, inviteRole)
      ) {
        await tx.organizationInvite.deleteMany({
          where: {
            id: args.inviteId,
            tokenHash: args.tokenHash,
            acceptedAt: null,
          },
        })
        return { ok: false as const, reason: "stale_authority" as const }
      }

      const claimed = await tx.organizationInvite.updateMany({
        where: {
          id: args.inviteId,
          tokenHash: args.tokenHash,
          acceptedAt: null,
          expiresAt: { gt: args.acceptedAt },
        },
        data: { acceptedAt: args.acceptedAt },
      })
      if (claimed.count !== 1) {
        return { ok: false as const, reason: "conflict" as const }
      }

      const existing = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: args.organizationId,
            userId: args.userId,
          },
        },
        select: { id: true, role: true },
      })

      const decision = resolveInviteAcceptMembership(
        inviteRole,
        existing?.role
      )
      let effectiveRole = decision.effectiveRole

      if (decision.action === "create") {
        await tx.organizationMember.create({
          data: {
            organizationId: args.organizationId,
            userId: args.userId,
            role: decision.effectiveRole,
          },
        })
      } else if (decision.action === "upgrade" && existing) {
        // CAS on the evaluated role so a surprising mid-tx change cannot demote.
        const upgraded = await tx.organizationMember.updateMany({
          where: {
            id: existing.id,
            organizationId: args.organizationId,
            role: decision.fromRole,
          },
          data: { role: decision.effectiveRole },
        })
        if (upgraded.count !== 1) {
          const again = await tx.organizationMember.findUnique({
            where: { id: existing.id },
            select: { role: true },
          })
          if (again?.role === "owner") {
            effectiveRole = "owner"
          } else if (again && isOrgRole(again.role)) {
            effectiveRole = again.role
          }
        }
      }

      if (args.switchActive) {
        // Match leave/switch/remove: lock User before rewriting active org so
        // concurrent active-workspace mutations cannot both report success.
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${args.userId} FOR UPDATE`
        await tx.user.update({
          where: { id: args.userId },
          data: { activeOrganizationId: args.organizationId },
        })
      }

      // Publish/audit org name from under the same org lock — never the
      // pre-claim snapshot, which can race a concurrent rename.
      const organization = await tx.organization.findUnique({
        where: { id: args.organizationId },
        select: { name: true },
      })
      if (!organization) {
        return { ok: false as const, reason: "unavailable" as const }
      }

      return {
        ok: true as const,
        effectiveRole,
        organizationName: organization.name,
      }
    })
  } catch {
    return { ok: false, reason: "unavailable" }
  }
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
    return await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
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

      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
      await tx.user.update({
        where: { id: userId },
        data: { activeOrganizationId: organization.id },
      })

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: "owner" as const,
      }
    })
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return {
        error: "Unable to create organization. Please try a different name.",
      }
    }
    return { error: "Unable to create organization. Please try again." }
  }
}

/**
 * Decline a pending invite by opaque token when the signed-in user's email matches.
 * Deletes the invite row so admins can re-invite the same address.
 */
function actorInviteEmails(
  user: { email: string | readonly string[] }
): string[] {
  const raw = Array.isArray(user.email) ? user.email : [user.email]
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of raw) {
    const normalized = entry?.trim().toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function inviteEmailAuthorized(
  user: { email: string | readonly string[] },
  inviteEmail: string
): boolean {
  const target = inviteEmail.trim().toLowerCase()
  if (!target) return false
  return actorInviteEmails(user).includes(target)
}

export async function rejectOrganizationInviteByToken(
  user: { id: string; email: string | readonly string[] },
  token: string
): Promise<
  | { ok: true; organizationId: string; organizationName: string }
  | { ok: false; error: string }
> {
  if (!isInviteTokenShape(token)) {
    return { ok: false, error: "Invite not found or link is invalid." }
  }

  const tokenHash = hashInviteToken(token)
  const invite = await prisma.organizationInvite.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      tokenHash: true,
      acceptedAt: true,
      expiresAt: true,
      organizationId: true,
    },
  })

  if (!invite) {
    return { ok: false, error: "Invite not found or link is invalid." }
  }
  // Email match before accepted/expired details so a leaked token cannot probe
  // invite lifecycle state for the wrong signed-in account. Any verified Clerk
  // address on the actor may authorize (not only the primary).
  if (!inviteEmailAuthorized(user, invite.email)) {
    return {
      ok: false,
      error:
        "Sign in with the email address that received this invite to decline it.",
    }
  }
  if (invite.acceptedAt) {
    return { ok: false, error: "This invite was already accepted." }
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "This invite has expired." }
  }

  // Conditional delete under the org lock, then publish the org name from that
  // same locked read so a concurrent rename cannot leak a stale label.
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${invite.organizationId} FOR UPDATE`

      const deleted = await tx.organizationInvite.deleteMany({
        where: {
          id: invite.id,
          tokenHash,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      })
      if (deleted.count !== 1) {
        return {
          ok: false as const,
          error: "This invite was already accepted, declined, or expired.",
        }
      }

      const organization = await tx.organization.findUnique({
        where: { id: invite.organizationId },
        select: { name: true },
      })
      if (!organization) {
        return {
          ok: false as const,
          error: "Unable to decline invite. Please try again.",
        }
      }

      return {
        ok: true as const,
        organizationId: invite.organizationId,
        organizationName: organization.name,
      }
    })
  } catch {
    return { ok: false, error: "Unable to decline invite. Please try again." }
  }
}

/**
 * Accept a pending invite by opaque token when the signed-in user's email matches.
 */
export async function acceptOrganizationInviteByToken(
  user: { id: string; email: string | readonly string[] },
  token: string
): Promise<
  | { ok: true; organizationId: string; organizationName: string; role: OrgRole }
  | { ok: false; error: string }
> {
  if (!isInviteTokenShape(token)) {
    return { ok: false, error: "Invite not found or link is invalid." }
  }

  const tokenHash = hashInviteToken(token)
  const invite = await prisma.organizationInvite.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      role: true,
      tokenHash: true,
      acceptedAt: true,
      expiresAt: true,
      organizationId: true,
    },
  })

  if (!invite) {
    return { ok: false, error: "Invite not found or link is invalid." }
  }
  // Email match before accepted/expired details so a leaked token cannot probe
  // invite lifecycle state for the wrong signed-in account. Any verified Clerk
  // address on the actor may authorize (not only the primary).
  if (!inviteEmailAuthorized(user, invite.email)) {
    // Do not reveal the invitee email to the wrong signed-in account.
    return {
      ok: false,
      error:
        "Sign in with the email address that received this invite to accept it.",
    }
  }
  if (invite.acceptedAt) {
    return { ok: false, error: "This invite was already accepted." }
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "This invite has expired." }
  }

  const role: OrgRole =
    invite.role !== "owner" && isOrgRole(invite.role) ? invite.role : "member"

  const claimed = await claimOrganizationInviteAcceptance({
    inviteId: invite.id,
    organizationId: invite.organizationId,
    userId: user.id,
    role,
    tokenHash: invite.tokenHash,
    acceptedAt: new Date(),
    switchActive: true,
  })
  if (!claimed.ok) {
    if (claimed.reason === "unavailable") {
      return {
        ok: false,
        error: "Unable to accept invite. Please try again.",
      }
    }
    if (claimed.reason === "stale_authority") {
      return {
        ok: false,
        error:
          "This invite is no longer valid. Ask an organization admin to send a new invitation.",
      }
    }
    return {
      ok: false,
      error: "This invite was already accepted or expired. Refresh and try again.",
    }
  }

  return {
    ok: true,
    organizationId: invite.organizationId,
    organizationName: claimed.organizationName,
    role: claimed.effectiveRole,
  }
}

/** Absolute invite acceptance URL for sharing / mailto delivery. */
export function buildInviteAcceptUrl(token: string) {
  return `${resolveAppBaseUrl()}/app/invites/${token}`
}

/**
 * Transfer organization ownership to another member.
 * The previous owner is demoted to admin.
 * Success payload name/emails are read under Organization + User FOR UPDATE —
 * pre-tx probe values are not authoritative for audit/toast publish.
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

  // Pre-tx probe values are UX/fast-fail only — audit/toast publish uses the
  // locked snapshot captured under Organization + User FOR UPDATE below.
  let organizationName = actorMembership.organization.name
  let previousOwnerEmail = actorMembership.user.email
  let newOwnerEmail = target.user.email

  try {
    // Lock the organization + actor/target users so transfer cannot race org
    // delete / last-owned checks / email renames, then demote/promote under
    // conditional updates so the org never ends with zero or two owners.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
      const userLockIds = [actorUserId, target.userId].sort()
      for (const userLockId of userLockIds) {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userLockId} FOR UPDATE`
      }

      const lockedOrg = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      })
      if (!lockedOrg) {
        throw new Error("CONCURRENT_OWNERSHIP_CHANGE")
      }

      const ownedCount = await tx.organizationMember.count({
        where: { userId: actorUserId, role: "owner" },
      })
      if (ownedCount <= 1) {
        throw new Error("LAST_OWNED_ORGANIZATION")
      }

      const actorStillOwner = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: actorUserId },
        },
        select: { id: true, role: true },
      })
      if (!actorStillOwner || actorStillOwner.role !== "owner") {
        throw new Error("CONCURRENT_OWNERSHIP_CHANGE")
      }

      const targetStillMember = await tx.organizationMember.findFirst({
        where: { id: targetMemberId, organizationId },
        select: { id: true, userId: true, role: true },
      })
      if (!targetStillMember || targetStillMember.userId === actorUserId) {
        throw new Error("CONCURRENT_OWNERSHIP_CHANGE")
      }

      const demoted = await tx.organizationMember.updateMany({
        where: {
          id: actorStillOwner.id,
          organizationId,
          role: "owner",
        },
        data: { role: "admin" },
      })
      if (demoted.count !== 1) {
        throw new Error("CONCURRENT_OWNERSHIP_CHANGE")
      }

      const promoted = await tx.organizationMember.updateMany({
        where: {
          id: targetStillMember.id,
          organizationId,
          role: { not: "owner" },
        },
        data: { role: "owner" },
      })
      if (promoted.count !== 1) {
        throw new Error("CONCURRENT_OWNERSHIP_CHANGE")
      }

      // Former owner is now admin — drop invites they can no longer mint
      // (e.g. pending admin-role links).
      await purgeUnauthorizedPendingInvites(
        tx,
        organizationId,
        actorUserId,
        "admin"
      )

      const lockedActor = await tx.user.findUnique({
        where: { id: actorUserId },
        select: { email: true },
      })
      const lockedTarget = await tx.user.findUnique({
        where: { id: targetStillMember.userId },
        select: { email: true },
      })
      if (!lockedActor?.email || !lockedTarget?.email) {
        throw new Error("CONCURRENT_OWNERSHIP_CHANGE")
      }

      // Publish audit/toast labels from the locked snapshot only.
      organizationName = lockedOrg.name
      previousOwnerEmail = lockedActor.email
      newOwnerEmail = lockedTarget.email
    })
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_OWNED_ORGANIZATION") {
      return {
        ok: false,
        error:
          "Create another organization first. You must keep at least one owned workspace.",
      }
    }
    if (
      error instanceof Error &&
      error.message === "CONCURRENT_OWNERSHIP_CHANGE"
    ) {
      return {
        ok: false,
        error: "Ownership changed concurrently. Refresh and try again.",
      }
    }
    throw error
  }

  return {
    ok: true,
    organizationName,
    previousOwnerEmail,
    newOwnerEmail,
  }
}

/**
 * Delete an organization owned by the actor.
 * Before Organization delete SetNulls Matter.organizationId, every org matter
 * is reassigned to the deleting owner so former creators cannot regain access
 * through the legacy personal-matter path (`userId` + `organizationId: null`).
 * Requires confirmationName to match the organization name under Organization
 * FOR UPDATE — a pre-lock name match alone is not authoritative.
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

  // Fast-fail UX against the unlocked probe; the locked check below is the
  // authoritative gate against concurrent rename.
  const probedName = membership.organization.name
  if (!orgDeleteConfirmationMatches(confirmationName, probedName)) {
    return {
      ok: false,
      error: `Type “${probedName}” exactly to confirm deletion.`,
    }
  }

  let organizationName = probedName
  let matterCount = membership.organization._count.matters

  try {
    await prisma.$transaction(async (tx) => {
      // Serialize against concurrent ownership transfer and "keep one owned
      // workspace" checks so delete cannot race a transfer mid-flight.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorUserId} FOR UPDATE`

      const lockedOrg = await tx.organization.findUnique({
        where: { id: organizationId },
        select: {
          name: true,
          _count: { select: { matters: true } },
        },
      })
      if (!lockedOrg) {
        throw new Error("CONCURRENT_OWNERSHIP_CHANGE")
      }
      // Publish audit/toast names from the locked snapshot only.
      organizationName = lockedOrg.name
      matterCount = lockedOrg._count.matters
      if (!orgDeleteConfirmationMatches(confirmationName, organizationName)) {
        throw new Error("CONFIRMATION_MISMATCH")
      }

      const ownedCount = await tx.organizationMember.count({
        where: { userId: actorUserId, role: "owner" },
      })
      if (ownedCount <= 1) {
        throw new Error("LAST_OWNED_ORGANIZATION")
      }

      const stillOwner = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: actorUserId },
        },
        select: { role: true },
      })
      if (!stillOwner || stillOwner.role !== "owner") {
        throw new Error("CONCURRENT_OWNERSHIP_CHANGE")
      }

      // Lock users who still point at this org before clearing active workspace
      // so a concurrent setActiveOrganization cannot race the bulk null-out.
      await tx.$queryRaw`
        SELECT id FROM "User"
        WHERE "activeOrganizationId" = ${organizationId}
        FOR UPDATE
      `
      await tx.user.updateMany({
        where: { activeOrganizationId: organizationId },
        data: { activeOrganizationId: null },
      })
      // Lock members before matter rewrites so order matches matter permission
      // helpers (Organization → OrganizationMember → Matter).
      await tx.$queryRaw`
        SELECT id FROM "OrganizationMember"
        WHERE "organizationId" = ${organizationId}
        FOR UPDATE
      `
      // Org delete SetNulls Matter.organizationId. Transfer every org matter to
      // the deleting owner first — not only creator-less rows — so a removed
      // former creator cannot regain confidential matter access via the legacy
      // personal-matter predicate after detach.
      await tx.matter.updateMany({
        where: { organizationId },
        data: { userId: actorUserId },
      })
      await tx.organization.delete({ where: { id: organizationId } })
    })
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_OWNED_ORGANIZATION") {
      return {
        ok: false,
        error:
          "Create another organization first. You must keep at least one owned workspace.",
      }
    }
    if (
      error instanceof Error &&
      error.message === "CONCURRENT_OWNERSHIP_CHANGE"
    ) {
      return {
        ok: false,
        error: "Ownership changed concurrently. Refresh and try again.",
      }
    }
    if (error instanceof Error && error.message === "CONFIRMATION_MISMATCH") {
      return {
        ok: false,
        error: `Type “${organizationName}” exactly to confirm deletion.`,
      }
    }
    throw error
  }

  // Active-organization repair is lazy via getActiveOrganization on next load —
  // avoid unbounded post-commit N+1 fan-out across every affected user.

  return { ok: true, organizationName, matterCount }
}
