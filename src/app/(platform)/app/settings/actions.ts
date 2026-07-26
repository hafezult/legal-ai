"use server"

import { auth, currentUser } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { recordAuditEvent } from "@/lib/audit"
import { selectVerifiedClerkEmails } from "@/lib/auth/clerk-email"
import {
  generateInviteToken,
  hashInviteToken,
  isInviteTokenShape,
} from "@/lib/auth/invite-token"
import {
  acceptOrganizationInviteByToken,
  rejectOrganizationInviteByToken,
  buildInviteAcceptUrl,
  createOwnedOrganization,
  deleteOwnedOrganization,
  getActiveOrganization,
  inviteExpiryDate,
  isOrgRole,
  listUserOrganizations,
  maybePurgeExpiredOrganizationInvites,
  ORG_ROLES,
  roleAtLeast,
  roleStrictlyAbove,
  setActiveOrganization,
  transferOrganizationOwnership,
  type OrgRole,
} from "@/lib/auth/rbac"
import { sendOrganizationInviteEmail } from "@/lib/email/invite"
import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"
import {
  inviteDecisionKey,
  inviteIssuanceKey,
  orgAdminMutationKey,
} from "@/lib/rate-limit-policy"

const INVITE_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const
const INVITE_DECISION_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const
const ORG_CREATE_RATE_LIMIT = { limit: 5, windowMs: 60_000 } as const
/** Active workspace switches — higher than admin mutations (sidebar UX). */
const ORG_SWITCH_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const
/** Shared throttle for destructive / membership org admin mutations. */
const ORG_ADMIN_MUTATION_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const
const MAX_INVITE_EMAIL_CHARS = 320
const INVITE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function rateLimitMessage(action: string, retryAfterMs: number): string {
  const seconds = Math.ceil(retryAfterMs / 1000)
  return `${action} rate limit reached. Retry in about ${seconds} second${seconds === 1 ? "" : "s"}.`
}

function isValidInviteEmail(email: string): boolean {
  return (
    email.length > 0 &&
    email.length <= MAX_INVITE_EMAIL_CHARS &&
    INVITE_EMAIL_RE.test(email)
  )
}

export type OrganizationActionState = {
  error?: string
  success?: boolean
  inviteCreated?: boolean
  inviteUrl?: string
  inviteEmailSent?: boolean
  /** Present when Resend is configured but the outbound send failed. */
  inviteEmailWarning?: string
  organizationId?: string
}

async function requireActor() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." as const }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, email: true, name: true },
  })
  if (!user) return { error: "Session not found. Please sign in again." as const }
  return { user }
}

/**
 * Invite accept/decline authorize against currently verified Clerk emails.
 * Persisted DB email is never an authorize source (stale after revoke / placeholders).
 * All verified addresses on the Clerk account may match the invite target.
 */
async function resolveInviteActorEmails(): Promise<string[]> {
  try {
    const clerkUser = await currentUser()
    if (!clerkUser) return []
    return selectVerifiedClerkEmails(
      clerkUser.emailAddresses.map((entry) => ({
        id: entry.id,
        emailAddress: entry.emailAddress,
        verificationStatus: entry.verification?.status ?? null,
      }))
    )
  } catch {
    return []
  }
}

async function requireOrgAdmin(userId: string, organizationId: string) {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
    select: { role: true },
  })
  if (!membership || !isOrgRole(membership.role)) {
    return { error: "Organization not found or access denied." as const }
  }
  if (!roleAtLeast(membership.role, "admin")) {
    return { error: "Admin role required to manage members." as const }
  }
  return { role: membership.role as OrgRole }
}

export async function createOrganization(
  name: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  const throttle = await consumeRateLimit(
    `org-create:${actor.user.id}`,
    ORG_CREATE_RATE_LIMIT
  )
  if (!throttle.ok) {
    return {
      error: "Organization creation rate limit exceeded. Please wait and try again.",
    }
  }

  try {
    const created = await createOwnedOrganization(actor.user.id, name)
    if ("error" in created) return { error: created.error }

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.create",
      entityType: "organization",
      entityId: created.id,
      organizationId: created.id,
      summary: `Created organization “${created.name}”`,
    })

    revalidatePath("/app", "layout")
    revalidatePath("/app/settings")
    revalidatePath("/app/matters")
    return { success: true, organizationId: created.id }
  } catch {
    return { error: "Unable to create organization. Please try again." }
  }
}

