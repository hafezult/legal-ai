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
  ORG_ROLES,
  isOrgRole,
  roleAtLeast,
  roleHasPermission,
  roleStrictlyAbove,
  type OrgPermission,
  type OrgRole,
} from "@/lib/auth/roles"
import type { Prisma } from "@prisma/client"

export {
  ORG_ROLES,
  isOrgRole,
  roleAtLeast,
  roleHasPermission,
  roleStrictlyAbove,
}
export type { OrgPermission, OrgRole }

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
 * For organization matters, also lock the actor's OrganizationMember row so a
 * concurrent demotion/removal cannot commit between the permission read and the
 * caller's write (Matter FOR UPDATE alone does not serialize membership changes).
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

  const isCreator = matter.userId === userId
  let membership: OrgRole | null = null

  if (matter.organizationId) {
    const lockedMembers = await tx.$queryRaw<Array<{ role: string }>>`
      SELECT role FROM "OrganizationMember"
      WHERE "organizationId" = ${matter.organizationId}
        AND "userId" = ${userId}
      FOR UPDATE
    `
    const membershipRole = lockedMembers[0]?.role
    membership =
      membershipRole && isOrgRole(membershipRole) ? membershipRole : null
  }

  const role: OrgRole | null = matter.organizationId
    ? membership
    : isCreator
      ? "owner"
      : membership

  if (!role || !roleHasPermission(role, permission)) {
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
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeOrganizationId: true },
  })
  if (!current?.activeOrganizationId) {
    await prisma.user.update({
      where: { id: userId },
      data: { activeOrganizationId: organizationId },
    })
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

  try {
    return await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
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

      await tx.user.update({
        where: { id: user.id },
        data: { activeOrganizationId: organization.id },
      })

      return organization.id
    })
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
      organization: { select: { name: true } },
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
      summary: `Accepted invite to “${invite.organization.name}” as ${claimed.effectiveRole}`,
      metadata: { role: claimed.effectiveRole, via: "auto_email_match" },
    })
  }

  // Never switch activeOrganizationId here — only explicit token Accept may.
  return accepted
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
  | { ok: true; effectiveRole: OrgRole }
  | { ok: false; reason: "conflict" | "unavailable" }
> {
  try {
    return await prisma.$transaction(async (tx) => {
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

      let effectiveRole: OrgRole = args.role

      if (!existing) {
        await tx.organizationMember.create({
          data: {
            organizationId: args.organizationId,
            userId: args.userId,
            role: args.role,
          },
        })
      } else if (existing.role === "owner") {
        effectiveRole = "owner"
      } else if (
        isOrgRole(existing.role) &&
        roleStrictlyAbove(args.role, existing.role)
      ) {
        await tx.organizationMember.update({
          where: { id: existing.id },
          data: { role: args.role },
        })
      } else if (isOrgRole(existing.role)) {
        effectiveRole = existing.role
      }

      if (args.switchActive) {
        await tx.user.update({
          where: { id: args.userId },
          data: { activeOrganizationId: args.organizationId },
        })
      }

      return { ok: true as const, effectiveRole }
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
      organization: { select: { name: true } },
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

  // Conditional delete — CAS on tokenHash so a rotated invite cannot be
  // deleted by a stale decline link.
  const deleted = await prisma.organizationInvite.deleteMany({
    where: {
      id: invite.id,
      tokenHash,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  })
  if (deleted.count !== 1) {
    return {
      ok: false,
      error: "This invite was already accepted, declined, or expired.",
    }
  }

  return {
    ok: true,
    organizationId: invite.organizationId,
    organizationName: invite.organization.name,
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
      organization: { select: { name: true } },
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
    return {
      ok: false,
      error: "This invite was already accepted or expired. Refresh and try again.",
    }
  }

  return {
    ok: true,
    organizationId: invite.organizationId,
    organizationName: invite.organization.name,
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

  try {
    // Lock the organization + actor user so transfer cannot race org delete /
    // last-owned checks, then demote/promote under conditional updates so the
    // org never ends with zero or two owners.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorUserId} FOR UPDATE`

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
    })
  } catch (error) {
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

  const matterCount = membership.organization._count.matters

  try {
    await prisma.$transaction(async (tx) => {
      // Serialize against concurrent ownership transfer and "keep one owned
      // workspace" checks so delete cannot race a transfer mid-flight.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorUserId} FOR UPDATE`

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

      await tx.user.updateMany({
        where: { activeOrganizationId: organizationId },
        data: { activeOrganizationId: null },
      })
      // Org delete SetNulls Matter.organizationId. Preserve an access path for
      // creator-less org matters by assigning the deleting owner as creator.
      await tx.matter.updateMany({
        where: { organizationId, userId: null },
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
    throw error
  }

  // Active-organization repair is lazy via getActiveOrganization on next load —
  // avoid unbounded post-commit N+1 fan-out across every affected user.

  return { ok: true, organizationName, matterCount }
}
