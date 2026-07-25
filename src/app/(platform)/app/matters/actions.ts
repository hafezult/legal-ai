"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { recordAuditEvent } from "@/lib/audit"
import {
  getActiveOrganization,
  matterAccessWhere,
  requireMatterPermission,
  requireWorkProductDelete,
  roleHasPermission,
} from "@/lib/auth/rbac"
import {
  MAX_MATTER_BILLING_CHARS,
  MAX_MATTER_CLIENT_CHARS,
  MAX_MATTER_DESCRIPTION_CHARS,
  MAX_MATTER_JURISDICTION_CHARS,
  MAX_MATTER_TITLE_CHARS,
} from "@/lib/matters/limits"
import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"
import { cleanupStoragePaths } from "@/lib/storage/documents"

const MATTER_CREATE_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const
const CONVERSATION_RATE_LIMIT = { limit: 40, windowMs: 60_000 } as const
const MESSAGE_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const

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

function optionalField(
  value: FormDataEntryValue | null,
  maxChars: number
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: true, value: null }
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: null }
  if (trimmed.length > maxChars) {
    return {
      ok: false,
      error: `Field exceeds the ${maxChars.toLocaleString()} character limit.`,
    }
  }
  return { ok: true, value: trimmed }
}

function requiredTitle(
  value: FormDataEntryValue | null
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "Matter title is required to initialize the workspace." }
  }
  const title = value.trim()
  if (title.length > MAX_MATTER_TITLE_CHARS) {
    return {
      ok: false,
      error: `Matter title exceeds the ${MAX_MATTER_TITLE_CHARS} character limit.`,
    }
  }
  return { ok: true, value: title }
}

function parseMatterFields(formData: FormData, titleRequiredMessage?: string) {
  const titleResult = requiredTitle(formData.get("title"))
  if (!titleResult.ok) {
    return {
      error:
        titleRequiredMessage && titleResult.error.includes("required")
          ? titleRequiredMessage
          : titleResult.error,
    } as const
  }

  const clientName = optionalField(formData.get("clientName"), MAX_MATTER_CLIENT_CHARS)
  if (!clientName.ok) return { error: `Client name: ${clientName.error}` } as const

  const jurisdiction = optionalField(
    formData.get("jurisdiction"),
    MAX_MATTER_JURISDICTION_CHARS
  )
  if (!jurisdiction.ok) return { error: `Jurisdiction: ${jurisdiction.error}` } as const

  const billingCode = optionalField(formData.get("billingCode"), MAX_MATTER_BILLING_CHARS)
  if (!billingCode.ok) return { error: `Billing code: ${billingCode.error}` } as const

  const description = optionalField(
    formData.get("description"),
    MAX_MATTER_DESCRIPTION_CHARS
  )
  if (!description.ok) return { error: `Description: ${description.error}` } as const

  return {
    title: titleResult.value,
    clientName: clientName.value,
    jurisdiction: jurisdiction.value,
    billingCode: billingCode.value,
    description: description.value,
  } as const
}

export async function createMatter(
  _prev: MatterFormState,
  formData: FormData
): Promise<MatterFormState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) redirect("/sign-in")

  const fields = parseMatterFields(formData)
  if ("error" in fields) return { error: fields.error }

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

  const createThrottle = await consumeRateLimit(
    `matter-create:${user.id}`,
    MATTER_CREATE_RATE_LIMIT
  )
  if (!createThrottle.ok) {
    return {
      error: "Matter creation rate limit exceeded. Please wait and try again.",
    }
  }

  let matter: { id: string }
  let organizationId: string | null = null
  try {
    const organization = await getActiveOrganization(user.id)
    if (organization && !roleHasPermission(organization.role, "write")) {
      return {
        error:
          "Your organization role is read-only. Ask an admin to grant write access before creating matters.",
      }
    }
    organizationId = organization?.id ?? null
    matter = await prisma.matter.create({
      data: {
        title: fields.title,
        clientName: fields.clientName,
        practiceArea,
        jurisdiction: fields.jurisdiction,
        riskLevel,
        billingCode: fields.billingCode,
        status,
        description: fields.description,
        userId: user.id,
        organizationId,
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
    organizationId,
    summary: `Created matter “${fields.title}”`,
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

export type MatterUpdateState = {
  error?: string
  success?: boolean
}

export async function updateMatter(
  matterId: string,
  formData: FormData
): Promise<MatterUpdateState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }
  if (!matterId) return { error: "Matter id is required." }

  const fields = parseMatterFields(formData, "Matter title is required.")
  if ("error" in fields) return { error: fields.error }

  const practiceArea = optionalEnum(formData.get("practiceArea"), PRACTICE_AREAS)
  const riskLevel = requiredEnum(formData.get("riskLevel"), RISK_LEVELS, "medium")

  if (practiceArea === "__invalid__" || !riskLevel) {
    return { error: "Matter metadata contains an unsupported option." }
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
      select: { id: true },
    })
    if (!matter) return { error: "Matter not found or access denied." }

    await prisma.matter.update({
      where: { id: matter.id },
      data: {
        title: fields.title,
        clientName: fields.clientName,
        practiceArea,
        jurisdiction: fields.jurisdiction,
        riskLevel,
        billingCode: fields.billingCode,
        description: fields.description,
      },
    })

    await recordAuditEvent({
      userId: user.id,
      action: "matter.update",
      entityType: "matter",
      entityId: matter.id,
      matterId: matter.id,
      summary: `Updated matter “${fields.title}” metadata`,
      metadata: { riskLevel, practiceArea, role: permission.access.role },
    })
  } catch {
    return { error: "Unable to update matter. Please try again." }
  }

  revalidatePath(`/app/matters/${matterId}`)
  revalidatePath("/app/matters")
  revalidatePath("/app/research")
  revalidatePath("/app/drafting")
  revalidatePath("/app/memory")
  revalidatePath("/app/settings")
  revalidatePath("/app")

  return { success: true }
}