export async function leaveOrganization(
  organizationId: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  const throttle = await consumeRateLimit(
    orgAdminMutationKey(actor.user.id),
    ORG_ADMIN_MUTATION_RATE_LIMIT
  )
  if (!throttle.ok) {
    return { error: rateLimitMessage("Leave organization", throttle.retryAfterMs) }
  }

  try {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: actor.user.id,
        },
      },
      select: {
        id: true,
        role: true,
        organization: { select: { name: true } },
      },
    })
    if (!membership) {
      return { error: "Organization not found or access denied." }
    }
    if (membership.role === "owner") {
      return {
        error:
          "Owners cannot leave. Transfer ownership to another member, or delete the organization from Settings.",
      }
    }

    await prisma.organizationMember.delete({ where: { id: membership.id } })

    const remaining = await listUserOrganizations(actor.user.id)
    const nextActive = remaining[0]?.id ?? null
    await prisma.user.update({
      where: { id: actor.user.id },
      data: { activeOrganizationId: nextActive },
    })

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.leave",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      summary: `Left organization “${membership.organization.name}”`,
    })
  } catch {
    return { error: "Unable to leave organization. Please try again." }
  }

  revalidatePath("/app", "layout")
  revalidatePath("/app/settings")
  revalidatePath("/app/matters")
  return { success: true }
}

export async function acceptInviteByToken(
  token: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  const trimmed = token.trim()
  if (!trimmed) return { error: "Invite token is required." }
  if (!isInviteTokenShape(trimmed)) {
    return { error: "Invite not found or link is invalid." }
  }

  const throttle = await consumeRateLimit(
    inviteDecisionKey(actor.user.id),
    INVITE_DECISION_RATE_LIMIT
  )
  if (!throttle.ok) {
    return { error: rateLimitMessage("Invite accept", throttle.retryAfterMs) }
  }

  try {
    const inviteEmails = await resolveInviteActorEmails()
    if (inviteEmails.length === 0) {
      return {
        error:
          "Verify the email address on your account before accepting an invite.",
      }
    }
    const result = await acceptOrganizationInviteByToken(
      { id: actor.user.id, email: inviteEmails },
      trimmed
    )
    if (!result.ok) return { error: result.error }

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.invite_accept",
      entityType: "organization_invite",
      entityId: result.organizationId,
      organizationId: result.organizationId,
      summary: `Accepted invite to “${result.organizationName}” as ${result.role}`,
      metadata: { role: result.role },
    })

    revalidatePath("/app", "layout")
    revalidatePath("/app/settings")
    revalidatePath("/app/matters")
    return { success: true, organizationId: result.organizationId }
  } catch {
    return { error: "Unable to accept invite. Please try again." }
  }
}

export async function rejectInviteByToken(
  token: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  const trimmed = token.trim()
  if (!trimmed) return { error: "Invite token is required." }
  if (!isInviteTokenShape(trimmed)) {
    return { error: "Invite not found or link is invalid." }
  }

  const throttle = await consumeRateLimit(
    inviteDecisionKey(actor.user.id),
    INVITE_DECISION_RATE_LIMIT
  )
  if (!throttle.ok) {
    return { error: rateLimitMessage("Invite decline", throttle.retryAfterMs) }
  }

  try {
    const inviteEmails = await resolveInviteActorEmails()
    if (inviteEmails.length === 0) {
      return {
        error:
          "Verify the email address on your account before declining an invite.",
      }
    }
    const result = await rejectOrganizationInviteByToken(
      { id: actor.user.id, email: inviteEmails },
      trimmed
    )
    if (!result.ok) return { error: result.error }

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.invite_reject",
      entityType: "organization_invite",
      entityId: result.organizationId,
      organizationId: result.organizationId,
      summary: `Declined invite to “${result.organizationName}”`,
    })

    revalidatePath("/app", "layout")
    revalidatePath("/app/settings")
    return { success: true, organizationId: result.organizationId }
  } catch {
    return { error: "Unable to decline invite. Please try again." }
  }
}

export async function switchActiveOrganization(
  organizationId: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  const throttle = await consumeRateLimit(
    `org-switch:${actor.user.id}`,
    ORG_SWITCH_RATE_LIMIT
  )
  if (!throttle.ok) {
    return { error: rateLimitMessage("Organization switch", throttle.retryAfterMs) }
  }

  try {
    const active = await setActiveOrganization(actor.user.id, organizationId)
    if (!active) {
      return { error: "Organization not found or access denied." }
    }

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.switch",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      summary: `Switched active workspace to “${active.name}”`,
    })
  } catch {
    return { error: "Unable to switch organization. Please try again." }
  }

  revalidatePath("/app", "layout")
  revalidatePath("/app/settings")
  revalidatePath("/app/matters")
  return { success: true }
}

