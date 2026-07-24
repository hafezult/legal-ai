"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { recordAuditEvent } from "@/lib/audit"
import {
  getActiveOrganization,
  matterAccessWhere,
  requireMatterPermission,
} from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"
import { removeManyFromStorage } from "@/lib/storage/documents"

export type MatterFormState = {
  error?: string
}

const PRACTICE_AREAS = new Set([
  "corporate",
  "litigation",
  "m_and_a",
  "real_estate",
  "finance",
  "intellectual_property",
  "tax",
  "regulatory",
  "employment",
  "other",
])

const RISK_LEVELS = new Set(["low", "medium", "high", "critical"])
const STATUSES = new Set(["active", "on_hold", "closed", "archived"])

function optionalEnum(value: FormDataEntryValue | null, allowed: Set<string>): string | null {
  if (typeof value !== "string" || !value) return null
  return allowed.has(value) ? value : "__invalid__"
}

function requiredEnum(
  value: FormDataEntryValue | null,
  allowed: Set<string>,
  fallback: string
): string | null {
  if (typeof value !== "string" || !value) return fallback
  return allowed.has(value) ? value : null
}

export async function createMatter(
  _prev: MatterFormState,
  formData: FormData
): Promise<MatterFormState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) redirect("/sign-in")

  const title = (formData.get("title") as string | null)?.trim()
  if (!title) {
    return { error: "Matter title is required to initialize the workspace." }
  }

  const practiceArea = optionalEnum(formData.get("practiceArea"), PRACTICE_AREAS)
  const riskLevel = requiredEnum(formData.get("riskLevel"), RISK_LEVELS, "medium")
  const status = requiredEnum(formData.get("status"), STATUSES, "active")

  if (practiceArea === "__invalid__" || !riskLevel || !status) {
    return { error: "Matter metadata contains an unsupported option." }
  }

  let user: { id: string } | null = null
  try {
    user = await prisma.user.findUnique({ where: { clerkId } })
  } catch {
    return { error: "Unable to reach the data layer. Please try again." }
  }

  if (!user) redirect("/sign-in")

  let matter: { id: string }
  try {
    const organization = await getActiveOrganization(user.id)
    matter = await prisma.matter.create({
      data: {
        title,
        clientName: (formData.get("clientName") as string | null)?.trim() || null,
        practiceArea,
        jurisdiction: (formData.get("jurisdiction") as string | null)?.trim() || null,
        riskLevel,
        billingCode: (formData.get("billingCode") as string | null)?.trim() || null,
        status,
        description: (formData.get("description") as string | null)?.trim() || null,
        userId: user.id,
        organizationId: organization?.id ?? null,
      },
    })
  } catch {
    return { error: "Matter initialization failed. Please try again." }
  }

  await recordAuditEvent({
    userId: user.id,
    action: "matter.create",
    entityType: "matter",
    entityId: matter.id,
    matterId: matter.id,
    summary: `Created matter “${title}”`,
    metadata: { status, riskLevel, practiceArea },
  })

  redirect(`/app/matters/${matter.id}`)
}

export type MatterStatusState = {
  error?: string
  success?: boolean
}

export async function updateMatterStatus(
  matterId: string,
  status: string
): Promise<MatterStatusState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }

  if (!STATUSES.has(status)) {
    return { error: "Unsupported matter status." }
  }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const permission = await requireMatterPermission(user.id, matterId, "write")
    if (!permission.ok) return { error: permission.error }

    const matter = await prisma.matter.findUnique({
      where: { id: matterId },
      select: { id: true, title: true },
    })
    if (!matter) return { error: "Matter not found or access denied." }

    await prisma.matter.update({
      where: { id: matter.id },
      data: { status },
    })

    await recordAuditEvent({
      userId: user.id,
      action: "matter.status_update",
      entityType: "matter",
      entityId: matter.id,
      matterId: matter.id,
      summary: `Updated matter “${matter.title}” status to ${status.replace(/_/g, " ")}`,
      metadata: { status, role: permission.access.role },
    })
  } catch {
    return { error: "Unable to update matter status. Please try again." }
  }

  revalidatePath(`/app/matters/${matterId}`)
  revalidatePath("/app/matters")
  revalidatePath("/app/research")
  revalidatePath("/app/settings")
  revalidatePath("/app")

  return { success: true }
}

export type MatterDeleteState = {
  error?: string
  success?: boolean
}

