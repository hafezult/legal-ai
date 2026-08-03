import { revalidatePath } from "next/cache"

import { recordAuditEvent } from "@/lib/audit"
import { requireMatterPermissionLocked } from "@/lib/auth/rbac"
import {
  ALLOWED_DOCUMENT_MIME,
  detectAllowedDocument,
  hasExpectedSignature,
  MAX_DOCUMENT_BYTES,
  MAX_UPLOAD_REQUEST_BYTES,
  sanitizeUploadName,
} from "@/lib/documents/upload"
import { prisma } from "@/lib/prisma"
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

export type IngestUploadResult = {
  error?: string
  success?: boolean
  warning?: string
  /** True when storage/DB infrastructure failed — callers should surface HTTP 503. */
  unavailable?: boolean
}

export { MAX_UPLOAD_REQUEST_BYTES }
export { ingestUploadHttpStatus } from "@/lib/documents/ingest-upload-status"

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

async function triggerIndexing(documentId: string): Promise<IngestUploadResult> {
  try {
    const result = await runIndexingPipeline(documentId)
    if (result.warning) {
      return { success: true, warning: result.warning }
    }
    return { success: true }
  } catch (error) {
    if (isIndexingInProgressError(error) || isIndexingRunSupersededError(error)) {
      return {
        error:
          "Indexing is already in progress for this document. Try again after it finishes or stalls.",
      }
    }

    if (error instanceof Error) {
      console.error(`[triggerIndexing/${documentId}]`, error.message.slice(0, 240))
    }

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

/** Persist an authenticated, authorized upload and kick off indexing. */
export async function ingestUploadedDocument(args: {
  clerkId: string
  ownerUserId: string
  matterId: string
  file: File
}): Promise<IngestUploadResult> {
  const { clerkId, ownerUserId, matterId, file } = args

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

  try {
    await ensureBucket()
  } catch (e) {
    if (e instanceof Error) {
      console.error("[ingestUploadedDocument] ensureBucket", e.message.slice(0, 240))
    }
    return {
      error: "Document storage is unavailable. Check Supabase configuration.",
      unavailable: true,
    }
  }

  const safeFileName = sanitizeUploadName(file.name).slice(0, 180) || "document"
  const storagePath = buildDocumentStoragePath({
    clerkId,
    matterId,
    fileName: safeFileName,
  })

  // Refuse early when the matter is already mid-delete so we do not upload an
  // object that will never receive a durable document row.
  const matterGate = await prisma.matter.findUnique({
    where: { id: matterId },
    select: { id: true, status: true },
  })
  if (!matterGate || matterGate.status === "deleting") {
    return { error: "Matter not found or is being deleted." }
  }

  const { error: storageErr } = await uploadToStorage(
    storagePath,
    buffer,
    documentType.mimeType
  )
  if (storageErr) {
    console.error("[ingestUploadedDocument] storage", storageErr.message.slice(0, 240))
    return {
      error: "Ingestion failed. Document storage rejected the upload.",
      unavailable: true,
    }
  }

  let documentId: string
  try {
    // Re-check write permission under a matter row lock so registration cannot
    // race deleteMatter / membership revocation after the object was uploaded.
    const created = await prisma.$transaction(async (tx) => {
      const permission = await requireMatterPermissionLocked(
        tx,
        ownerUserId,
        matterId,
        "write"
      )
      if (!permission.ok) {
        throw new Error("MATTER_FORBIDDEN")
      }
      const matter = await tx.matter.findUnique({
        where: { id: matterId },
        select: { id: true, status: true },
      })
      if (!matter || matter.status === "deleting") {
        throw new Error("MATTER_UNAVAILABLE")
      }
      return tx.document.create({
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
    })
    documentId = created.id
  } catch (error) {
    const cleanup = await cleanupStoragePaths([storagePath])
    if (!cleanup.ok) {
      return {
        error:
          "Document registration failed, and storage cleanup also failed. Contact an admin to remove the orphaned upload.",
        unavailable: true,
      }
    }
    if (error instanceof Error && error.message === "MATTER_FORBIDDEN") {
      return { error: "Matter not found or access denied." }
    }
    if (error instanceof Error && error.message === "MATTER_UNAVAILABLE") {
      return { error: "Matter not found or is being deleted." }
    }
    return {
      error: "Document registration failed. Storage entry removed.",
      unavailable: true,
    }
  }

  const indexing = await triggerIndexing(documentId)

  await recordAuditEvent({
    userId: ownerUserId,
    action: "document.upload",
    entityType: "document",
    entityId: documentId,
    matterId,
    summary: `Uploaded document “${safeFileName}”`,
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