export async function renameOrganization(
  organizationId: string,
  name: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  const trimmed = name.replace(/\s+/g, " ").trim()
  if (!trimmed || trimmed.length < 2) {
    return { error: "Organization name must be at least 2 characters." }
  }
  if (trimmed.length > 80) {
    return { error: "Organization name must be 80 characters or fewer." }
  }

  const throttle = await consumeRateLimit(
    orgAdminMutationKey(actor.user.id),
    ORG_ADMIN_MUTATION_RATE_LIMIT
  )
  if (!throttle.ok) {
    return { error: rateLimitMessage("Rename organization", throttle.retryAfterMs) }
  }

  try {
    const admin = await requireOrgAdmin(actor.user.id, organizationId)
    if ("error" in admin) return { error: admin.error }

    await prisma.organization.update({
      where: { id: organizationId },
      data: { name: trimmed },
    })

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.rename",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      summary: `Renamed organization to “${trimmed}”`,
    })
  } catch {
    return { error: "Unable to rename organization. Please try again." }
  }

  revalidatePath("/app", "layout")
  revalidatePath("/app/settings")
  return { success: true }
}

export async function addOrganizationMember(
  organizationId: string,
  email: string,
  roleInput: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  const emailNormalized = email.trim().toLowerCase()
  if (!isValidInviteEmail(emailNormalized)) {
    return { error: "A valid member email is required." }
  }

  const role: OrgRole = isOrgRole(roleInput) ? roleInput : "member"
  if (role === "owner") {
    return { error: "Owner role cannot be assigned when adding members." }
  }

  const throttle = await consumeRateLimit(
    inviteIssuanceKey(actor.user.id),
    INVITE_RATE_LIMIT
  )
  if (!throttle.ok) {
    return { error: rateLimitMessage("Invite", throttle.retryAfterMs) }
  }

  try {
    const admin = await requireOrgAdmin(actor.user.id, organizationId)
    if ("error" in admin) return { error: admin.error }
    if (!roleStrictlyAbove(admin.role, role)) {
      return { error: "You can only assign roles below your own." }
    }

    // Always mint a pending invite — never force-add an existing user.
    // Membership is granted only via explicit token Accept.
    if (actor.user.email.trim().toLowerCase() === emailNormalized) {
      return { error: "You are already a member of this organization." }
    }

    const target = await prisma.user.findFirst({
      where: { email: { equals: emailNormalized, mode: "insensitive" } },
      select: { id: true },
    })

    if (target) {
      if (target.id === actor.user.id) {
        return { error: "You are already a member of this organization." }
      }

      const existing = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: target.id,
          },
        },
        select: { id: true },
      })
      if (existing) {
        return { error: "That user is already a member of this organization." }
      }
    }

    const pending = await prisma.organizationInvite.findFirst({
      where: {
        organizationId,
        email: { equals: emailNormalized, mode: "insensitive" },
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    })
    if (pending) {
      return {
        error:
          "An invite is already pending for that email. Revoke it before sending another.",
      }
    }

    const token = generateInviteToken()
    const tokenHash = hashInviteToken(token)
    const expiresAt = inviteExpiryDate()
    const inviteUrl = buildInviteAcceptUrl(token)

    await prisma.organizationInvite.upsert({
      where: {
        organizationId_email: {
          organizationId,
          email: emailNormalized,
        },
      },
      create: {
        organizationId,
        email: emailNormalized,
        role,
        tokenHash,
        invitedByUserId: actor.user.id,
        expiresAt,
      },
      update: {
        role,
        tokenHash,
        invitedByUserId: actor.user.id,
        expiresAt,
        acceptedAt: null,
      },
    })

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    })

    const emailResult = await sendOrganizationInviteEmail({
      to: emailNormalized,
      organizationName: organization?.name || "Aether workspace",
      inviteUrl,
      role,
      invitedByName: actor.user.name || actor.user.email,
    })

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.invite_create",
      entityType: "organization_invite",
      entityId: organizationId,
      organizationId,
      summary: `Invited ${emailNormalized} as ${role}`,
      metadata: {
        role,
        expiresAt: expiresAt.toISOString(),
        emailSent: emailResult.sent,
        emailReason: emailResult.sent ? undefined : emailResult.reason,
      },
    })

    maybePurgeExpiredOrganizationInvites()

    revalidatePath("/app/settings")
    return {
      success: true,
      inviteCreated: true,
      inviteUrl,
      inviteEmailSent: emailResult.sent,
      inviteEmailWarning:
        !emailResult.sent && emailResult.reason === "request_failed"
          ? "Invite email could not be delivered. Copy the link or use mailto instead."
          : undefined,
    }
  } catch {
    return { error: "Unable to add member or create invite. Please try again." }
  }
}