export async function deleteMatter(matterId: string): Promise<MatterDeleteState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }
  if (!matterId) return { error: "Matter id is required." }

  let storagePaths: string[] = []
  let deletedTitle = "matter"

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const permission = await requireMatterPermission(user.id, matterId, "delete")
    if (!permission.ok) return { error: permission.error }

    const matter = await prisma.matter.findUnique({
      where: { id: matterId },
      select: {
        id: true,
        title: true,
        documents: {
          select: { storagePath: true },
        },
      },
    })
    if (!matter) return { error: "Matter not found or access denied." }

    deletedTitle = matter.title
    storagePaths = matter.documents
      .map((document) => document.storagePath)
      .filter((path): path is string => Boolean(path))

    await prisma.matter.delete({ where: { id: matter.id } })

    await recordAuditEvent({
      userId: user.id,
      action: "matter.delete",
      entityType: "matter",
      entityId: matter.id,
      matterId: matter.id,
      summary: `Deleted matter “${deletedTitle}”`,
      metadata: { documentCount: matter.documents.length, role: permission.access.role },
    })
  } catch {
    return { error: "Unable to delete matter. Please try again." }
  }

  if (storagePaths.length > 0) {
    await removeManyFromStorage(storagePaths).catch(() => null)
  }

  revalidatePath("/app/matters")
  revalidatePath("/app/documents")
  revalidatePath("/app/research")
  revalidatePath("/app/memory")
  revalidatePath("/app/workflows")
  revalidatePath("/app/drafting")
  revalidatePath("/app/settings")
  revalidatePath("/app")

  return { success: true }
}

export type ConversationFormState = {
  error?: string
  success?: boolean
}

function conversationTitle(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim()
  if (!compact) return ""
  return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact
}

export async function createConversation(
  matterId: string,
  title: string
): Promise<ConversationFormState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }
  if (!matterId) return { error: "Matter id is required." }

  const normalizedTitle = conversationTitle(title)
  if (!normalizedTitle) return { error: "Conversation title is required." }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const permission = await requireMatterPermission(user.id, matterId, "write")
    if (!permission.ok) return { error: permission.error }

    const conversation = await prisma.conversation.create({
      data: {
        matterId: permission.access.matterId,
        title: normalizedTitle,
      },
      select: { id: true },
    })

    await recordAuditEvent({
      userId: user.id,
      action: "conversation.create",
      entityType: "conversation",
      entityId: conversation.id,
      matterId: permission.access.matterId,
      summary: `Opened conversation “${normalizedTitle}”`,
    })
  } catch {
    return { error: "Unable to create conversation. Please try again." }
  }

  revalidatePath(`/app/matters/${matterId}`)
  revalidatePath("/app/memory")
  revalidatePath("/app/settings")
  revalidatePath("/app")

  return { success: true }
}

export async function deleteConversation(
  conversationId: string
): Promise<ConversationFormState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }
  if (!conversationId) return { error: "Conversation id is required." }

  let matterId: string | null = null

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        matter: matterAccessWhere(user.id),
      },
      select: { id: true, matterId: true, title: true },
    })
    if (!conversation) return { error: "Conversation not found or access denied." }

    const permission = await requireMatterPermission(
      user.id,
      conversation.matterId,
      "write"
    )
    if (!permission.ok) return { error: permission.error }

    matterId = conversation.matterId
    await prisma.conversation.delete({ where: { id: conversation.id } })

    await recordAuditEvent({
      userId: user.id,
      action: "conversation.delete",
      entityType: "conversation",
      entityId: conversation.id,
      matterId: conversation.matterId,
      summary: `Deleted conversation “${conversation.title}”`,
    })
  } catch {
    return { error: "Unable to delete conversation. Please try again." }
  }

  if (matterId) {
    revalidatePath(`/app/matters/${matterId}`)
  }
  revalidatePath("/app/memory")
  revalidatePath("/app/settings")
  revalidatePath("/app")

  return { success: true }
}

const MESSAGE_ROLES = new Set(["user", "assistant", "system", "note"])

function normalizeMessageContent(raw: string): string {
  const compact = raw.replace(/\r\n/g, "\n").trim()
  if (!compact) return ""
  return compact.length > 8000 ? `${compact.slice(0, 7997)}…` : compact
}

export async function createConversationMessage(
  conversationId: string,
  content: string,
  role = "note"
): Promise<ConversationFormState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }
  if (!conversationId) return { error: "Conversation id is required." }

  const normalizedRole = MESSAGE_ROLES.has(role) ? role : "note"
  const normalizedContent = normalizeMessageContent(content)
  if (!normalizedContent) return { error: "Message content is required." }

  let matterId: string | null = null

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        matter: matterAccessWhere(user.id),
      },
      select: { id: true, matterId: true },
    })
    if (!conversation) return { error: "Conversation not found or access denied." }

    const permission = await requireMatterPermission(
      user.id,
      conversation.matterId,
      "write"
    )
    if (!permission.ok) return { error: permission.error }

    matterId = conversation.matterId
    const message = await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: normalizedRole,
        content: normalizedContent,
      },
      select: { id: true },
    })
    await prisma.matter.update({
      where: { id: conversation.matterId },
      data: { updatedAt: new Date() },
    })

    await recordAuditEvent({
      userId: user.id,
      action: "conversation.message_create",
      entityType: "conversation_message",
      entityId: message.id,
      matterId: conversation.matterId,
      summary: `Added ${normalizedRole} message to conversation`,
      metadata: {
        role: normalizedRole,
        conversationId: conversation.id,
        length: normalizedContent.length,
      },
    })
  } catch {
    return { error: "Unable to add message. Please try again." }
  }

  if (matterId) {
    revalidatePath(`/app/matters/${matterId}`)
  }
  revalidatePath("/app/memory")
  revalidatePath("/app/settings")
  revalidatePath("/app")

  return { success: true }
}
