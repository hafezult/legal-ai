"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { recordAuditEvent } from "@/lib/audit"
import {
  isOrgRole,
  ORG_ROLES,
  roleAtLeast,
  type OrgRole,
} from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"

export type OrganizationActionState = {
  error?: string
  success?: boolean
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
      summary: `Renamed organization to “${trimmed}”`,
    })
  } catch {
    return { error: "Unable to rename organization. Please try again." }
  }

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
  if (!emailNormalized || !emailNormalized.includes("@")) {
    return { error: "A valid member email is required." }
  }

  const role: OrgRole = isOrgRole(roleInput) ? roleInput : "member"
  if (role === "owner") {
    return { error: "Owner role cannot be assigned when adding members." }
  }

  try {
    const admin = await requireOrgAdmin(actor.user.id, organizationId)
    if ("error" in admin) return { error: admin.error }

    const target = await prisma.user.findFirst({
      where: { email: { equals: emailNormalized, mode: "insensitive" } },
      select: { id: true, email: true, name: true },
    })
    if (!target) {
      return {
        error:
          "No Aether user found with that email. They must sign in once before being added.",
      }
    }
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

    await prisma.organizationMember.create({
      data: {
        organizationId,
        userId: target.id,
        role,
      },
    })

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.member_add",
      entityType: "organization_member",
      entityId: organizationId,
      summary: `Added ${target.email} as ${role}`,
      metadata: { targetUserId: target.id, role },
    })
  } catch {
    return { error: "Unable to add member. Please try again." }
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
    if (member.userId === actor.user.id) {
      return { error: "Use a different admin account to remove yourself." }
    }

    await prisma.organizationMember.delete({ where: { id: member.id } })

    await recordAuditEvent({
      userId: actor.user.id,
      action: "organization.member_remove",
      entityType: "organization_member",
      entityId: member.id,
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