export async function transferOwnership(
  organizationId: string,
  targetMemberId: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  const throttle = await consumeRateLimit(
    orgAdminMutationKey(actor.user.id),
    ORG_ADMIN_MUTATION_RATE_LIMIT
  )
  if (!throttle.ok) {
    return { error: rateLimitMessage("Ownership transfer", throttle.retryAfterMs) }
  }

  try {
    const result = await transferOrganizationOwnership(
      actor.user.id,
      organizationId,
      targetMemberId
    )
    if (!result.ok) return { error: result.error }

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.ownership_transfer",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      summary: `Transferred ownership of “${result.organizationName}” to ${result.newOwnerEmail}`,
      metadata: {
        previousOwnerEmail: result.previousOwnerEmail,
        newOwnerEmail: result.newOwnerEmail,
      },
    })

    revalidatePath("/app", "layout")
    revalidatePath("/app/settings")
    revalidatePath("/app/matters")
    return { success: true }
  } catch {
    return { error: "Unable to transfer ownership. Please try again." }
  }
}

export async function deleteOrganization(
  organizationId: string,
  confirmationName: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  const throttle = await consumeRateLimit(
    orgAdminMutationKey(actor.user.id),
    ORG_ADMIN_MUTATION_RATE_LIMIT
  )
  if (!throttle.ok) {
    return { error: rateLimitMessage("Delete organization", throttle.retryAfterMs) }
  }

  try {
    const result = await deleteOwnedOrganization(
      actor.user.id,
      organizationId,
      confirmationName
    )
    if (!result.ok) return { error: result.error }

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.delete",
      entityType: "organization",
      entityId: organizationId,
      organizationId: null,
      summary: `Deleted organization “${result.organizationName}”`,
      metadata: {
        matterCount: result.matterCount,
        deletedOrganizationId: organizationId,
      },
    })

    revalidatePath("/app", "layout")
    revalidatePath("/app/settings")
    revalidatePath("/app/matters")
    return { success: true }
  } catch {
    return { error: "Unable to delete organization. Please try again." }
  }
}

/**
 * Rotate the opaque invite token and return a fresh acceptance URL.
 * Raw tokens are never stored — only the SHA-256 hash — so re-copying a
 * pending invite must mint a new secret.
 */
export async function refreshOrganizationInviteLink(
  organizationId: string,
  inviteId: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  const throttle = await consumeRateLimit(
    inviteIssuanceKey(actor.user.id),
    INVITE_RATE_LIMIT
  )
  if (!throttle.ok) {
    return { error: rateLimitMessage("Invite refresh", throttle.retryAfterMs) }
  }

  try {
    const admin = await requireOrgAdmin(actor.user.id, organizationId)
    if ("error" in admin) return { error: admin.error }

    const invite = await prisma.organizationInvite.findFirst({
      where: {
        id: inviteId,
        organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, email: true, role: true },
    })
    if (!invite) return { error: "Invite not found or already accepted." }
    if (
      !isOrgRole(invite.role) ||
      !roleStrictlyAbove(admin.role, invite.role)
    ) {
      return {
        error: "You can only manage invites for roles below your own.",
      }
    }

    const token = generateInviteToken()
    await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: {
        tokenHash: hashInviteToken(token),
        // Refreshing a pending link also renews the acceptance window so a
        // near-expiry invite does not stay short-lived after rotation.
        expiresAt: inviteExpiryDate(),
      },
    })

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.invite_refresh",
      entityType: "organization_invite",
      entityId: invite.id,
      organizationId,
      summary: "Rotated pending invite acceptance link",
    })

    maybePurgeExpiredOrganizationInvites()

    revalidatePath("/app/settings")
    return {
      success: true,
      inviteUrl: buildInviteAcceptUrl(token),
    }
  } catch {
    return { error: "Unable to refresh invite link. Please try again." }
  }
}