export type MatterDeleteState = {
  error?: string
  success?: boolean
  warning?: string
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

    const organizationId = permission.access.organizationId

    // Delete first, then audit without matterId FK (SetNull would still fail
    // if we pointed at the deleted row). Keep organizationId for org trails.
    await prisma.matter.delete({ where: { id: matter.id } })

    await recordAuditEvent({
      userId: user.id,
      action: "matter.delete",
      entityType: "matter",
      entityId: matter.id,
      matterId: null,
      organizationId,
      summary: `Deleted matter “${deletedTitle}”`,
      metadata: {
        documentCount: matter.documents.length,
        role: permission.access.role,
        deletedMatterId: matter.id,
      },
    })
  } catch {
    return { error: "Unable to delete matter. Please try again." }
  }

  let storageWarning: string | undefined
  if (storagePaths.length > 0) {
    const cleanup = await cleanupStoragePaths(storagePaths)
    if (!cleanup.ok) {
      storageWarning = `Matter deleted, but ${cleanup.paths.length} storage object${
        cleanup.paths.length === 1 ? "" : "s"
      } could not be removed. Contact an admin to finish cleanup.`
    }
  }

  revalidatePath("/app/matters")
  revalidatePath("/app/documents")
  revalidatePath("/app/research")
  revalidatePath("/app/memory")
  revalidatePath("/app/workflows")
  revalidatePath("/app/drafting")
  revalidatePath("/app/settings")
  revalidatePath("/app")

  return { success: true, warning: storageWarning }
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

    const throttle = await consumeRateLimit(
      `conversation-create:${user.id}`,
      CONVERSATION_RATE_LIMIT
    )
    if (!throttle.ok) {
      return {
        error: "Conversation creation rate limit exceeded. Please wait and try again.",
      }
    }

    const conversation = await prisma.conversation.create({
      data: {
        matterId: permission.access.matterId,
        title: normalizedTitle,
        createdByUserId: user.id,
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
      select: { id: true, matterId: true, title: true, createdByUserId: true },
    })
    if (!conversation) return { error: "Conversation not found or access denied." }

    const permission = await requireWorkProductDelete(
      user.id,
      conversation.matterId,
      conversation.createdByUserId
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

function normalizeMessageContent(raw: string): string {
  const compact = raw.replace(/\r\n/g, "\n").trim()
  if (!compact) return ""
  return compact.length > 8000 ? `${compact.slice(0, 7997)}…` : compact
}

/** Public note composer — always persists as role "note" (no client-forged roles). */
export async function createConversationMessage(
  conversationId: string,
  content: string
): Promise<ConversationFormState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }
  if (!conversationId) return { error: "Conversation id is required." }

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

    const throttle = await consumeRateLimit(
      `conversation-message:${user.id}`,
      MESSAGE_RATE_LIMIT
    )
    if (!throttle.ok) {
      return {
        error: "Message rate limit exceeded. Please wait and try again.",
      }
    }

    matterId = conversation.matterId
    const message = await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "note",
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
      summary: "Added note message to conversation",
      metadata: {
        role: "note",
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
