"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { recordAuditEvent } from "@/lib/audit"
import { matterAccessWhere, requireMatterPermission } from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"
import { ensureBucket, removeFromStorage, uploadToStorage } from "@/lib/storage/documents"
import {
  isIndexingInProgressError,
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
}

export type DocumentDeleteState = {
  error?: string
  success?: boolean
}

const ALLOWED_MIME: Record<string, true> = {
  "application/pdf": true,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
  "text/plain": true,
}

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

const DOCUMENT_TYPES = {
  pdf: {
    extension: ".pdf",
    mimeType: "application/pdf",
  },
  docx: {
    extension: ".docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  txt: {
    extension: ".txt",
    mimeType: "text/plain",
  },
} as const

type DocumentType = keyof typeof DOCUMENT_TYPES

function detectAllowedDocument(file: File): { type: DocumentType; mimeType: string } | null {
  const lowerName = file.name.toLowerCase()
  const match = Object.entries(DOCUMENT_TYPES).find(([, config]) =>
    lowerName.endsWith(config.extension)
  )

  if (!match) return null

  const [type, config] = match as [DocumentType, (typeof DOCUMENT_TYPES)[DocumentType]]
  if (file.type && file.type !== config.mimeType) return null

  return { type, mimeType: config.mimeType }
}

function hasExpectedSignature(type: DocumentType, buffer: Buffer): boolean {
  switch (type) {
    case "pdf":
      return buffer.subarray(0, 5).toString("utf8") === "%PDF-"
    case "docx":
      return (
        buffer.length > 4 &&
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        [0x03, 0x05, 0x07].includes(buffer[2])
      )
    case "txt":
      return !buffer.subarray(0, 1024).includes(0x00)
  }
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120)
}

async function markIndexingTriggerFailed(documentId: string) {
  await prisma.document.update({
    where: { id: documentId },
    data: {
      indexingStatus: "failed",
      retrievalStatus: "failed",
    },
  })
}

/** Run the indexing pipeline in-process (no HTTP self-fetch / URL dependency). */
async function triggerIndexing(documentId: string): Promise<DocumentIndexState> {
  try {
    await runIndexingPipeline(documentId)
    return { success: true }
  } catch (error) {
    // Concurrent claim conflict is expected — leave the active run alone.
    if (isIndexingInProgressError(error)) {
      return {
        error:
          "Indexing is already in progress for this document. Try again after it finishes or stalls.",
      }
    }

    const message =
      error instanceof Error ? error.message.slice(0, 240) : "Indexing failed."
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

    return { error: message }
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
  if (!documentType || !ALLOWED_MIME[documentType.mimeType]) {
    return { error: "Unsupported format. Accepted: PDF, DOCX, TXT." }
  }
  if (file.size > MAX_BYTES) {
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
    const msg = e instanceof Error ? e.message : "Storage not configured."
    return { error: msg }
  }

  const storagePath = `${clerkId}/${matterId}/${Date.now()}-${sanitizeName(file.name)}`

  const { error: storageErr } = await uploadToStorage(
    storagePath,
    buffer,
    documentType.mimeType
  )
  if (storageErr) {
    return { error: `Ingestion failed: ${storageErr.message}` }
  }

  let documentId: string
  try {
    const created = await prisma.document.create({
      data: {
        matterId,
        fileName: file.name,
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
    await removeFromStorage(storagePath).catch(() => null)
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
      : undefined,
  }
}

export async function reindexDocument(
  matterId: string,
  documentId: string
): Promise<DocumentIndexState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }

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

    await recordAuditEvent({
      userId: user.id,
      action: "document.reindex",
      entityType: "document",
      entityId: document.id,
      matterId,
      summary: `Reindexed document “${document.fileName}”`,
    })
  } catch {
    return { error: "Data layer unreachable. Please try again." }
  }

  const result = await triggerIndexing(documentId)

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
    await removeFromStorage(storagePath).catch(() => null)
  }

  revalidatePath(`/app/matters/${matterId}`)
  revalidatePath("/app/documents")
  revalidatePath("/app/workflows")
  revalidatePath("/app/memory")
  revalidatePath("/app/settings")
  revalidatePath("/app")

  return { success: true }
}