export async function revokeOrganizationInvite(
  organizationId: string,
  inviteId: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  const throttle = await consumeRateLimit(
    orgAdminMutationKey(actor.user.id),
    ORG_ADMIN_MUTATION_RATE_LIMIT
  )
  if (!throttle.ok) {
    return { error: rateLimitMessage("Invite revoke", throttle.retryAfterMs) }
  }

  try {
    const admin = await requireOrgAdmin(actor.user.id, organizationId)
    if ("error" in admin) return { error: admin.error }

    const invite = await prisma.organizationInvite.findFirst({
      where: { id: inviteId, organizationId },
      select: { id: true, email: true, role: true, acceptedAt: true },
    })
    if (!invite) return { error: "Invite not found." }
    if (invite.acceptedAt) {
      return { error: "That invite was already accepted." }
    }
    if (
      !isOrgRole(invite.role) ||
      !roleStrictlyAbove(admin.role, invite.role)
    ) {
      return {
        error: "You can only manage invites for roles below your own.",
      }
    }

    await prisma.organizationInvite.delete({ where: { id: invite.id } })

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.invite_revoke",
      entityType: "organization_invite",
      entityId: invite.id,
      organizationId,
      summary: `Revoked invite for ${invite.email}`,
    })

    maybePurgeExpiredOrganizationInvites()
  } catch {
    return { error: "Unable to revoke invite. Please try again." }
  }

  revalidatePath("/app/settings")
  return { success: true }
}

export async function updateOrganizationMemberRole(
  organizationId: string,
  memberId: string,
  roleInput: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  if (!isOrgRole(roleInput) || roleInput === "owner") {
    return { error: "Role must be viewer, member, or admin." }
  }
  const role = roleInput

  const throttle = await consumeRateLimit(
    orgAdminMutationKey(actor.user.id),
    ORG_ADMIN_MUTATION_RATE_LIMIT
  )
  if (!throttle.ok) {
    return { error: rateLimitMessage("Member role update", throttle.retryAfterMs) }
  }

  try {
    const admin = await requireOrgAdmin(actor.user.id, organizationId)
    if ("error" in admin) return { error: admin.error }

    const member = await prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      select: {
        id: true,
        userId: true,
        role: true,
        user: { select: { email: true } },
      },
    })
    if (!member) return { error: "Member not found." }
    if (member.role === "owner") {
      return { error: "The organization owner role cannot be changed." }
    }
    if (!isOrgRole(member.role) || !roleStrictlyAbove(admin.role, member.role)) {
      return { error: "You can only change roles for members below your own rank." }
    }
    if (!roleStrictlyAbove(admin.role, role)) {
      return { error: "You can only assign roles below your own." }
    }
    if (member.userId === actor.user.id && admin.role !== "owner") {
      return { error: "Admins cannot change their own role." }
    }

    await prisma.organizationMember.update({
      where: { id: member.id },
      data: { role },
    })

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.member_role",
      entityType: "organization_member",
      entityId: member.id,
      organizationId,
      summary: `Updated ${member.user.email} role to ${role}`,
      metadata: { role, previousRole: member.role },
    })
  } catch {
    return { error: "Unable to update member role. Please try again." }
  }

  revalidatePath("/app/settings")
  return { success: true }
}

export async function removeOrganizationMember(
  organizationId: string,
  memberId: string
): Promise<OrganizationActionState> {
  const actor = await requireActor()
  if ("error" in actor) return { error: actor.error }

  const throttle = await consumeRateLimit(
    orgAdminMutationKey(actor.user.id),
    ORG_ADMIN_MUTATION_RATE_LIMIT
  )
  if (!throttle.ok) {
    return { error: rateLimitMessage("Remove member", throttle.retryAfterMs) }
  }

  try {
    const admin = await requireOrgAdmin(actor.user.id, organizationId)
    if ("error" in admin) return { error: admin.error }

    const member = await prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      select: {
        id: true,
        userId: true,
        role: true,
        user: { select: { email: true } },
      },
    })
    if (!member) return { error: "Member not found." }
    if (member.role === "owner") {
      return { error: "The organization owner cannot be removed." }
    }
    if (!isOrgRole(member.role) || !roleStrictlyAbove(admin.role, member.role)) {
      return { error: "You can only remove members below your own rank." }
    }
    if (member.userId === actor.user.id) {
      return { error: "Use a different admin account to remove yourself." }
    }

    await prisma.organizationMember.delete({ where: { id: member.id } })

    const removedUser = await prisma.user.findUnique({
      where: { id: member.userId },
      select: { activeOrganizationId: true },
    })
    if (removedUser?.activeOrganizationId === organizationId) {
      const fallback = await getActiveOrganization(member.userId)
      await prisma.user.update({
        where: { id: member.userId },
        data: { activeOrganizationId: fallback?.id ?? null },
      })
    }

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.member_remove",
      entityType: "organization_member",
      entityId: member.id,
      organizationId,
      summary: `Removed ${member.user.email} from the organization`,
      metadata: { previousRole: member.role },
    })
  } catch {
    return { error: "Unable to remove member. Please try again." }
  }

  revalidatePath("/app/settings")
  return { success: true }
}

export const ASSIGNABLE_ORG_ROLES = ORG_ROLES.filter((role) => role !== "owner")
