"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { recordAuditEvent } from "@/lib/audit"
import { matterAccessWhere, requireMatterPermission } from "@/lib/auth/rbac"
import {
  ALLOWED_DOCUMENT_MIME,
  detectAllowedDocument,
  hasExpectedSignature,
  MAX_DOCUMENT_BYTES,
  sanitizeUploadName,
} from "@/lib/documents/upload"
import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"
import {
  cleanupStoragePaths,
  ensureBucket,
  uploadToStorage,
} from "@/lib/storage/documents"
import { buildDocumentStoragePath } from "@/lib/storage/paths"
import {
  isIndexingInProgressError,
  isIndexingRunSupersededError,
  runIndexingPipeline,
} from "@/lib/workflows/indexing"

const UPLOAD_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const
const REINDEX_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const

export type DocumentUploadState = {
  error?: string
  success?: boolean
  warning?: string
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

export async function uploadDocument(
  matterId: string,
  _prev: DocumentUploadState,
  formData: FormData
): Promise<DocumentUploadState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }

  // Validate matter write access before buffering the upload body.
  let ownerUserId: string
  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) return { error: "Session not found. Please sign in again." }
    ownerUserId = user.id

    const throttle = await consumeRateLimit(`upload:${user.id}`, UPLOAD_RATE_LIMIT)
    if (!throttle.ok) {
      const seconds = Math.ceil(throttle.retryAfterMs / 1000)
      return {
        error: `Upload rate limit reached. Retry in about ${seconds} second${seconds === 1 ? "" : "s"}.`,
      }
    }

    const permission = await requireMatterPermission(user.id, matterId, "write")
    if (!permission.ok) return { error: permission.error }
  } catch {
    return { error: "Data layer unreachable. Please try again." }
  }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { error: "No file provided." }

  const documentType = detectAllowedDocument(file)
  if (!documentType || !ALLOWED_DOCUMENT_MIME[documentType.mimeType]) {
    return { error: "Unsupported format. Accepted: PDF, DOCX, TXT." }
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { error: "File exceeds the 50 MB ingestion limit." }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (!hasExpectedSignature(documentType.type, buffer)) {
    return { error: "File contents do not match the selected document format." }
  }

  // Ensure storage bucket exists
  try {
    await ensureBucket()
  } catch (e) {
    if (e instanceof Error) {
      console.error("[uploadDocument] ensureBucket", e.message.slice(0, 240))
    }
    return { error: "Document storage is unavailable. Check Supabase configuration." }
  }

  const safeFileName = sanitizeUploadName(file.name).slice(0, 180) || "document"
  const storagePath = buildDocumentStoragePath({
    clerkId,
    matterId,
    fileName: safeFileName,
  })

  const { error: storageErr } = await uploadToStorage(
    storagePath,
    buffer,
    documentType.mimeType
  )
  if (storageErr) {
    console.error("[uploadDocument] storage", storageErr.message.slice(0, 240))
    return { error: "Ingestion failed. Document storage rejected the upload." }
  }

  let documentId: string
  try {
    const created = await prisma.document.create({
      data: {
        matterId,
        fileName: safeFileName,
        storagePath,
        mimeType: documentType.mimeType,
        fileSize: file.size,
        uploadStatus: "uploaded",
        indexingStatus: "pending",
        retrievalStatus: "pending",
      },
    })
    documentId = created.id
  } catch {
    const cleanup = await cleanupStoragePaths([storagePath])
    if (!cleanup.ok) {
      return {
        error:
          "Document registration failed, and storage cleanup also failed. Contact an admin to remove the orphaned upload.",
      }
    }
    return { error: "Document registration failed. Storage entry removed." }
  }

  // Await indexing trigger so uploaders see immediate failure/retry state.
  const indexing = await triggerIndexing(documentId)

  await recordAuditEvent({
    userId: ownerUserId,
    action: "document.upload",
    entityType: "document",
    entityId: documentId,
    matterId,
    summary: `Uploaded document “${file.name}”`,
    metadata: {
      mimeType: documentType.mimeType,
      fileSize: file.size,
      indexingTriggered: !indexing.error,
    },
  })

  revalidatePath(`/app/matters/${matterId}`)
  revalidatePath("/app/documents")
  revalidatePath("/app/workflows")
  revalidatePath("/app/settings")
  return {
    success: true,
    warning: indexing.error
      ? `${indexing.error} The document was saved — use Retry indexing when ready.`
      : indexing.warning,
  }
}

export async function reindexDocument(
  matterId: string,
  documentId: string
): Promise<DocumentIndexState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }

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
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }

  let storagePath: string | null = null

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

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
