"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { recordAuditEvent } from "@/lib/audit"
import { requireClerkId } from "@/lib/auth/require-actor"
import {
  ensurePersonalOrganization,
  getActiveOrganization,
  isOrgRole,
  matterAccessWhere,
  requireMatterPermission,
  requireMatterPermissionLocked,
  requireWorkProductDeleteLocked,
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
import { destructiveMutationKey } from "@/lib/rate-limit-policy"
import { cleanupStoragePaths } from "@/lib/storage/documents"

const MATTER_CREATE_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const
/** Shared throttle for matter metadata / status edits. */
const MATTER_MUTATION_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const
/** Shared throttle for cascading / work-product deletes. */
const DESTRUCTIVE_MUTATION_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const
const CONVERSATION_RATE_LIMIT = { limit: 40, windowMs: 60_000 } as const
const MESSAGE_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const

function rateLimitMessage(action: string, retryAfterMs: number): string {
  const seconds = Math.ceil(retryAfterMs / 1000)
  return `${action} rate limit reached. Retry in about ${seconds} second${seconds === 1 ? "" : "s"}.`
}

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
  const clerk = await requireClerkId()
  if (!clerk.ok) {
    if (clerk.error === "Authentication required.") redirect("/sign-in")
    return { error: clerk.error }
  }
  const { clerkId } = clerk

  const fields = parseMatterFields(formData)
  if ("error" in fields) return { error: fields.error }

  const practiceArea = optionalEnum(formData.get("practiceArea"), PRACTICE_AREAS)
  const riskLevel = requiredEnum(formData.get("riskLevel"), RISK_LEVELS, "medium")
  const status = requiredEnum(formData.get("status"), STATUSES, "active")

  if (practiceArea === "__invalid__" || !riskLevel || !status) {
    return { error: "Matter metadata contains an unsupported option." }
  }

  let user: { id: string; name: string | null; email: string } | null = null
  try {
    user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, name: true, email: true },
    })
  } catch {
    return { error: "Unable to reach the data layer. Please try again." }
  }

  // Authenticated Clerk without a provisioned app row is a sync failure —
  // surface a structured action error (same as sibling matter mutations).
  if (!user) {
    return { error: "Session not found. Please sign in again." }
  }

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
  let organizationId: string
  try {
    let organization = await getActiveOrganization(user.id)
    if (!organization) {
      // Personal workspace should already exist; recover once then refuse
      // rather than inserting a legacy organizationId:null matter.
      await ensurePersonalOrganization(user)
      organization = await getActiveOrganization(user.id)
    }
    if (!organization) {
      return {
        error:
          "No active organization is available for matter creation. Open Settings to confirm your workspace, then retry.",
      }
    }
    if (!roleHasPermission(organization.role, "write")) {
      return {
        error:
          "Your organization role is read-only. Ask an admin to grant write access before creating matters.",
      }
    }
    organizationId = organization.id
    // Lock Organization before membership so lock order matches org delete /
    // ownership mutations (org → member) and avoids deadlocks. Then lock
    // membership before insert so a concurrent demotion cannot create matters
    // after write permission was revoked.
    matter = await prisma.$transaction(async (tx) => {
      const lockedOrgs = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE
      `
      if (!lockedOrgs[0]) {
        throw new Error("ORGANIZATION_MISSING")
      }

      const lockedMembers = await tx.$queryRaw<Array<{ role: string }>>`
        SELECT role FROM "OrganizationMember"
        WHERE "organizationId" = ${organizationId}
          AND "userId" = ${user.id}
        FOR UPDATE
      `
      const membershipRole = lockedMembers[0]?.role
      if (
        !membershipRole ||
        !isOrgRole(membershipRole) ||
        !roleHasPermission(membershipRole, "write")
      ) {
        throw new Error("INSUFFICIENT_ROLE")
      }

      return tx.matter.create({
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
        select: { id: true },
      })
    })
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_ROLE") {
      return {
        error:
          "Your organization role is read-only. Ask an admin to grant write access before creating matters.",
      }
    }
    if (
      error instanceof Error &&
      (error.message === "ORGANIZATION_MISSING" ||
        error.message === "ACTIVE_ORG_UNAVAILABLE")
    ) {
      return {
        error:
          "The active organization is no longer available. Open Settings to confirm your workspace, then retry.",
      }
    }
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
  const clerk = await requireClerkId()
  if (!clerk.ok) return { error: clerk.error }
  const { clerkId } = clerk

  if (!STATUSES.has(status)) {
    return { error: "Unsupported matter status." }
  }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const throttle = await consumeRateLimit(
      `matter-mutate:${user.id}`,
      MATTER_MUTATION_RATE_LIMIT
    )
    if (!throttle.ok) {
      return { error: rateLimitMessage("Matter update", throttle.retryAfterMs) }
    }

    const permission = await requireMatterPermission(user.id, matterId, "write")
    if (!permission.ok) return { error: permission.error }

    const updated = await prisma.$transaction(async (tx) => {
      const locked = await requireMatterPermissionLocked(
        tx,
        user.id,
        matterId,
        "write"
      )
      if (!locked.ok) {
        throw new Error(`PERMISSION:${locked.error}`)
      }

      const matter = await tx.matter.findUnique({
        where: { id: matterId },
        select: { id: true, title: true },
      })
      if (!matter) {
        throw new Error("PERMISSION:Matter not found or access denied.")
      }

      await tx.matter.update({
        where: { id: matter.id },
        data: { status },
      })

      return { matter, role: locked.access.role }
    })

    await recordAuditEvent({
      userId: user.id,
      action: "matter.status_update",
      entityType: "matter",
      entityId: updated.matter.id,
      matterId: updated.matter.id,
      summary: `Updated matter “${updated.matter.title}” status to ${status.replace(/_/g, " ")}`,
      metadata: { status, role: updated.role },
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PERMISSION:")) {
      return { error: error.message.slice("PERMISSION:".length) }
    }
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
  const clerk = await requireClerkId()
  if (!clerk.ok) return { error: clerk.error }
  const { clerkId } = clerk
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

    const throttle = await consumeRateLimit(
      `matter-mutate:${user.id}`,
      MATTER_MUTATION_RATE_LIMIT
    )
    if (!throttle.ok) {
      return { error: rateLimitMessage("Matter update", throttle.retryAfterMs) }
    }

    const permission = await requireMatterPermission(user.id, matterId, "write")
    if (!permission.ok) return { error: permission.error }

    const updated = await prisma.$transaction(async (tx) => {
      const locked = await requireMatterPermissionLocked(
        tx,
        user.id,
        matterId,
        "write"
      )
      if (!locked.ok) {
        throw new Error(`PERMISSION:${locked.error}`)
      }

      const matter = await tx.matter.findUnique({
        where: { id: matterId },
        select: { id: true },
      })
      if (!matter) {
        throw new Error("PERMISSION:Matter not found or access denied.")
      }

      await tx.matter.update({
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

      return { matterId: matter.id, role: locked.access.role }
    })

    await recordAuditEvent({
      userId: user.id,
      action: "matter.update",
      entityType: "matter",
      entityId: updated.matterId,
      matterId: updated.matterId,
      summary: `Updated matter “${fields.title}” metadata`,
      metadata: { riskLevel, practiceArea, role: updated.role },
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PERMISSION:")) {
      return { error: error.message.slice("PERMISSION:".length) }
    }
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
  const clerk = await requireClerkId()
  if (!clerk.ok) return { error: clerk.error }
  const { clerkId } = clerk
  if (!matterId) return { error: "Matter id is required." }

  let storagePaths: string[] = []
  let deletedTitle = "matter"

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const throttle = await consumeRateLimit(
      destructiveMutationKey(user.id),
      DESTRUCTIVE_MUTATION_RATE_LIMIT
    )
    if (!throttle.ok) {
      return { error: rateLimitMessage("Matter delete", throttle.retryAfterMs) }
    }

    const permission = await requireMatterPermission(user.id, matterId, "delete")
    if (!permission.ok) return { error: permission.error }

    const matter = await prisma.matter.findUnique({
      where: { id: matterId },
      select: {
        id: true,
        title: true,
        _count: { select: { documents: true } },
      },
    })
    if (!matter) return { error: "Matter not found or access denied." }

    deletedTitle = matter.title
    const organizationId = permission.access.organizationId

    // Lock the matter, re-check delete permission, mark deleting, page paths,
    // then cascade-delete inside one transaction so concurrent uploads cannot
    // register after the path scan and revoked actors cannot finish deletes.
    const PATH_PAGE = 200
    await prisma.$transaction(async (tx) => {
      const locked = await requireMatterPermissionLocked(
        tx,
        user.id,
        matter.id,
        "delete"
      )
      if (!locked.ok) {
        throw new Error("MATTER_FORBIDDEN")
      }

      const marked = await tx.matter.updateMany({
        where: {
          id: matter.id,
          status: { not: "deleting" },
        },
        data: { status: "deleting" },
      })
      if (marked.count !== 1) {
        throw new Error("MATTER_ALREADY_DELETING")
      }

      let pathCursor: string | undefined
      for (;;) {
        const page = await tx.document.findMany({
          where: { matterId: matter.id },
          select: { id: true, storagePath: true },
          orderBy: { id: "asc" },
          take: PATH_PAGE,
          ...(pathCursor
            ? { skip: 1, cursor: { id: pathCursor } }
            : {}),
        })
        if (page.length === 0) break
        for (const document of page) {
          if (document.storagePath) storagePaths.push(document.storagePath)
        }
        pathCursor = page[page.length - 1]?.id
        if (page.length < PATH_PAGE) break
      }

      // Delete first, then audit without matterId FK (SetNull would still fail
      // if we pointed at the deleted row). Keep organizationId for org trails.
      await tx.matter.delete({ where: { id: matter.id } })
    })

    await recordAuditEvent({
      userId: user.id,
      action: "matter.delete",
      entityType: "matter",
      entityId: matter.id,
      matterId: null,
      organizationId,
      summary: `Deleted matter “${deletedTitle}”`,
      metadata: {
        documentCount: matter._count.documents,
        role: permission.access.role,
        deletedMatterId: matter.id,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === "MATTER_ALREADY_DELETING") {
      return { error: "This matter is already being deleted. Refresh and try again." }
    }
    if (error instanceof Error && error.message === "MATTER_FORBIDDEN") {
      return { error: "Matter not found or access denied." }
    }
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
  const clerk = await requireClerkId()
  if (!clerk.ok) return { error: clerk.error }
  const { clerkId } = clerk
  if (!matterId) return { error: "Matter id is required." }

  const normalizedTitle = conversationTitle(title)
  if (!normalizedTitle) return { error: "Conversation title is required." }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    // Throttle before matter permission lookups so arbitrary ids cannot fan out DB work.
    const throttle = await consumeRateLimit(
      `conversation-create:${user.id}`,
      CONVERSATION_RATE_LIMIT
    )
    if (!throttle.ok) {
      return {
        error: "Conversation creation rate limit exceeded. Please wait and try again.",
      }
    }

    const permission = await requireMatterPermission(user.id, matterId, "write")
    if (!permission.ok) return { error: permission.error }

    const conversation = await prisma.$transaction(async (tx) => {
      const locked = await requireMatterPermissionLocked(
        tx,
        user.id,
        matterId,
        "write"
      )
      if (!locked.ok) {
        throw new Error(`PERMISSION:${locked.error}`)
      }

      return tx.conversation.create({
        data: {
          matterId: locked.access.matterId,
          title: normalizedTitle,
          createdByUserId: user.id,
        },
        select: { id: true, matterId: true },
      })
    })

    await recordAuditEvent({
      userId: user.id,
      action: "conversation.create",
      entityType: "conversation",
      entityId: conversation.id,
      matterId: conversation.matterId,
      // Omit title — research-spawned threads embed the query, and org-wide
      // Settings activity is visible without a matter lock.
      summary: "Opened conversation",
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PERMISSION:")) {
      return { error: error.message.slice("PERMISSION:".length) }
    }
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
  const clerk = await requireClerkId()
  if (!clerk.ok) return { error: clerk.error }
  const { clerkId } = clerk
  if (!conversationId) return { error: "Conversation id is required." }

  let matterId: string | null = null

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const throttle = await consumeRateLimit(
      destructiveMutationKey(user.id),
      DESTRUCTIVE_MUTATION_RATE_LIMIT
    )
    if (!throttle.ok) {
      return {
        error: rateLimitMessage("Conversation delete", throttle.retryAfterMs),
      }
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        matter: matterAccessWhere(user.id),
      },
      // Omit title — research-spawned threads embed the query in the title.
      select: { id: true, matterId: true, createdByUserId: true },
    })
    if (!conversation) return { error: "Conversation not found or access denied." }

    matterId = conversation.matterId
    await prisma.$transaction(async (tx) => {
      const permission = await requireWorkProductDeleteLocked(
        tx,
        user.id,
        conversation.matterId,
        conversation.createdByUserId
      )
      if (!permission.ok) {
        throw new Error(`PERMISSION:${permission.error}`)
      }

      const deleted = await tx.conversation.deleteMany({
        where: {
          id: conversation.id,
          matterId: conversation.matterId,
        },
      })
      if (deleted.count !== 1) {
        throw new Error("PERMISSION:Conversation not found or access denied.")
      }
    })

    await recordAuditEvent({
      userId: user.id,
      action: "conversation.delete",
      entityType: "conversation",
      entityId: conversation.id,
      matterId: conversation.matterId,
      summary: "Deleted conversation",
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PERMISSION:")) {
      return { error: error.message.slice("PERMISSION:".length) }
    }
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
  const clerk = await requireClerkId()
  if (!clerk.ok) return { error: clerk.error }
  const { clerkId } = clerk
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

    // Throttle before conversation/matter lookups so probing cannot fan out DB work.
    const throttle = await consumeRateLimit(
      `conversation-message:${user.id}`,
      MESSAGE_RATE_LIMIT
    )
    if (!throttle.ok) {
      return {
        error: "Message rate limit exceeded. Please wait and try again.",
      }
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        matter: matterAccessWhere(user.id),
      },
      select: { id: true, matterId: true },
    })
    if (!conversation) return { error: "Conversation not found or access denied." }

    matterId = conversation.matterId
    const message = await prisma.$transaction(async (tx) => {
      const permission = await requireMatterPermissionLocked(
        tx,
        user.id,
        conversation.matterId,
        "write"
      )
      if (!permission.ok) {
        throw new Error(`PERMISSION:${permission.error}`)
      }

      // Re-check under the matter lock so a concurrent delete cannot create an
      // orphaned note against a vanished conversation id.
      const stillThere = await tx.conversation.findFirst({
        where: {
          id: conversation.id,
          matterId: conversation.matterId,
        },
        select: { id: true },
      })
      if (!stillThere) {
        throw new Error("PERMISSION:Conversation not found or access denied.")
      }

      const created = await tx.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: "note",
          content: normalizedContent,
        },
        select: { id: true },
      })
      await tx.matter.update({
        where: { id: conversation.matterId },
        data: { updatedAt: new Date() },
      })
      return created
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
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PERMISSION:")) {
      return { error: error.message.slice("PERMISSION:".length) }
    }
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

export type RestoreConversationMessagesResult = {
  error?: string
  messages?: Array<{
    id: string
    role: string
    content: string
    createdAt: Date
  }>
}

/**
 * Load conversation message bodies under a final locked matter read so list
 * pages can omit saved AI/note content from initial props.
 */
export async function restoreConversationMessages(
  conversationId: string
): Promise<RestoreConversationMessagesResult> {
  const clerk = await requireClerkId()
  if (!clerk.ok) return { error: clerk.error }
  const { clerkId } = clerk
  if (!conversationId) return { error: "Conversation id is required." }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const throttle = await consumeRateLimit(
      `conversation-restore:${user.id}`,
      MESSAGE_RATE_LIMIT
    )
    if (!throttle.ok) {
      return {
        error:
          "Conversation restore rate limit exceeded. Please wait and try again.",
      }
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        matter: matterAccessWhere(user.id),
      },
      select: { id: true, matterId: true },
    })
    if (!conversation) {
      return { error: "Conversation not found or access denied." }
    }

    const messages = await prisma.$transaction(async (tx) => {
      const permission = await requireMatterPermissionLocked(
        tx,
        user.id,
        conversation.matterId,
        "read"
      )
      if (!permission.ok) {
        throw new Error(`PERMISSION:${permission.error}`)
      }

      const stillThere = await tx.conversation.findFirst({
        where: {
          id: conversation.id,
          matterId: conversation.matterId,
        },
        select: { id: true },
      })
      if (!stillThere) {
        throw new Error("PERMISSION:Conversation not found or access denied.")
      }

      return tx.conversationMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
        take: 40,
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
        },
      })
    })

    return { messages }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PERMISSION:")) {
      return { error: error.message.slice("PERMISSION:".length) }
    }
    return { error: "Unable to load conversation messages. Please try again." }
  }
}
