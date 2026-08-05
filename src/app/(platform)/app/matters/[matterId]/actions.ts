"use server"

import { revalidatePath } from "next/cache"

import { recordAuditEvent } from "@/lib/audit"
import {
  resolveDocumentDeleteAuditLabels,
  resolveDocumentReindexAuditLabels,
} from "@/lib/auth/document-audit-labels"
import { requireClerkId } from "@/lib/auth/require-actor"
import { matterAccessWhere, requireMatterPermission, requireMatterPermissionLocked } from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"
import { destructiveMutationKey } from "@/lib/rate-limit-policy"
import { cleanupStoragePaths } from "@/lib/storage/documents"
import {
  claimDocumentForIndexing,
  isIndexingInProgressError,
  isIndexingRunSupersededError,
  runIndexingPipeline,
  type IndexingClaim,
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
async function triggerIndexing(
  documentId: string,
  claim?: IndexingClaim
): Promise<DocumentIndexState> {
  try {
    const result = await runIndexingPipeline(
      documentId,
      claim ? { claim } : {}
    )
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
  let claim: IndexingClaim

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

    // Fast-path deny before opening a transaction.
    const permission = await requireMatterPermission(user.id, matterId, "write")
    if (!permission.ok) return { error: permission.error }

    // Claim the indexing lease under the same locks as matter write auth so a
    // concurrent membership revoke/demotion cannot start a reindex after the
    // unlocked check. Do not reset indexingStatus outside the claim — that
    // would defeat the atomic guard for concurrent in-progress runs.
    // Pre-claim fileName is a probe only — audit labels are re-read under lock
    // after the long indexing pipeline completes.
    const authorized = await prisma.$transaction(async (tx) => {
      const locked = await requireMatterPermissionLocked(
        tx,
        user.id,
        matterId,
        "write"
      )
      if (!locked.ok) {
        throw new Error("MATTER_FORBIDDEN")
      }

      const document = await tx.document.findFirst({
        where: {
          id: documentId,
          matterId,
          matter: matterAccessWhere(user.id),
        },
        select: {
          id: true,
          storagePath: true,
          mimeType: true,
        },
      })
      if (!document) {
        throw new Error("MATTER_FORBIDDEN")
      }
      if (!document.storagePath || !document.mimeType) {
        throw new Error("DOCUMENT_NOT_READY")
      }

      const claimed = await claimDocumentForIndexing(document.id, tx)
      if (!claimed) {
        throw new Error("INDEXING_IN_PROGRESS")
      }

      return { claim: claimed }
    })

    ownerUserId = user.id
    claim = authorized.claim
  } catch (error) {
    if (error instanceof Error && error.message === "MATTER_FORBIDDEN") {
      return { error: "Document not found or access denied." }
    }
    if (error instanceof Error && error.message === "INDEXING_IN_PROGRESS") {
      return {
        error:
          "Indexing is already in progress for this document. Try again after it finishes or stalls.",
      }
    }
    if (error instanceof Error && error.message === "DOCUMENT_NOT_READY") {
      return {
        error:
          "Document is missing storage path or type and cannot be indexed.",
      }
    }
    return { error: "Data layer unreachable. Please try again." }
  }

  const result = await triggerIndexing(documentId, claim)

  // Re-read fileName under Matter FOR UPDATE after the long indexing pipeline
  // so rename-stale / deleted-row probes from the claim txn never reach audit.
  let auditFileName: string | null = null
  try {
    auditFileName = await prisma.$transaction(async (tx) => {
      const locked = await requireMatterPermissionLocked(
        tx,
        ownerUserId,
        matterId,
        "write"
      )
      if (!locked.ok) return null

      const document = await tx.document.findFirst({
        where: {
          id: documentId,
          matterId,
          matter: matterAccessWhere(ownerUserId),
        },
        select: { fileName: true },
      })
      const labels = resolveDocumentReindexAuditLabels({
        lockedFileName: document?.fileName,
      })
      return labels?.fileName ?? null
    })
  } catch {
    auditFileName = null
  }

  await recordAuditEvent({
    userId: ownerUserId,
    action: "document.reindex",
    entityType: "document",
    entityId: documentId,
    matterId,
    summary: result.error
      ? auditFileName
        ? `Requested reindex for “${auditFileName}” (failed)`
        : "Requested document reindex (failed)"
      : auditFileName
        ? `Reindexed document “${auditFileName}”`
        : "Reindexed document",
    metadata: {
      success: !result.error,
      error: result.error ?? null,
      fileNamePresent: Boolean(auditFileName),
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

    // Presence probe before opening the destructive transaction. Labels from
    // this probe must not reach the audit trail — they are re-read under lock.
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        matterId,
        matter: matterAccessWhere(user.id),
      },
      select: { id: true },
    })
    if (!document) return { error: "Document not found or access denied." }

    // Re-check delete permission under a matter lock, capture audit labels from
    // the locked document row, then delete so rename-stale file names never
    // reach the org audit trail (parity with matter-delete label freshness).
    const deleted = await prisma.$transaction(async (tx) => {
      const locked = await requireMatterPermissionLocked(
        tx,
        user.id,
        matterId,
        "delete"
      )
      if (!locked.ok) {
        throw new Error("MATTER_FORBIDDEN")
      }

      const lockedDocument = await tx.document.findFirst({
        where: {
          id: document.id,
          matterId,
          matter: matterAccessWhere(user.id),
        },
        select: { id: true, fileName: true, storagePath: true },
      })
      const auditLabels = resolveDocumentDeleteAuditLabels({
        lockedFileName: lockedDocument?.fileName,
        lockedStoragePath: lockedDocument?.storagePath,
      })
      if (!lockedDocument || !auditLabels) {
        throw new Error("MATTER_FORBIDDEN")
      }

      await tx.document.delete({ where: { id: lockedDocument.id } })
      return { auditLabels, documentId: lockedDocument.id }
    })

    storagePath = deleted.auditLabels.storagePath

    await recordAuditEvent({
      userId: user.id,
      action: "document.delete",
      entityType: "document",
      entityId: deleted.documentId,
      matterId,
      summary: `Deleted document “${deleted.auditLabels.fileName}”`,
    })
  } catch (error) {
    if (error instanceof Error && error.message === "MATTER_FORBIDDEN") {
      return { error: "Document not found or access denied." }
    }
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
