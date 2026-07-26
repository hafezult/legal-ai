"use server"

import { revalidatePath } from "next/cache"

import { recordAuditEvent } from "@/lib/audit"
import { requireClerkId } from "@/lib/auth/require-actor"
import { matterAccessWhere, requireMatterPermission } from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"
import { destructiveMutationKey } from "@/lib/rate-limit-policy"
import { cleanupStoragePaths } from "@/lib/storage/documents"
import {
  isIndexingInProgressError,
  isIndexingRunSupersededError,
  runIndexingPipeline,
} from "@/lib/workflows/indexing"

const REINDEX_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const
const DOCUMENT_DELETE_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const

function rateLimitMessage(action: string, retryAfterMs: number): string {
  const seconds = Math.ceil(retryAfterMs / 1000)
  return `${action} rate limit reached. Retry in about ${seconds} second${seconds === 1 ? "" : "s"}.`
}

export type DocumentIndexState = {
  error?: string
  success?: boolean
  warning?: string
}

export type DocumentDeleteState = {
  error?: string
  success?: boolean
  warning?: string
}

/**
 * Only stamp failure for documents still queued as `pending`.
 * Never overwrite an active/reclaimed lease via unconditional update.
 */
async function markIndexingTriggerFailed(documentId: string) {
  await prisma.document.updateMany({
    where: {
      id: documentId,
      indexingStatus: "pending",
    },
    data: {
      indexingStatus: "failed",
      retrievalStatus: "failed",
    },
  })
}

/** Run the indexing pipeline in-process (no HTTP self-fetch / URL dependency). */
async function triggerIndexing(documentId: string): Promise<DocumentIndexState> {
  try {
    const result = await runIndexingPipeline(documentId)
    if (result.warning) {
      return { success: true, warning: result.warning }
    }
    return { success: true }
  } catch (error) {
    // Concurrent claim conflict / superseded lease — leave the newer run alone.
    if (isIndexingInProgressError(error) || isIndexingRunSupersededError(error)) {
      return {
        error:
          "Indexing is already in progress for this document. Try again after it finishes or stalls.",
      }
    }

    if (error instanceof Error) {
      console.error(`[triggerIndexing/${documentId}]`, error.message.slice(0, 240))
    }
    // Pipeline already stamps failed/pending states for parse/embed errors;
    // only force-fail when the runner itself aborts before status updates.
    const doc = await prisma.document
      .findUnique({
        where: { id: documentId },
        select: { indexingStatus: true, retrievalStatus: true },
      })
      .catch(() => null)

    const active =
      doc &&
      ["parsing", "chunking", "embedding"].includes(doc.indexingStatus)

    if (
      doc &&
      !active &&
      doc.indexingStatus !== "failed" &&
      doc.retrievalStatus !== "failed" &&
      doc.indexingStatus !== "indexed" &&
      doc.indexingStatus !== "retrieval-ready"
    ) {
      await markIndexingTriggerFailed(documentId).catch(() => null)
    }

    return { error: "Indexing failed. Retry from the document workflow queue." }
  }
}

export async function reindexDocument(
  matterId: string,
  documentId: string
): Promise<DocumentIndexState> {
  const clerk = await requireClerkId()
  if (!clerk.ok) return { error: clerk.error }
  const { clerkId } = clerk

  let ownerUserId: string
  let fileName: string

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const throttle = await consumeRateLimit(`reindex:${user.id}`, REINDEX_RATE_LIMIT)
    if (!throttle.ok) {
      const seconds = Math.ceil(throttle.retryAfterMs / 1000)
      return {
        error: `Reindex rate limit reached. Retry in about ${seconds} second${seconds === 1 ? "" : "s"}.`,
      }
    }

    const permission = await requireMatterPermission(user.id, matterId, "write")
    if (!permission.ok) return { error: permission.error }

    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        matterId,
        matter: matterAccessWhere(user.id),
      },
      select: { id: true, fileName: true },
    })
    if (!document) return { error: "Document not found or access denied." }

    // Do not reset indexingStatus here — that would defeat the atomic claim
    // guard in runIndexingPipeline for concurrent in-progress runs. Claim
    // itself resets parse/retrieval when it wins the race.
    ownerUserId = user.id
    fileName = document.fileName
  } catch {
    return { error: "Data layer unreachable. Please try again." }
  }

  const result = await triggerIndexing(documentId)

  await recordAuditEvent({
    userId: ownerUserId,
    action: "document.reindex",
    entityType: "document",
    entityId: documentId,
    matterId,
    summary: result.error
      ? `Requested reindex for “${fileName}” (failed)`
      : `Reindexed document “${fileName}”`,
    metadata: {
      success: !result.error,
      error: result.error ?? null,
    },
  })

  revalidatePath(`/app/matters/${matterId}`)
  revalidatePath(`/app/matters/${matterId}/documents/${documentId}`)
  revalidatePath("/app/documents")
  revalidatePath("/app/workflows")
  revalidatePath("/app/settings")

  return result
}

export async function deleteDocument(
  matterId: string,
  documentId: string
): Promise<DocumentDeleteState> {
  const clerk = await requireClerkId()
  if (!clerk.ok) return { error: clerk.error }
  const { clerkId } = clerk

  let storagePath: string | null = null

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const throttle = await consumeRateLimit(
      destructiveMutationKey(user.id),
      DOCUMENT_DELETE_RATE_LIMIT
    )
    if (!throttle.ok) {
      return { error: rateLimitMessage("Document delete", throttle.retryAfterMs) }
    }

    const permission = await requireMatterPermission(user.id, matterId, "delete")
    if (!permission.ok) return { error: permission.error }

    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        matterId,
        matter: matterAccessWhere(user.id),
      },
      select: { id: true, storagePath: true, fileName: true },
    })
    if (!document) return { error: "Document not found or access denied." }

    storagePath = document.storagePath

    await prisma.document.delete({ where: { id: document.id } })

    await recordAuditEvent({
      userId: user.id,
      action: "document.delete",
      entityType: "document",
      entityId: document.id,
      matterId,
      summary: `Deleted document “${document.fileName}”`,
    })
  } catch {
    return { error: "Data layer unreachable. Please try again." }
  }

  if (storagePath) {
    const cleanup = await cleanupStoragePaths([storagePath])
    if (!cleanup.ok) {
      revalidatePath(`/app/matters/${matterId}`)
      revalidatePath("/app/documents")
      revalidatePath("/app/workflows")
      revalidatePath("/app/memory")
      revalidatePath("/app/settings")
      revalidatePath("/app")
      return {
        success: true,
        warning:
          "Document record removed, but storage cleanup failed. An orphaned file may remain — contact an admin.",
      }
    }
  }

  revalidatePath(`/app/matters/${matterId}`)
  revalidatePath("/app/documents")
  revalidatePath("/app/workflows")
  revalidatePath("/app/memory")
  revalidatePath("/app/settings")
  revalidatePath("/app")

  return { success: true }
}
